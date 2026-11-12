"""Value-chain records that sit on top of sites, trees, and batches.

These writes do not call the FMES adapter.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased, joinedload

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
    LifecycleEvent,
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
    CountryOverview,
    DashboardResponse,
    DistributionCreate,
    DistrictTrees,
    FarmerBadge,
    FarmerCreate,
    FarmerLoginCreate,
    FarmerOverview,
    FarmerPlanting,
    FarmerUpdate,
    GrowthCreate,
    HarvestCreate,
    LotCreate,
    MaintenanceCreate,
    OfficerOverview,
    SaleCreate,
    SpeciesCount,
)
from app.services.common import allocate_code, find_by_request_id, utcnow, write_audit
from app.services.harvest import flag_unusual_harvest, reject_duplicate_destination
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


def _phone_key(value: str | None) -> str | None:
    if not value:
        return None
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) >= 8:
        return digits
    return value.strip().casefold()


def _reject_duplicate_phone(
    db: Session, phone: str | None, exclude_id: uuid.UUID | None = None
) -> None:
    key = _phone_key(phone)
    if key is None:
        return
    rows = db.scalars(select(Farmer).where(Farmer.phone.is_not(None))).all()
    for row in rows:
        if exclude_id is not None and row.id == exclude_id:
            continue
        if _phone_key(row.phone) == key:
            raise DomainError(
                "A farmer with this phone is already on the list. Select that farmer instead.",
                field="phone",
            )


def create_farmer(db: Session, user: User, payload: FarmerCreate) -> tuple[Farmer, bool]:
    existing = find_by_request_id(db, Farmer, payload.client_request_id)
    if existing is not None:
        return existing, True
    require_organization(db, payload.organization_id)
    _reject_duplicate_phone(db, payload.phone)
    farmer = Farmer(
        public_code=allocate_code(db, Farmer, "FARM"),
        display_name=payload.display_name,
        organization_id=payload.organization_id,
        province=payload.province,
        district=payload.district,
        sector=payload.sector,
        cell=payload.cell,
        village=payload.village,
        isibo=payload.isibo,
        household=payload.household,
        phone=payload.phone,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
        registered_at=utcnow(),
    )
    return _save(db, user, farmer, "farmer", ["display_name", "district", "phone"])


def update_farmer(db: Session, user: User, farmer_id: uuid.UUID, payload: FarmerUpdate) -> Farmer:
    farmer = db.get(Farmer, farmer_id)
    if farmer is None:
        raise DomainError("Farmer was not found.", status_code=404)
    if user.role == UserRole.farmer.value and farmer.user_id != user.id:
        raise DomainError("You can update only your own details.", status_code=403)
    data = payload.model_dump(exclude_unset=True)
    if "phone" in data:
        _reject_duplicate_phone(db, data["phone"], exclude_id=farmer.id)
    for key, value in data.items():
        setattr(farmer, key, value)
    db.flush()
    write_audit(db, user, "update", "farmer", farmer.id, sorted(data))
    _commit(db)
    return farmer


def list_farmers(db: Session) -> list[Farmer]:
    return list(
        db.scalars(
            select(Farmer)
            .options(
                joinedload(Farmer.organization),
                joinedload(Farmer.registrar),
                joinedload(Farmer.trees).joinedload(IndividualTree.species),
            )
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
    if row.id is None:
        row.id = uuid.uuid4()
    flag_unusual_harvest(db, user, row)
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
    reject_duplicate_destination(db, payload)
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
        public_code=allocate_code(db, Sale, "SALE" if payload.purpose == "sold" else "USE"),
        harvest_id=harvest.id,
        sold_on=payload.sold_on,
        quantity=payload.quantity,
        unit=harvest.unit,
        amount_rwf=payload.amount_rwf,
        purpose=payload.purpose,
        buyer_name=payload.buyer_name,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    return _save(db, user, row, "sale", ["quantity", "purpose", "amount_rwf"])


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


def _count(db: Session, model, condition=None) -> int:
    statement = select(func.count()).select_from(model)
    if condition is not None:
        statement = statement.where(condition)
    return db.scalar(statement) or 0


def _owned(model, farmer_id: uuid.UUID):
    return or_(
        model.farmer_id == farmer_id,
        and_(model.farmer_id.is_(None), PlantingSite.farmer_id == farmer_id),
    )


def farmer_badges(
    recorded_trees: int, species: int, sites: int, follow_through: bool
) -> list[FarmerBadge]:
    """Appreciation for one account. Metals follow recorded trees: 1, 20, then 50."""
    if recorded_trees >= 50:
        metal = FarmerBadge(
            key="gold",
            title="Gold",
            sentence="Fifty trees are recorded.",
            earned=True,
        )
    elif recorded_trees >= 20:
        metal = FarmerBadge(
            key="silver",
            title="Silver",
            sentence=_trees_until(50 - recorded_trees, "gold"),
            earned=True,
        )
    elif recorded_trees >= 1:
        metal = FarmerBadge(
            key="bronze",
            title="Bronze",
            sentence=_trees_until(20 - recorded_trees, "silver"),
            earned=True,
        )
    else:
        metal = FarmerBadge(
            key="bronze",
            title="Bronze",
            sentence="Record your first tree.",
            earned=False,
        )
    return [
        metal,
        FarmerBadge(
            key="several_species",
            title="Several species",
            sentence=(
                "Two or more species are on your records."
                if species >= 2
                else "Record a second species."
            ),
            earned=species >= 2,
        ),
        FarmerBadge(
            key="several_places",
            title="Several places",
            sentence=(
                "Trees are recorded on two or more sites."
                if sites >= 2
                else "Record a second site."
            ),
            earned=sites >= 2,
        ),
        FarmerBadge(
            key="follow_through",
            title="Follow-through",
            sentence=(
                "A survival check or a later visit is recorded."
                if follow_through
                else "Record a survival check or a later visit."
            ),
            earned=follow_through,
        ),
    ]


def _trees_until(remaining: int, next_metal: str) -> str:
    if remaining == 1:
        return f"1 more tree moves this to {next_metal}."
    return f"{remaining} more trees move this to {next_metal}."


def _follow_through(db: Session, farmer_id: uuid.UUID) -> bool:
    """True after a survival check or any later visit on this farmer's records."""
    owned_trees = _owned(IndividualTree, farmer_id)
    owned_batches = _owned(PlantingBatch, farmer_id)

    def found(stmt) -> bool:
        return db.scalar(stmt.limit(1)) is not None

    if found(
        select(IndividualTree.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees, IndividualTree.status.notin_(["planted", "unknown"]))
    ):
        return True
    if found(
        select(PlantingBatch.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches, PlantingBatch.status.notin_(["planted", "unknown"]))
    ):
        return True
    if found(
        select(LifecycleEvent.id)
        .join(IndividualTree, LifecycleEvent.tree_id == IndividualTree.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees)
    ):
        return True
    if found(
        select(LifecycleEvent.id)
        .join(PlantingBatch, LifecycleEvent.batch_id == PlantingBatch.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches)
    ):
        return True
    if found(
        select(LifecycleEvent.id)
        .join(PlantingSite, LifecycleEvent.site_id == PlantingSite.id)
        .where(PlantingSite.farmer_id == farmer_id)
    ):
        return True
    if found(
        select(GrowthMeasurement.id)
        .join(IndividualTree, GrowthMeasurement.tree_id == IndividualTree.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees)
    ):
        return True
    if found(
        select(GrowthMeasurement.id)
        .join(PlantingBatch, GrowthMeasurement.batch_id == PlantingBatch.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches)
    ):
        return True
    if found(
        select(MaintenanceActivity.id)
        .join(IndividualTree, MaintenanceActivity.tree_id == IndividualTree.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees)
    ):
        return True
    if found(
        select(MaintenanceActivity.id)
        .join(PlantingBatch, MaintenanceActivity.batch_id == PlantingBatch.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches)
    ):
        return True
    return found(
        select(MaintenanceActivity.id)
        .join(PlantingSite, MaintenanceActivity.site_id == PlantingSite.id)
        .where(PlantingSite.farmer_id == farmer_id)
    )


