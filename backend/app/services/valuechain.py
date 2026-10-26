"""Value-chain records that sit on top of sites, trees, and batches.

These writes do not call the FMES adapter.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.domain.errors import DomainError
from app.domain.validation import check_measure
from app.models.entities import (
    Advisory,
    DataOrigin,
    Distribution,
    Farmer,
    GrowthMeasurement,
    Harvest,
    IndividualTree,
    MaintenanceActivity,
    PlantingBatch,
    PlantingSite,
    Sale,
    SeedlingLot,
    Species,
    User,
    UserRole,
)
from app.schemas.valuechain import (
    AdvisoryCreate,
    AnalyticsResponse,
    DistributionCreate,
    DistrictTotal,
    FarmerCreate,
    FarmerLoginCreate,
    GrowthCreate,
    HarvestCreate,
    LotCreate,
    MaintenanceCreate,
    SaleCreate,
    SpeciesTotal,
)
from app.services.common import allocate_code, find_by_request_id, utcnow, write_audit
from app.services.registration import _commit, require_organization


def farmer_for_user(db: Session, user_id: uuid.UUID) -> Farmer | None:
    return db.scalar(select(Farmer).where(Farmer.user_id == user_id))


def open_farmer_login(
    db: Session, actor: User, farmer_id: uuid.UUID, payload: FarmerLoginCreate
) -> User:
    farmer = db.get(Farmer, farmer_id)
    if farmer is None:
        raise DomainError("Farmer was not found.", status_code=404)
    if farmer.user_id is not None:
        raise DomainError("This farmer already has a login.", status_code=409, field="email")
    taken = db.scalar(select(User).where(User.email == payload.email))
    if taken is not None:
        raise DomainError("That email is already in use.", status_code=409, field="email")
    account = User(
        email=payload.email,
        full_name=(payload.full_name or farmer.display_name).strip(),
        password_hash=hash_password(payload.password),
        role=UserRole.farmer.value,
        is_active=True,
    )
    db.add(account)
    db.flush()
    farmer.user_id = account.id
    write_audit(db, actor, "create", "user", account.id, ["email", "role"])
    _commit(db)
    return account


def require_farmer(db: Session, farmer_id: uuid.UUID | None) -> Farmer | None:
    if farmer_id is None:
        return None
    farmer = db.get(Farmer, farmer_id)
    if farmer is None:
        raise DomainError("Farmer was not found.", status_code=422, field="farmer_id")
    return farmer


def _site(db: Session, site_id: uuid.UUID, field: str) -> PlantingSite:
    site = db.get(PlantingSite, site_id)
    if site is None:
        raise DomainError("Planting site was not found.", status_code=422, field=field)
    return site


def _species(db: Session, species_id: uuid.UUID) -> Species:
    species = db.get(Species, species_id)
    if species is None:
        raise DomainError("Species was not found.", status_code=422, field="species_id")
    return species


def _one_planted(db: Session, tree_id: uuid.UUID | None, batch_id: uuid.UUID | None):
    if tree_id is not None:
        tree = db.get(IndividualTree, tree_id)
        if tree is None:
            raise DomainError("Tree was not found.", status_code=422, field="tree_id")
        return tree, None
    batch = db.get(PlantingBatch, batch_id)
    if batch is None:
        raise DomainError("Planting batch was not found.", status_code=422, field="batch_id")
    return None, batch


def _save(db: Session, user: User, row, entity_type: str, fields: list[str]):
    db.add(row)
    db.flush()
    write_audit(db, user, "create", entity_type, row.id, fields)
    row_id = row.id
    model = type(row)
    request_id = row.client_request_id
    try:
        _commit(db)
    except DomainError:
        if request_id:
            raced = find_by_request_id(db, model, request_id)
            if raced is not None:
                return raced, True
        raise
    return db.get(model, row_id), False


def create_farmer(db: Session, user: User, payload: FarmerCreate) -> tuple[Farmer, bool]:
    existing = find_by_request_id(db, Farmer, payload.client_request_id)
    if existing is not None:
        return existing, True
    require_organization(db, payload.organization_id)
    farmer = Farmer(
        public_code=allocate_code(db, Farmer, "FARM"),
        display_name=payload.display_name,
        organization_id=payload.organization_id,
        district=payload.district,
        phone=payload.phone,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
        registered_at=utcnow(),
    )
    return _save(db, user, farmer, "farmer", ["display_name", "district"])


def list_farmers(db: Session) -> list[Farmer]:
    return list(
        db.scalars(
            select(Farmer)
            .options(joinedload(Farmer.organization), joinedload(Farmer.registrar))
            .order_by(Farmer.created_at.desc())
        )
        .unique()
        .all()
    )


def create_lot(db: Session, user: User, payload: LotCreate) -> tuple[SeedlingLot, bool]:
    existing = find_by_request_id(db, SeedlingLot, payload.client_request_id)
    if existing is not None:
        return existing, True
    _site(db, payload.nursery_site_id, "nursery_site_id")
    _species(db, payload.species_id)
    lot = SeedlingLot(
        public_code=allocate_code(db, SeedlingLot, "LOT"),
        nursery_site_id=payload.nursery_site_id,
        species_id=payload.species_id,
        quantity_produced=payload.quantity_produced,
        quantity_remaining=payload.quantity_produced,
        produced_on=payload.produced_on,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, lot, "seedling_lot", ["quantity_produced", "species_id"])


def list_lots(db: Session) -> list[SeedlingLot]:
    return list(
        db.scalars(
            select(SeedlingLot)
            .options(joinedload(SeedlingLot.nursery_site), joinedload(SeedlingLot.species))
            .order_by(SeedlingLot.created_at.desc())
        )
        .unique()
        .all()
    )


def create_distribution(
    db: Session, user: User, payload: DistributionCreate
) -> tuple[Distribution, bool]:
    existing = find_by_request_id(db, Distribution, payload.client_request_id)
    if existing is not None:
        return existing, True
    lot = db.get(SeedlingLot, payload.seedling_lot_id)
    if lot is None:
        raise DomainError("Seedling lot was not found.", status_code=422, field="seedling_lot_id")
    _site(db, payload.destination_site_id, "destination_site_id")
    require_farmer(db, payload.farmer_id)
    if payload.quantity > lot.quantity_remaining:
        raise DomainError(
            f"Only {lot.quantity_remaining} seedlings remain in this lot.",
            status_code=422,
            field="quantity",
        )
    lot.quantity_remaining -= payload.quantity
    row = Distribution(
        public_code=allocate_code(db, Distribution, "DIST"),
        seedling_lot_id=lot.id,
        destination_site_id=payload.destination_site_id,
        farmer_id=payload.farmer_id,
        quantity=payload.quantity,
        distributed_on=payload.distributed_on,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "distribution", ["quantity", "destination_site_id"])


def list_distributions(db: Session) -> list[Distribution]:
    return list(
        db.scalars(
            select(Distribution)
            .options(
                joinedload(Distribution.seedling_lot),
                joinedload(Distribution.destination_site),
                joinedload(Distribution.farmer),
            )
            .order_by(Distribution.created_at.desc())
        )
        .unique()
        .all()
    )


def create_growth(db: Session, user: User, payload: GrowthCreate) -> tuple[GrowthMeasurement, bool]:
    existing = find_by_request_id(db, GrowthMeasurement, payload.client_request_id)
    if existing is not None:
        return existing, True
    _tree, batch = _one_planted(db, payload.tree_id, payload.batch_id)
    if (
        payload.survival_count is not None
        and batch is not None
        and payload.survival_count > batch.quantity
    ):
        raise DomainError(
            "Survival count cannot exceed the batch quantity.",
            status_code=422,
            field="survival_count",
        )
    row = GrowthMeasurement(
        public_code=allocate_code(db, GrowthMeasurement, "GROW"),
        tree_id=payload.tree_id,
        batch_id=payload.batch_id,
        measured_on=payload.measured_on,
        height_m=payload.height_m,
        dbh_cm=payload.dbh_cm,
        survival_count=payload.survival_count,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    saved, replay = _save(
        db, user, row, "growth_measurement", ["height_m", "dbh_cm", "survival_count"]
    )
    return saved, replay


def list_growth(db: Session) -> list[GrowthMeasurement]:
    return list(
        db.scalars(
            select(GrowthMeasurement)
            .options(joinedload(GrowthMeasurement.tree), joinedload(GrowthMeasurement.batch))
            .order_by(GrowthMeasurement.created_at.desc())
        )
        .unique()
        .all()
    )


def create_maintenance(
    db: Session, user: User, payload: MaintenanceCreate
) -> tuple[MaintenanceActivity, bool]:
    existing = find_by_request_id(db, MaintenanceActivity, payload.client_request_id)
    if existing is not None:
        return existing, True
    if payload.tree_id:
        _one_planted(db, payload.tree_id, None)
    elif payload.batch_id:
        _one_planted(db, None, payload.batch_id)
    else:
        _site(db, payload.site_id, "site_id")
    row = MaintenanceActivity(
        public_code=allocate_code(db, MaintenanceActivity, "WORK"),
        tree_id=payload.tree_id,
        batch_id=payload.batch_id,
        site_id=payload.site_id,
        activity_type=payload.activity_type,
        performed_on=payload.performed_on,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "maintenance", ["activity_type"])


def list_maintenance(db: Session) -> list[MaintenanceActivity]:
    return list(
        db.scalars(
            select(MaintenanceActivity)
            .options(
                joinedload(MaintenanceActivity.tree),
                joinedload(MaintenanceActivity.batch),
                joinedload(MaintenanceActivity.site),
            )
            .order_by(MaintenanceActivity.created_at.desc())
        )
        .unique()
        .all()
    )


def create_harvest(db: Session, user: User, payload: HarvestCreate) -> tuple[Harvest, bool]:
    existing = find_by_request_id(db, Harvest, payload.client_request_id)
    if existing is not None:
        return existing, True
    _one_planted(db, payload.tree_id, payload.batch_id)
    row = Harvest(
        public_code=allocate_code(db, Harvest, "HARV"),
        tree_id=payload.tree_id,
        batch_id=payload.batch_id,
        harvested_on=payload.harvested_on,
        quantity=payload.quantity,
        quantity_remaining=payload.quantity,
        unit=payload.unit,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "harvest", ["quantity", "unit"])


def list_harvests(db: Session) -> list[Harvest]:
    return list(
        db.scalars(
            select(Harvest)
            .options(joinedload(Harvest.tree), joinedload(Harvest.batch))
            .order_by(Harvest.created_at.desc())
        )
        .unique()
        .all()
    )


def create_sale(db: Session, user: User, payload: SaleCreate) -> tuple[Sale, bool]:
    existing = find_by_request_id(db, Sale, payload.client_request_id)
    if existing is not None:
        return existing, True
    harvest = db.get(Harvest, payload.harvest_id)
    if harvest is None:
        raise DomainError("Harvest was not found.", status_code=422, field="harvest_id")
    try:
        check_measure(payload.quantity, harvest.unit)
    except ValueError as exc:
        raise DomainError(str(exc), status_code=422, field="quantity") from exc
    if payload.quantity > harvest.quantity_remaining + 1e-6:
        raise DomainError(
            f"Only {harvest.quantity_remaining:g} {harvest.unit} remain from this harvest.",
            status_code=422,
            field="quantity",
        )
    remaining = harvest.quantity_remaining - payload.quantity
    harvest.quantity_remaining = 0 if remaining < 1e-6 else remaining
    row = Sale(
        public_code=allocate_code(db, Sale, "SALE"),
        harvest_id=harvest.id,
        sold_on=payload.sold_on,
        quantity=payload.quantity,
        unit=harvest.unit,
        amount_rwf=payload.amount_rwf,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "sale", ["quantity", "amount_rwf"])


def list_sales(db: Session) -> list[Sale]:
    return list(
        db.scalars(select(Sale).options(joinedload(Sale.harvest)).order_by(Sale.created_at.desc()))
        .unique()
        .all()
    )


def create_advisory(db: Session, user: User, payload: AdvisoryCreate) -> tuple[Advisory, bool]:
    existing = find_by_request_id(db, Advisory, payload.client_request_id)
    if existing is not None:
        return existing, True
    if payload.species_id:
        _species(db, payload.species_id)
    require_farmer(db, payload.farmer_id)
    if payload.site_id:
        _site(db, payload.site_id, "site_id")
    row = Advisory(
        public_code=allocate_code(db, Advisory, "ADV"),
        title=payload.title,
        body=payload.body,
        species_id=payload.species_id,
        farmer_id=payload.farmer_id,
        site_id=payload.site_id,
        issued_on=payload.issued_on,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "advisory", ["title"])


def list_advisories(db: Session) -> list[Advisory]:
    return list(
        db.scalars(
            select(Advisory)
            .options(
                joinedload(Advisory.species),
                joinedload(Advisory.farmer),
                joinedload(Advisory.site),
            )
            .order_by(Advisory.created_at.desc())
        )
        .unique()
        .all()
    )


def _sum(db: Session, column, *conditions) -> float:
    stmt = select(func.coalesce(func.sum(column), 0))
    for condition in conditions:
        stmt = stmt.where(condition)
    return float(db.scalar(stmt) or 0)


def _count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def collect_analytics(db: Session) -> AnalyticsResponse:
    from app.models.entities import TreeStatus

    species_rows = db.execute(
        select(Species.common_name, Harvest.unit, func.coalesce(func.sum(Harvest.quantity), 0))
        .join(IndividualTree, Harvest.tree_id == IndividualTree.id, isouter=True)
        .join(PlantingBatch, Harvest.batch_id == PlantingBatch.id, isouter=True)
        .join(
            Species,
            Species.id == func.coalesce(IndividualTree.species_id, PlantingBatch.species_id),
        )
        .group_by(Species.common_name, Harvest.unit)
    ).all()
    totals: dict[str, dict[str, float]] = {}
    for name, unit, amount in species_rows:
        bucket = totals.setdefault(name, {"kg": 0.0, "count": 0.0})
        bucket[unit] = float(amount)
    districts = db.execute(
        select(PlantingSite.district, func.count())
        .where(PlantingSite.district.is_not(None))
        .group_by(PlantingSite.district)
        .order_by(func.count().desc())
    ).all()
    return AnalyticsResponse(
        farmers=_count(db, Farmer),
        seedling_lots=_count(db, SeedlingLot),
        seedlings_remaining=int(_sum(db, SeedlingLot.quantity_remaining)),
        seedlings_distributed=int(_sum(db, Distribution.quantity)),
        growth_measurements=_count(db, GrowthMeasurement),
        maintenance_activities=_count(db, MaintenanceActivity),
        harvests=_count(db, Harvest),
        harvested_kg=_sum(db, Harvest.quantity, Harvest.unit == "kg"),
        harvested_count=_sum(db, Harvest.quantity, Harvest.unit == "count"),
        unsold_kg=_sum(db, Harvest.quantity_remaining, Harvest.unit == "kg"),
        sales=_count(db, Sale),
        sales_rwf=_sum(db, Sale.amount_rwf),
        advisories=_count(db, Advisory),
        trees=_count(db, IndividualTree),
        surviving_trees=db.scalar(
            select(func.count())
            .select_from(IndividualTree)
            .where(IndividualTree.status == TreeStatus.surviving.value)
        )
        or 0,
        by_species=[
            SpeciesTotal(
                species_common_name=name,
                harvested_kg=values["kg"],
                harvested_count=values["count"],
            )
            for name, values in sorted(totals.items())
        ],
        by_district=[
            DistrictTotal(district=district, sites=count) for district, count in districts
        ],
    )
