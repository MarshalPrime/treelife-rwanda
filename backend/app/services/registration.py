"""Create, update, list, and inspect registration records."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.domain.errors import DomainError
from app.domain.validation import check_historical_date
from app.integrations.fmes.adapter import dispatch_registration_hook
from app.models.entities import (
    AuditLog,
    DataOrigin,
    Farmer,
    IndividualTree,
    LifecycleEvent,
    Organization,
    PlantingBatch,
    PlantingSite,
    SiteStatus,
    Species,
    SpeciesVariety,
    TreeStatus,
    User,
    UserRole,
)
from app.schemas.entities import (
    BatchCreate,
    BatchUpdate,
    EventCreate,
    OrganizationCreate,
    RegisterRequest,
    SiteCreate,
    SiteUpdate,
    SpeciesCreate,
    SpeciesUpdate,
    StatsResponse,
    TreeCreate,
    TreeUpdate,
    enum_value,
)
from app.services.common import (
    allocate_code,
    apply_coordinates,
    apply_fields,
    apply_point,
    find_by_request_id,
    stored_value,
    utcnow,
    write_audit,
)

SITE_FIELDS = [
    "name",
    "site_type",
    "organization_id",
    "farmer_id",
    "province",
    "district",
    "sector",
    "cell",
    "village",
    "isibo",
    "household",
    "area_hectares",
    "notes",
    "status",
    "external_id",
]
TREE_FIELDS = [
    "site_id",
    "species_id",
    "province",
    "district",
    "sector",
    "cell",
    "village",
    "isibo",
    "household",
    "category",
    "planting_date",
    "notes",
    "status",
    "external_id",
]
BATCH_FIELDS = [*TREE_FIELDS, "quantity"]
TREE_STATUSES = {item.value for item in TreeStatus}
SITE_STATUSES = {item.value for item in SiteStatus}


def _like(query: str) -> str:
    return f"%{query.strip()}%"


def require_organization(db: Session, organization_id: uuid.UUID | None) -> None:
    if organization_id is None:
        return
    if db.get(Organization, organization_id) is None:
        raise DomainError("Organization was not found.", field="organization_id")


def require_site(db: Session, site_id: uuid.UUID) -> PlantingSite:
    site = db.get(PlantingSite, site_id)
    if site is None:
        raise DomainError("Planting site was not found.", field="site_id")
    return site


def require_species(db: Session, species_id: uuid.UUID) -> Species:
    species = db.get(Species, species_id)
    if species is None:
        raise DomainError("Tree species was not found.", field="species_id")
    return species


def load_site(db: Session, site_id: uuid.UUID) -> PlantingSite | None:
    return db.scalar(
        select(PlantingSite)
        .options(
            joinedload(PlantingSite.organization),
            joinedload(PlantingSite.farmer),
            joinedload(PlantingSite.registrar),
        )
        .where(PlantingSite.id == site_id)
    )


def load_tree(db: Session, tree_id: uuid.UUID) -> IndividualTree | None:
    return db.scalar(
        select(IndividualTree)
        .options(
            joinedload(IndividualTree.site),
            joinedload(IndividualTree.farmer),
            joinedload(IndividualTree.species),
            joinedload(IndividualTree.registrar),
        )
        .where(IndividualTree.id == tree_id)
    )


def load_batch(db: Session, batch_id: uuid.UUID) -> PlantingBatch | None:
    return db.scalar(
        select(PlantingBatch)
        .options(
            joinedload(PlantingBatch.site),
            joinedload(PlantingBatch.farmer),
            joinedload(PlantingBatch.species),
            joinedload(PlantingBatch.registrar),
        )
        .where(PlantingBatch.id == batch_id)
    )


def load_event(db: Session, event_id: uuid.UUID) -> LifecycleEvent | None:
    return db.scalar(
        select(LifecycleEvent)
        .options(joinedload(LifecycleEvent.recorder))
        .where(LifecycleEvent.id == event_id)
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError(
            "This record conflicts with an existing one.",
            status_code=409,
        ) from exc
    from app.services.live_stream import notify_dashboard_change

    notify_dashboard_change()


def _finish(db: Session, entity_type: str, entity_id: uuid.UUID) -> None:
    _commit(db)
    dispatch_registration_hook(entity_type, str(entity_id))


def register_account(db: Session, payload: RegisterRequest) -> User:
    if payload.role == UserRole.admin:
        raise DomainError(
            "Administrator accounts must be created by an existing administrator.",
            status_code=403,
        )
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise DomainError(
            "An account with this email already exists.",
            status_code=409,
            field="email",
        )
    organization_id = None
    if payload.organization_name:
        organization = db.scalar(
            select(Organization).where(
                func.lower(Organization.name) == payload.organization_name.lower()
            )
        )
        if organization is None:
            organization = Organization(
                name=payload.organization_name,
                org_type="public_institution" if payload.role == UserRole.admin else "other",
            )
            db.add(organization)
            db.flush()
        organization_id = organization.id
    account = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        organization_id=organization_id,
        is_active=True,
    )
    db.add(account)
    db.flush()
    if payload.role == UserRole.farmer:
        db.add(
            Farmer(
                public_code=allocate_code(db, Farmer, "FARM"),
                display_name=payload.full_name,
                organization_id=organization_id,
                province=payload.province,
                district=payload.district,
                sector=payload.sector,
                cell=payload.cell,
                village=payload.village,
                isibo=payload.isibo,
                household=payload.household,
                phone=payload.phone,
                data_origin=DataOrigin.field_entry.value,
                user_id=account.id,
                registered_by=account.id,
                registered_at=utcnow(),
            )
        )
        db.flush()
    write_audit(db, account, "create", "user", account.id, ["email", "role"])
    _commit(db)
    return account


def create_organization(db: Session, user: User, payload: OrganizationCreate) -> Organization:
    duplicate = db.scalar(
        select(Organization.id).where(func.lower(Organization.name) == payload.name.lower())
    )
    if duplicate is not None:
        raise DomainError(
            "An organization with this name already exists.", field="name", status_code=409
        )
    org = Organization(
        name=payload.name,
        org_type=enum_value(payload.org_type),
        external_id=payload.external_id,
        notes=payload.notes,
    )
    db.add(org)
    db.flush()
    write_audit(db, user, "create", "organization", org.id, ["name", "org_type"])
    _finish(db, "organization", org.id)
    return db.get(Organization, org.id)


def list_organizations(db: Session) -> list[Organization]:
    return list(db.scalars(select(Organization).order_by(Organization.name.asc())).all())


def create_species(db: Session, user: User, payload: SpeciesCreate) -> Species:
    duplicate = db.scalar(
        select(Species.id).where(
            func.lower(Species.scientific_name) == payload.scientific_name.lower()
        )
    )
    if duplicate is not None:
        raise DomainError(
            "A species with this scientific name already exists.",
            field="scientific_name",
            status_code=409,
        )
    species = Species(
        scientific_name=payload.scientific_name,
        common_name=payload.common_name,
        local_name=payload.local_name,
        category=enum_value(payload.category),
        review_status="draft",
        taxon_rank="species",
    )
    db.add(species)
    db.flush()
    write_audit(
        db, user, "create", "species", species.id, ["scientific_name", "common_name", "category"]
    )
    _finish(db, "species", species.id)
    return db.get(Species, species.id)


def list_species(db: Session, query: str | None = None, *, approved: bool = False) -> list[Species]:
    stmt = select(Species).options(joinedload(Species.varieties))
    if approved:
        stmt = stmt.where(Species.review_status == "verified", Species.taxon_rank == "species")
    if query:
        like = _like(query)
        stmt = stmt.where(
            or_(
                Species.common_name.ilike(like),
                Species.scientific_name.ilike(like),
                Species.local_name.ilike(like),
                cast(Species.other_local_names, String).ilike(like),
            )
        )
    return list(db.scalars(stmt.order_by(Species.common_name.asc())).unique().all())


def update_species(
    db: Session, user: User, species_id: uuid.UUID, payload: SpeciesUpdate
) -> Species:
    species = db.get(Species, species_id)
    if species is None:
        raise DomainError("Species was not found.", status_code=404)
    changes = payload.model_dump(exclude_unset=True)
    variety_name = changes.pop("variety_name", None)
    if "scientific_name" in changes:
        duplicate = db.scalar(
            select(Species.id).where(
                func.lower(Species.scientific_name) == changes["scientific_name"].lower(),
                Species.id != species.id,
            )
        )
        if duplicate is not None:
            raise DomainError(
                "A species with this scientific name already exists.",
                field="scientific_name",
                status_code=409,
            )
    if "category" in changes and changes["category"] is not None:
        changes["category"] = enum_value(changes["category"])
    for field, value in changes.items():
        setattr(species, field, value)
    if variety_name:
        exists = db.scalar(
            select(SpeciesVariety.id).where(
                SpeciesVariety.species_id == species.id,
                func.lower(SpeciesVariety.name) == variety_name.lower(),
            )
        )
        if exists is None:
            db.add(SpeciesVariety(species_id=species.id, name=variety_name))
    db.flush()
    write_audit(db, user, "update", "species", species.id, sorted(payload.model_fields_set))
    _finish(db, "species", species.id)
    loaded = db.scalar(
        select(Species).options(joinedload(Species.varieties)).where(Species.id == species.id)
    )
    if loaded is None:
        raise DomainError("Species was not found.", status_code=404)
    return loaded


def create_site(db: Session, user: User, payload: SiteCreate) -> tuple[PlantingSite, bool]:
    existing = find_by_request_id(db, PlantingSite, payload.client_request_id)
    if existing is not None:
        loaded = load_site(db, existing.id)
        return loaded, True
    require_organization(db, payload.organization_id)
    from app.services.valuechain import farmer_for_user, require_farmer

    if user.role == "farmer" and payload.farmer_id is None:
        own = farmer_for_user(db, user.id)
        if own is None:
            raise DomainError(
                "This login is not linked to a farmer record.",
                field="farmer_id",
            )
        payload = payload.model_copy(update={"farmer_id": own.id})
    require_farmer(db, payload.farmer_id)
    site = PlantingSite(
        public_code=allocate_code(db, PlantingSite, "SITE"),
        name=payload.name,
        site_type=enum_value(payload.site_type),
        organization_id=payload.organization_id,
        farmer_id=payload.farmer_id,
        province=payload.province,
        district=payload.district,
        sector=payload.sector,
        cell=payload.cell,
        village=payload.village,
        isibo=payload.isibo,
        household=payload.household,
        area_hectares=payload.area_hectares,
        notes=payload.notes,
        status=SiteStatus.active.value,
        data_origin=DataOrigin.field_entry.value,
        external_id=payload.external_id,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
        registered_at=utcnow(),
    )
    apply_point(site, payload.latitude, payload.longitude)
    db.add(site)
    db.flush()
    write_audit(
        db,
        user,
        "create",
        "planting_site",
        site.id,
        ["name", "site_type", "organization_id", "coordinates"],
    )
    site_id = site.id
    try:
        _finish(db, "planting_site", site_id)
    except DomainError:
        if payload.client_request_id:
            raced = find_by_request_id(db, PlantingSite, payload.client_request_id)
            if raced is not None:
                return load_site(db, raced.id), True
        raise
    return load_site(db, site_id), False


def update_site(db: Session, user: User, site_id: uuid.UUID, payload: SiteUpdate) -> PlantingSite:
    site = load_site(db, site_id)
    if site is None:
        raise DomainError("Planting site was not found.", status_code=404)
    data = payload.model_dump(exclude_unset=True)
    if "organization_id" in data:
        require_organization(db, data["organization_id"])
    if "farmer_id" in data:
        from app.services.valuechain import require_farmer

        require_farmer(db, data["farmer_id"])
    changed = apply_fields(site, data, SITE_FIELDS)
    changed.extend(apply_coordinates(site, data))
    if changed:
        site.updated_at = utcnow()
        write_audit(db, user, "update", "planting_site", site.id, changed)
        _finish(db, "planting_site", site.id)
    return load_site(db, site.id)


def list_sites(
    db: Session,
    *,
    page: int,
    page_size: int,
    query: str | None,
    status: str | None,
    province: str | None,
    district: str | None,
    organization_id: uuid.UUID | None,
    has_coordinates: bool | None,
) -> tuple[list[PlantingSite], int]:
    filters = []
    if query:
        like = _like(query)
        filters.append(
            or_(
                PlantingSite.name.ilike(like),
                PlantingSite.public_code.ilike(like),
                PlantingSite.province.ilike(like),
                PlantingSite.district.ilike(like),
                PlantingSite.sector.ilike(like),
                PlantingSite.cell.ilike(like),
                PlantingSite.village.ilike(like),
                PlantingSite.isibo.ilike(like),
                PlantingSite.household.ilike(like),
            )
        )
    if status:
        filters.append(PlantingSite.status == status)
    if province:
        filters.append(PlantingSite.province.ilike(province.strip()))
    if district:
        filters.append(PlantingSite.district.ilike(district.strip()))
    if organization_id:
        filters.append(PlantingSite.organization_id == organization_id)
    if has_coordinates is True:
        filters.append(PlantingSite.latitude.is_not(None))
    if has_coordinates is False:
        filters.append(PlantingSite.latitude.is_(None))
    stmt = select(PlantingSite).options(
        joinedload(PlantingSite.organization),
        joinedload(PlantingSite.farmer),
        joinedload(PlantingSite.registrar),
    )
    count_stmt = select(func.count()).select_from(PlantingSite)
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = db.scalar(count_stmt) or 0
    rows = (
        db.scalars(
            stmt.order_by(PlantingSite.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )
    return list(rows), total


def get_site(db: Session, site_id: uuid.UUID) -> PlantingSite:
    site = load_site(db, site_id)
    if site is None:
        raise DomainError("Planting site was not found.", status_code=404)
    return site


def _create_planted_record(
    db: Session,
    user: User,
    payload: TreeCreate | BatchCreate,
    model: type,
    prefix: str,
    entity_type: str,
    extra: dict[str, Any] | None = None,
) -> tuple[Any, bool]:
    existing = find_by_request_id(db, model, payload.client_request_id)
    if existing is not None:
        return existing.id, True
    site = require_site(db, payload.site_id) if payload.site_id is not None else None
    if site is None and model is not IndividualTree:
        raise DomainError("Planting site is required.", field="site_id")
    require_species(db, payload.species_id)
    check_historical_date(payload.planting_date, "Planting date")
    from app.services.valuechain import farmer_for_user, require_farmer

    farmer_id = payload.farmer_id
    own = None
    if user.role == UserRole.farmer.value:
        own = farmer_for_user(db, user.id)
        if own is None:
            raise DomainError("This login is not linked to a farmer record.", field="farmer_id")
        farmer_id = own.id
    elif farmer_id is not None:
        require_farmer(db, farmer_id)
    if farmer_id is not None and site is not None and site.farmer_id is None:
        site.farmer_id = farmer_id
    planting = {}
    if model is IndividualTree:
        planting = {
            "planting_date_approximate": payload.planting_date_approximate,
            "planting_method": payload.planting_method,
            "planting_method_note": payload.planting_method_note,
            "soil_type": payload.soil_type,
            "terrain": payload.terrain,
            "water_availability": payload.water_availability,
            "spacing": payload.spacing,
            "fertilizer_applied": payload.fertilizer_applied,
            "mulching_applied": payload.mulching_applied,
            "watering_provided": payload.watering_provided,
        }
    record = model(
        public_code=allocate_code(db, model, prefix),
        site_id=payload.site_id,
        farmer_id=farmer_id,
        species_id=payload.species_id,
        province=payload.province,
        district=payload.district,
        sector=payload.sector,
        cell=payload.cell,
        village=payload.village,
        isibo=payload.isibo,
        household=payload.household,
        category=enum_value(payload.category),
        planting_date=payload.planting_date,
        status=enum_value(payload.status) or TreeStatus.planted.value,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        external_id=payload.external_id,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
        registered_at=utcnow(),
        **planting,
        **(extra or {}),
    )
    if (
        own is not None
        and model is IndividualTree
        and not any(
            getattr(payload, name)
            for name in ("province", "district", "sector", "cell", "village", "isibo", "household")
        )
    ):
        record.province = own.province
        record.district = own.district
        record.sector = own.sector
        record.cell = own.cell
        record.village = own.village
        record.isibo = own.isibo
        record.household = own.household
    apply_point(record, payload.latitude, payload.longitude)
    db.add(record)
    db.flush()
    write_audit(
        db,
        user,
        "create",
        entity_type,
        record.id,
        ["site_id", "species_id", "category", "planting_date", "coordinates", "status"],
    )
    record_id = record.id
    try:
        _finish(db, entity_type, record_id)
    except DomainError:
        if payload.client_request_id:
            raced = find_by_request_id(db, model, payload.client_request_id)
            if raced is not None:
                return raced.id, True
        raise
    return record_id, False


def create_tree(db: Session, user: User, payload: TreeCreate) -> tuple[IndividualTree, bool]:
    record_id, replay = _create_planted_record(
        db, user, payload, IndividualTree, "TREE", "individual_tree"
    )
    loaded = load_tree(db, record_id)
    return loaded, replay


def create_batch(db: Session, user: User, payload: BatchCreate) -> tuple[PlantingBatch, bool]:
    record_id, replay = _create_planted_record(
        db,
        user,
        payload,
        PlantingBatch,
        "BATCH",
        "planting_batch",
        extra={"quantity": payload.quantity},
    )
    return load_batch(db, record_id), replay


def _update_planted(
    db: Session,
    user: User,
    record: Any,
    payload: TreeUpdate | BatchUpdate,
    fields: list[str],
    entity_type: str,
) -> list[str]:
    data = payload.model_dump(exclude_unset=True)
    if "site_id" in data:
        if data["site_id"] is None:
            raise DomainError("Planting site is required.", field="site_id")
        require_site(db, data["site_id"])
    if "species_id" in data:
        if data["species_id"] is None:
            raise DomainError("Tree species is required.", field="species_id")
        require_species(db, data["species_id"])
    if "planting_date" in data and data["planting_date"] is not None:
        check_historical_date(data["planting_date"], "Planting date")
    changed = apply_fields(record, data, fields)
    changed.extend(apply_coordinates(record, data))
    if changed:
        record.updated_at = utcnow()
        write_audit(db, user, "update", entity_type, record.id, changed)
        _finish(db, entity_type, record.id)
    return changed


def update_tree(db: Session, user: User, tree_id: uuid.UUID, payload: TreeUpdate) -> IndividualTree:
    tree = load_tree(db, tree_id)
    if tree is None:
        raise DomainError("Tree was not found.", status_code=404)
    _update_planted(db, user, tree, payload, TREE_FIELDS, "individual_tree")
    return load_tree(db, tree_id)


def update_batch(
    db: Session, user: User, batch_id: uuid.UUID, payload: BatchUpdate
) -> PlantingBatch:
    batch = load_batch(db, batch_id)
    if batch is None:
        raise DomainError("Planting batch was not found.", status_code=404)
    _update_planted(db, user, batch, payload, BATCH_FIELDS, "planting_batch")
    return load_batch(db, batch_id)


def _planted_filters(
    model: type,
    *,
    query: str | None,
    site_id: uuid.UUID | None,
    species_id: uuid.UUID | None,
    category: str | None,
    status: str | None,
    has_coordinates: bool | None,
) -> list:
    filters = []
    if site_id:
        filters.append(model.site_id == site_id)
    if species_id:
        filters.append(model.species_id == species_id)
    if category:
        filters.append(model.category == category)
    if status:
        filters.append(model.status == status)
    if has_coordinates is True:
        filters.append(model.latitude.is_not(None))
    if has_coordinates is False:
        filters.append(model.latitude.is_(None))
    if query:
        like = _like(query)
        filters.append(
            or_(
                model.public_code.ilike(like),
                model.notes.ilike(like),
                Species.common_name.ilike(like),
                Species.scientific_name.ilike(like),
                PlantingSite.name.ilike(like),
                PlantingSite.district.ilike(like),
            )
        )
    return filters


def _list_planted(
    db: Session,
    model: type,
    loads: tuple,
    *,
    page: int,
    page_size: int,
    query: str | None,
    site_id: uuid.UUID | None,
    species_id: uuid.UUID | None,
    category: str | None,
    status: str | None,
    has_coordinates: bool | None,
) -> tuple[list, int]:
    filters = _planted_filters(
        model,
        query=query,
        site_id=site_id,
        species_id=species_id,
        category=category,
        status=status,
        has_coordinates=has_coordinates,
    )
    stmt = select(model).options(*loads).join(model.species).join(model.site)
    count_stmt = (
        select(func.count(func.distinct(model.id)))
        .select_from(model)
        .join(model.species)
        .join(model.site)
    )
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = db.scalar(count_stmt) or 0
    rows = (
        db.scalars(
            stmt.order_by(model.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        .unique()
        .all()
    )
    return list(rows), total


def list_trees(db: Session, **kwargs) -> tuple[list[IndividualTree], int]:
    return _list_planted(
        db,
        IndividualTree,
        (
            joinedload(IndividualTree.site),
            joinedload(IndividualTree.farmer),
            joinedload(IndividualTree.species),
            joinedload(IndividualTree.registrar),
        ),
        **kwargs,
    )


def list_batches(db: Session, **kwargs) -> tuple[list[PlantingBatch], int]:
    return _list_planted(
        db,
        PlantingBatch,
        (
            joinedload(PlantingBatch.site),
            joinedload(PlantingBatch.farmer),
            joinedload(PlantingBatch.species),
            joinedload(PlantingBatch.registrar),
        ),
        **kwargs,
    )


def get_tree(db: Session, tree_id: uuid.UUID) -> IndividualTree:
    tree = load_tree(db, tree_id)
    if tree is None:
        raise DomainError("Tree was not found.", status_code=404)
    return tree


def get_batch(db: Session, batch_id: uuid.UUID) -> PlantingBatch:
    batch = load_batch(db, batch_id)
    if batch is None:
        raise DomainError("Planting batch was not found.", status_code=404)
    return batch


def create_event(db: Session, user: User, payload: EventCreate) -> tuple[LifecycleEvent, bool]:
    existing = find_by_request_id(db, LifecycleEvent, payload.client_request_id)
    if existing is not None:
        return load_event(db, existing.id), True
    check_historical_date(payload.event_date, "Event date")
    status_after = stored_value(payload.status_after)
    target_type = "planting_site"
    if payload.tree_id is not None:
        tree = load_tree(db, payload.tree_id)
        if tree is None:
            raise DomainError("Tree was not found.", field="tree_id")
        if payload.survival_count is not None:
            raise DomainError(
                "Survival count is only for planting batches.", field="survival_count"
            )
        if status_after is not None and status_after not in TREE_STATUSES:
            raise DomainError("Status is not valid for an individual tree.", field="status_after")
        if status_after is not None and tree.status != status_after:
            tree.status = status_after
            tree.updated_at = utcnow()
            write_audit(db, user, "update", "individual_tree", tree.id, ["status"])
        target_type = "individual_tree"
    elif payload.batch_id is not None:
        batch = load_batch(db, payload.batch_id)
        if batch is None:
            raise DomainError("Planting batch was not found.", field="batch_id")
        if payload.survival_count is not None and payload.survival_count > batch.quantity:
            raise DomainError(
                f"Survival count cannot exceed the batch quantity of {batch.quantity}.",
                field="survival_count",
            )
        if status_after is not None and status_after not in TREE_STATUSES:
            raise DomainError("Status is not valid for a planting batch.", field="status_after")
        if status_after is not None and batch.status != status_after:
            batch.status = status_after
            batch.updated_at = utcnow()
            write_audit(db, user, "update", "planting_batch", batch.id, ["status"])
        target_type = "planting_batch"
    else:
        if payload.site_id is None:
            raise DomainError("Choose exactly one tree, planting batch, or site.", field="site_id")
        site = load_site(db, payload.site_id)
        if site is None:
            raise DomainError("Planting site was not found.", field="site_id")
        if payload.survival_count is not None:
            raise DomainError(
                "Survival count is only for planting batches.", field="survival_count"
            )
        if status_after is not None and status_after not in SITE_STATUSES:
            raise DomainError("Status is not valid for a planting site.", field="status_after")
        if status_after is not None and site.status != status_after:
            site.status = status_after
            site.updated_at = utcnow()
            write_audit(db, user, "update", "planting_site", site.id, ["status"])

    event = LifecycleEvent(
        public_code=allocate_code(db, LifecycleEvent, "EVT"),
        tree_id=payload.tree_id,
        batch_id=payload.batch_id,
        site_id=payload.site_id if payload.tree_id is None and payload.batch_id is None else None,
        event_type=enum_value(payload.event_type),
        event_date=payload.event_date,
        status_after=status_after,
        survival_count=payload.survival_count,
        notes=payload.notes,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        recorded_by=user.id,
    )
    db.add(event)
    db.flush()
    write_audit(
        db,
        user,
        "create",
        "lifecycle_event",
        event.id,
        ["event_type", "event_date", "status_after", target_type],
    )
    event_id = event.id
    try:
        _finish(db, "lifecycle_event", event_id)
    except DomainError:
        if payload.client_request_id:
            raced = find_by_request_id(db, LifecycleEvent, payload.client_request_id)
            if raced is not None:
                return load_event(db, raced.id), True
        raise
    return load_event(db, event_id), False


def list_events(
    db: Session,
    *,
    page: int,
    page_size: int,
    tree_id: uuid.UUID | None,
    batch_id: uuid.UUID | None,
    site_id: uuid.UUID | None,
) -> tuple[list[LifecycleEvent], int]:
    filters = []
    if tree_id:
        filters.append(LifecycleEvent.tree_id == tree_id)
    if batch_id:
        filters.append(LifecycleEvent.batch_id == batch_id)
    if site_id:
        filters.append(LifecycleEvent.site_id == site_id)
    stmt = select(LifecycleEvent).options(joinedload(LifecycleEvent.recorder))
    count_stmt = select(func.count()).select_from(LifecycleEvent)
    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = db.scalar(count_stmt) or 0
    rows = (
        db.scalars(
            stmt.order_by(LifecycleEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )
    return list(rows), total


def list_audit(db: Session, *, page: int, page_size: int) -> tuple[list[AuditLog], int]:
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    rows = (
        db.scalars(
            select(AuditLog)
            .options(joinedload(AuditLog.actor))
            .order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )
    return list(rows), total


def collect_stats(db: Session, user: User | None = None) -> StatsResponse:
    from app.services.dashboard import missing_coordinates, read_inventory, read_outcomes

    inventory = read_inventory(db, user)
    outcomes = read_outcomes(db, inventory)
    records = [*inventory.sites, *inventory.trees, *inventory.batches]
    return StatsResponse(
        sites=len(inventory.sites),
        trees=len(inventory.trees),
        batches=len(inventory.batches),
        events=len(outcomes.events),
        records_missing_coordinates=sum(missing_coordinates(row) for row in records),
        synthetic_records=sum(
            row.data_origin == DataOrigin.synthetic_demo.value
            for row in [*records, *outcomes.events]
        ),
    )