def held_metal(recorded_trees: int) -> str | None:
    badge = farmer_badges(recorded_trees, 0, 0, False)[0]
    return badge.key if badge.earned else None


def _empty_overview(name: str) -> FarmerOverview:
    return FarmerOverview(
        linked=False,
        farmer_id=None,
        farmer_name=name,
        sites=0,
        trees=0,
        batches=0,
        recorded_trees=0,
        surviving_trees=0,
        harvested_kg=0,
        sales_rwf=0,
        species_counts=[],
        plantings=[],
        district=None,
        organization_name=None,
        phone=None,
        metal=None,
    )


def collect_farmer_overview(db: Session, user: User) -> FarmerOverview:
    """Counts and recent plantings for the signed-in farmer only."""
    if user.role != UserRole.farmer.value:
        raise DomainError("This overview is for a farmer account.", status_code=403)
    farmer = farmer_for_user(db, user.id)
    if farmer is None:
        return _empty_overview(user.full_name)

    owned_trees = _owned(IndividualTree, farmer.id)
    owned_batches = _owned(PlantingBatch, farmer.id)
    trees = (
        db.scalar(
            select(func.count())
            .select_from(IndividualTree)
            .outerjoin(PlantingSite, IndividualTree.site_id == PlantingSite.id)
            .where(owned_trees)
        )
        or 0
    )
    batches = (
        db.scalar(
            select(func.count())
            .select_from(PlantingBatch)
            .outerjoin(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
            .where(owned_batches)
        )
        or 0
    )
    batch_quantity = int(
        db.scalar(
            select(func.coalesce(func.sum(PlantingBatch.quantity), 0))
            .outerjoin(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
            .where(owned_batches)
        )
        or 0
    )
    surviving = (
        db.scalar(
            select(func.count())
            .select_from(IndividualTree)
            .outerjoin(PlantingSite, IndividualTree.site_id == PlantingSite.id)
            .where(owned_trees, IndividualTree.status == "surviving")
        )
        or 0
    )

    def harvested_kg(model, owned) -> float:
        return float(
            db.scalar(
                select(func.coalesce(func.sum(Harvest.quantity), 0))
                .join(
                    model,
                    Harvest.tree_id == model.id
                    if model is IndividualTree
                    else Harvest.batch_id == model.id,
                )
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(Harvest.unit == "kg", owned)
            )
            or 0
        )

    def sales_rwf(model, owned) -> float:
        link = (
            Harvest.tree_id == model.id if model is IndividualTree else Harvest.batch_id == model.id
        )
        return float(
            db.scalar(
                select(func.coalesce(func.sum(Sale.amount_rwf), 0))
                .join(Harvest, Sale.harvest_id == Harvest.id)
                .join(model, link)
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(owned)
            )
            or 0
        )

    counts: dict[str, int] = {}
    for name, count in db.execute(
        select(Species.common_name, func.count())
        .join(IndividualTree, IndividualTree.species_id == Species.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees)
        .group_by(Species.common_name)
    ):
        counts[name] = counts.get(name, 0) + int(count)
    for name, quantity in db.execute(
        select(Species.common_name, func.coalesce(func.sum(PlantingBatch.quantity), 0))
        .join(PlantingBatch, PlantingBatch.species_id == Species.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches)
        .group_by(Species.common_name)
    ):
        counts[name] = counts.get(name, 0) + int(quantity)

    plantings: list[tuple[date, FarmerPlanting]] = []
    for row, species_name, site_name in db.execute(
        select(IndividualTree, Species.common_name, PlantingSite.name)
        .join(Species, IndividualTree.species_id == Species.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .where(owned_trees)
    ):
        plantings.append(
            (
                row.planting_date,
                FarmerPlanting(
                    id=row.id,
                    kind="tree",
                    species_common_name=species_name,
                    site_name=site_name,
                    status=row.status,
                    planting_date=row.planting_date,
                    quantity=1,
                ),
            )
        )
    for row, species_name, site_name in db.execute(
        select(PlantingBatch, Species.common_name, PlantingSite.name)
        .join(Species, PlantingBatch.species_id == Species.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .where(owned_batches)
    ):
        plantings.append(
            (
                row.planting_date,
                FarmerPlanting(
                    id=row.id,
                    kind="batch",
                    species_common_name=species_name,
                    site_name=site_name,
                    status=row.status,
                    planting_date=row.planting_date,
                    quantity=row.quantity,
                ),
            )
        )
    plantings.sort(key=lambda item: item[0], reverse=True)
    sites = (
        db.scalar(
            select(func.count())
            .select_from(PlantingSite)
            .where(PlantingSite.farmer_id == farmer.id)
        )
        or 0
    )
    recorded = trees + batch_quantity

    from app.services.dashboard import read_inventory, read_outcomes, survival_figures

    inventory = read_inventory(db, user)
    checked, surviving, survival = survival_figures(inventory, read_outcomes(db, inventory))
    return FarmerOverview(
        linked=True,
        farmer_id=farmer.id,
        farmer_name=farmer.display_name,
        sites=sites,
        trees=trees,
        batches=batches,
        recorded_trees=recorded,
        surviving_trees=surviving,
        checked_trees=checked,
        survival_percent=survival,
        harvested_kg=harvested_kg(IndividualTree, owned_trees)
        + harvested_kg(PlantingBatch, owned_batches),
        sales_rwf=sales_rwf(IndividualTree, owned_trees) + sales_rwf(PlantingBatch, owned_batches),
        species_counts=[
            SpeciesCount(species_common_name=name, trees=total)
            for name, total in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        plantings=[item for _, item in plantings[:8]],
        district=farmer.district,
        organization_name=farmer.organization.name if farmer.organization is not None else None,
        phone=farmer.phone,
        metal=held_metal(recorded),
    )


def farmers_helped(db: Session, user_id: uuid.UUID) -> int:
    """Distinct farmers this officer added or recorded a site, tree, visit, or sale for."""
    found: set[uuid.UUID] = set()

    def take(rows) -> None:
        for value in rows:
            if value is not None:
                found.add(value)

    take(db.scalars(select(Farmer.id).where(Farmer.registered_by == user_id)))
    take(
        db.scalars(
            select(PlantingSite.farmer_id).where(
                PlantingSite.registered_by == user_id,
                PlantingSite.farmer_id.is_not(None),
            )
        )
    )
    for model in (IndividualTree, PlantingBatch):
        take(
            db.scalars(
                select(func.coalesce(model.farmer_id, PlantingSite.farmer_id))
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(model.registered_by == user_id)
            )
        )
    take(
        db.scalars(
            select(Distribution.farmer_id).where(
                Distribution.registered_by == user_id,
                Distribution.farmer_id.is_not(None),
            )
        )
    )
    take(
        db.scalars(
            select(Advisory.farmer_id).where(
                Advisory.registered_by == user_id,
                Advisory.farmer_id.is_not(None),
            )
        )
    )
    for model, link in (
        (IndividualTree, LifecycleEvent.tree_id == IndividualTree.id),
        (PlantingBatch, LifecycleEvent.batch_id == PlantingBatch.id),
    ):
        take(
            db.scalars(
                select(func.coalesce(model.farmer_id, PlantingSite.farmer_id))
                .select_from(LifecycleEvent)
                .join(model, link)
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(LifecycleEvent.recorded_by == user_id)
            )
        )
    take(
        db.scalars(
            select(PlantingSite.farmer_id)
            .select_from(LifecycleEvent)
            .join(PlantingSite, LifecycleEvent.site_id == PlantingSite.id)
            .where(LifecycleEvent.recorded_by == user_id, PlantingSite.farmer_id.is_not(None))
        )
    )
    for model, link in (
        (IndividualTree, MaintenanceActivity.tree_id == IndividualTree.id),
        (PlantingBatch, MaintenanceActivity.batch_id == PlantingBatch.id),
    ):
        take(
            db.scalars(
                select(func.coalesce(model.farmer_id, PlantingSite.farmer_id))
                .select_from(MaintenanceActivity)
                .join(model, link)
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(MaintenanceActivity.registered_by == user_id)
            )
        )
    take(
        db.scalars(
            select(PlantingSite.farmer_id)
            .select_from(MaintenanceActivity)
            .join(PlantingSite, MaintenanceActivity.site_id == PlantingSite.id)
            .where(
                MaintenanceActivity.registered_by == user_id,
                PlantingSite.farmer_id.is_not(None),
            )
        )
    )
    for model, link in (
        (IndividualTree, Harvest.tree_id == IndividualTree.id),
        (PlantingBatch, Harvest.batch_id == PlantingBatch.id),
    ):
        take(
            db.scalars(
                select(func.coalesce(model.farmer_id, PlantingSite.farmer_id))
                .select_from(Harvest)
                .join(model, link)
                .join(PlantingSite, model.site_id == PlantingSite.id)
                .where(Harvest.registered_by == user_id)
            )
        )
    return len(found)


def collect_officer_overview(db: Session, user: User) -> OfficerOverview:
    """Plantings this field officer recorded, and the farmers that work reached."""
    if user.role != UserRole.field_officer.value:
        raise DomainError("This overview is for a field officer account.", status_code=403)

    def harvested_kg(model) -> float:
        link = (
            Harvest.tree_id == model.id if model is IndividualTree else Harvest.batch_id == model.id
        )
        return float(
            db.scalar(
                select(func.coalesce(func.sum(Harvest.quantity), 0))
                .join(model, link)
                .where(Harvest.unit == "kg", model.registered_by == user.id)
            )
            or 0
        )

    def sales_rwf(model) -> float:
        link = (
            Harvest.tree_id == model.id if model is IndividualTree else Harvest.batch_id == model.id
        )
        return float(
            db.scalar(
                select(func.coalesce(func.sum(Sale.amount_rwf), 0))
                .join(Harvest, Sale.harvest_id == Harvest.id)
                .join(model, link)
                .where(model.registered_by == user.id)
            )
            or 0
        )

    trees = (
        db.scalar(
            select(func.count())
            .select_from(IndividualTree)
            .where(IndividualTree.registered_by == user.id)
        )
        or 0
    )
    batches = (
        db.scalar(
            select(func.count())
            .select_from(PlantingBatch)
            .where(PlantingBatch.registered_by == user.id)
        )
        or 0
    )
    batch_quantity = int(
        db.scalar(
            select(func.coalesce(func.sum(PlantingBatch.quantity), 0)).where(
                PlantingBatch.registered_by == user.id
            )
        )
        or 0
    )
    surviving = (
        db.scalar(
            select(func.count())
            .select_from(IndividualTree)
            .where(
                IndividualTree.registered_by == user.id,
                IndividualTree.status == "surviving",
            )
        )
        or 0
    )
    counts: dict[str, int] = {}
    for name, count in db.execute(
        select(Species.common_name, func.count())
        .join(IndividualTree, IndividualTree.species_id == Species.id)
        .where(IndividualTree.registered_by == user.id)
        .group_by(Species.common_name)
    ):
        counts[name] = counts.get(name, 0) + int(count)
    for name, quantity in db.execute(
        select(Species.common_name, func.coalesce(func.sum(PlantingBatch.quantity), 0))
        .join(PlantingBatch, PlantingBatch.species_id == Species.id)
        .where(PlantingBatch.registered_by == user.id)
        .group_by(Species.common_name)
    ):
        counts[name] = counts.get(name, 0) + int(quantity)

    plantings: list[tuple[date, FarmerPlanting]] = []
    tree_farmer = aliased(Farmer)
    site_farmer = aliased(Farmer)
    for row, species_name, site_name, farmer_name in db.execute(
        select(
            IndividualTree,
            Species.common_name,
            PlantingSite.name,
            func.coalesce(tree_farmer.display_name, site_farmer.display_name),
        )
        .join(Species, IndividualTree.species_id == Species.id)
        .join(PlantingSite, IndividualTree.site_id == PlantingSite.id)
        .outerjoin(tree_farmer, IndividualTree.farmer_id == tree_farmer.id)
        .outerjoin(site_farmer, PlantingSite.farmer_id == site_farmer.id)
        .where(IndividualTree.registered_by == user.id)
    ):
        plantings.append(
            (
                row.planting_date,
                FarmerPlanting(
                    id=row.id,
                    kind="tree",
                    species_common_name=species_name,
                    site_name=site_name,
                    farmer_name=farmer_name,
                    status=row.status,
                    planting_date=row.planting_date,
                    quantity=1,
                ),
            )
        )
    batch_farmer = aliased(Farmer)
    batch_site_farmer = aliased(Farmer)
    for row, species_name, site_name, farmer_name in db.execute(
        select(
            PlantingBatch,
            Species.common_name,
            PlantingSite.name,
            func.coalesce(batch_farmer.display_name, batch_site_farmer.display_name),
        )
        .join(Species, PlantingBatch.species_id == Species.id)
        .join(PlantingSite, PlantingBatch.site_id == PlantingSite.id)
        .outerjoin(batch_farmer, PlantingBatch.farmer_id == batch_farmer.id)
        .outerjoin(batch_site_farmer, PlantingSite.farmer_id == batch_site_farmer.id)
        .where(PlantingBatch.registered_by == user.id)
    ):
        plantings.append(
            (
                row.planting_date,
                FarmerPlanting(
                    id=row.id,
                    kind="batch",
                    species_common_name=species_name,
                    site_name=site_name,
                    farmer_name=farmer_name,
                    status=row.status,
                    planting_date=row.planting_date,
                    quantity=row.quantity,
                ),
            )
        )
    plantings.sort(key=lambda item: item[0], reverse=True)
    sites = (
        db.scalar(
            select(func.count())
            .select_from(PlantingSite)
            .where(PlantingSite.registered_by == user.id)
        )
        or 0
    )
    recorded = trees + batch_quantity
    from app.services.dashboard import read_inventory, read_outcomes, survival_figures

    inventory = read_inventory(db, user)
    checked, surviving, survival = survival_figures(inventory, read_outcomes(db, inventory))
    return OfficerOverview(
        officer_name=user.full_name,
        farmers_helped=farmers_helped(db, user.id),
        sites=sites,
        trees=trees,
        batches=batches,
        recorded_trees=recorded,
        surviving_trees=surviving,
        checked_trees=checked,
        survival_percent=survival,
        harvested_kg=harvested_kg(IndividualTree) + harvested_kg(PlantingBatch),
        sales_rwf=sales_rwf(IndividualTree) + sales_rwf(PlantingBatch),
        species_counts=[
            SpeciesCount(species_common_name=name, trees=total)
            for name, total in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        plantings=[item for _, item in plantings[:8]],
        metal=held_metal(recorded),
    )


def collect_country_overview(db: Session) -> CountryOverview:
    """Trees by species and district. No farmer or officer names."""
    trees = db.scalar(select(func.count()).select_from(IndividualTree)) or 0
    batch_quantity = int(db.scalar(select(func.coalesce(func.sum(PlantingBatch.quantity), 0))) or 0)
    species: dict[str, int] = {}
    for name, count in db.execute(
        select(Species.common_name, func.count())
        .join(IndividualTree, IndividualTree.species_id == Species.id)
        .group_by(Species.common_name)
    ):
        species[name] = species.get(name, 0) + int(count)
    for name, quantity in db.execute(
        select(Species.common_name, func.coalesce(func.sum(PlantingBatch.quantity), 0))
        .join(PlantingBatch, PlantingBatch.species_id == Species.id)
        .group_by(Species.common_name)
    ):
        species[name] = species.get(name, 0) + int(quantity)

    districts: dict[str, int] = {}

    def add_district(rows) -> None:
        for district, count in rows:
            label = district or "District not recorded"
            districts[label] = districts.get(label, 0) + int(count)

    add_district(
        db.execute(
            select(PlantingSite.district, func.count())
            .join(IndividualTree, IndividualTree.site_id == PlantingSite.id)
            .group_by(PlantingSite.district)
        )
    )
    add_district(
        db.execute(
            select(PlantingSite.district, func.coalesce(func.sum(PlantingBatch.quantity), 0))
            .join(PlantingBatch, PlantingBatch.site_id == PlantingSite.id)
            .group_by(PlantingSite.district)
        )
    )
    return CountryOverview(
        recorded_trees=trees + batch_quantity,
        species_counts=[
            SpeciesCount(species_common_name=name, trees=total)
            for name, total in sorted(species.items(), key=lambda item: (-item[1], item[0]))
        ],
        districts=[
            DistrictTrees(district=name, trees=total)
            for name, total in sorted(districts.items(), key=lambda item: (-item[1], item[0]))
        ],
    )


def collect_analytics(
    db: Session,
    user: User | None = None,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> AnalyticsResponse:
    from app.services.dashboard import collect_analytics as report

    return report(db, user, start_date=start_date, end_date=end_date)


def collect_dashboard(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
    range_name: str = "90",
    start_date: date | None = None,
    end_date: date | None = None,
) -> DashboardResponse:
    from app.services.dashboard import collect_dashboard as dashboard

    return dashboard(
        db,
        user,
        district=district,
        species_id=species_id,
        range_name=range_name,
        start_date=start_date,
        end_date=end_date,
    )
