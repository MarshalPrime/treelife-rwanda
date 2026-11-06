"""HTTP routes for registration, inspection, and the map."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin, require_staff, require_writer
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.domain.errors import DomainError
from app.models.entities import Farmer, User
from app.schemas.entities import (
    AuditRead,
    BatchCreate,
    BatchRead,
    BatchUpdate,
    EventCreate,
    EventRead,
    LoginRequest,
    MapResponse,
    OrganizationCreate,
    OrganizationRead,
    Page,
    PlaceList,
    RegisterRequest,
    SiteCreate,
    SiteRead,
    SiteUpdate,
    SpeciesCreate,
    SpeciesRead,
    SpeciesUpdate,
    StatsResponse,
    TokenResponse,
    TreeCreate,
    TreeRead,
    TreeUpdate,
    UserRead,
)
from app.schemas.valuechain import (
    AdvisoryCreate,
    AdvisoryRead,
    AnalyticsResponse,
    AssistantReply,
    AssistantRequest,
    CountryOverview,
    DashboardResponse,
    DistributionCreate,
    DistributionRead,
    FarmerCreate,
    FarmerLoginCreate,
    FarmerOverview,
    FarmerRead,
    FarmerTreeBrief,
    FarmerUpdate,
    GrowthCreate,
    GrowthRead,
    HarvestCreate,
    HarvestRead,
    LotCreate,
    LotRead,
    MaintenanceCreate,
    MaintenanceRead,
    OfficerOverview,
    ProfilePhotoRead,
    ProfileRead,
    SaleCreate,
    SaleRead,
)
from app.services.assistant import reply as assistant_reply
from app.services.locations import child_places
from app.services.mapdata import build_map
from app.services.profile_photo import (
    MEDIA_TYPES,
    delete_profile_photo,
    photo_file,
    save_profile_photo,
)
from app.services.registration import (
    collect_stats,
    create_batch,
    create_event,
    create_organization,
    create_site,
    create_species,
    create_tree,
    get_batch,
    get_site,
    get_tree,
    list_audit,
    list_batches,
    list_events,
    list_organizations,
    list_sites,
    list_species,
    list_trees,
    register_account,
    update_batch,
    update_site,
    update_species,
    update_tree,
)
from app.services.serialize import (
    audit_to_read,
    batch_to_read,
    event_to_read,
    organization_to_read,
    site_to_read,
    species_to_read,
    tree_to_read,
)
from app.services.valuechain import (
    collect_analytics,
    collect_country_overview,
    collect_dashboard,
    collect_farmer_overview,
    collect_officer_overview,
    create_advisory,
    create_distribution,
    create_farmer,
    create_growth,
    create_harvest,
    create_lot,
    create_maintenance,
    create_sale,
    farmer_for_user,
    list_advisories,
    list_distributions,
    list_farmers,
    list_growth,
    list_harvests,
    list_lots,
    list_maintenance,
    list_sales,
    open_farmer_login,
    update_farmer,
)

router = APIRouter()


def mark_created(response: Response, replay: bool) -> None:
    if replay:
        response.status_code = 200
        response.headers["X-Idempotent-Replay"] = "true"
    else:
        response.status_code = 201


def issue_token(db: Session, email: str, password: str) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Those credentials were not recognized.")
    token, expires_in = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        role=user.role,
        full_name=user.full_name,
    )


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
        postgis = db.execute(text("SELECT PostGIS_Version()")).scalar_one()
    except Exception as exc:
        from app.db.bootstrap import database_failure

        raise DomainError(
            f"Database is unavailable ({database_failure(exc)}).",
            status_code=503,
        ) from exc
    return {"status": "ok", "database": "ok", "postgis": postgis}


@router.post("/auth/register", response_model=UserRead, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> UserRead:
    account = register_account(db, payload)
    farmer_id = db.scalar(select(Farmer.id).where(Farmer.user_id == account.id))
    return UserRead(
        id=account.id,
        email=account.email,
        full_name=account.full_name,
        role=account.role,
        organization_id=account.organization_id,
        is_active=account.is_active,
        farmer_id=farmer_id,
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return issue_token(db, payload.email, payload.password)


@router.post("/auth/token", response_model=TokenResponse)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    return issue_token(db, form.username, form.password)


@router.get("/auth/me", response_model=UserRead)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserRead:
    farmer_id = db.scalar(select(Farmer.id).where(Farmer.user_id == user.id))
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id,
        is_active=user.is_active,
        farmer_id=farmer_id,
        profile_photo_at=user.profile_photo_at,
    )


@router.get("/stats", response_model=StatsResponse)
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> StatsResponse:
    return collect_stats(db, user)


@router.get("/organizations", response_model=list[OrganizationRead])
def get_organizations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[OrganizationRead]:
    return [organization_to_read(org) for org in list_organizations(db)]


@router.post("/organizations", response_model=OrganizationRead, status_code=201)
def post_organization(
    payload: OrganizationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> OrganizationRead:
    return organization_to_read(create_organization(db, user, payload))


@router.get("/species", response_model=list[SpeciesRead])
def get_species(
    q: str | None = Query(default=None, max_length=200),
    approved: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SpeciesRead]:
    return [species_to_read(item) for item in list_species(db, q, approved=approved)]


@router.post("/species", response_model=SpeciesRead, status_code=201)
def post_species(
    payload: SpeciesCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> SpeciesRead:
    return species_to_read(create_species(db, user, payload))


@router.patch("/species/{species_id}", response_model=SpeciesRead)
def patch_species(
    species_id: uuid.UUID,
    payload: SpeciesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> SpeciesRead:
    return species_to_read(update_species(db, user, species_id, payload))


@router.get("/locations", response_model=PlaceList)
def get_locations(
    province: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    sector: str | None = Query(default=None, max_length=120),
    cell: str | None = Query(default=None, max_length=120),
    _: User = Depends(get_current_user),
) -> PlaceList:
    level, places = child_places(province, district, sector, cell)
    return PlaceList(level=level, places=places)


@router.get("/sites", response_model=Page[SiteRead])
def get_sites(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=32),
    province: str | None = Query(default=None, max_length=120),
    district: str | None = Query(default=None, max_length=120),
    organization_id: uuid.UUID | None = None,
    has_coordinates: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[SiteRead]:
    rows, total = list_sites(
        db,
        page=page,
        page_size=page_size,
        query=q,
        status=status,
        province=province,
        district=district,
        organization_id=organization_id,
        has_coordinates=has_coordinates,
    )
    return Page(
        items=[site_to_read(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/sites", response_model=SiteRead, status_code=201)
def post_site(
    payload: SiteCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> SiteRead:
    site, replay = create_site(db, user, payload)
    mark_created(response, replay)
    return site_to_read(site)


@router.get("/sites/{site_id}", response_model=SiteRead)
def get_site_by_id(
    site_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SiteRead:
    return site_to_read(get_site(db, site_id))


@router.patch("/sites/{site_id}", response_model=SiteRead)
def patch_site(
    site_id: uuid.UUID,
    payload: SiteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> SiteRead:
    return site_to_read(update_site(db, user, site_id, payload))


def _planted_filters(
    q: str | None,
    site_id: uuid.UUID | None,
    species_id: uuid.UUID | None,
    category: str | None,
    status: str | None,
    has_coordinates: bool | None,
    page: int,
    page_size: int,
) -> dict:
    return {
        "page": page,
        "page_size": page_size,
        "query": q,
        "site_id": site_id,
        "species_id": species_id,
        "category": category,
        "status": status,
        "has_coordinates": has_coordinates,
    }


@router.get("/trees", response_model=Page[TreeRead])
def get_trees(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    site_id: uuid.UUID | None = None,
    species_id: uuid.UUID | None = None,
    category: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=32),
    has_coordinates: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[TreeRead]:
    rows, total = list_trees(
        db,
        **_planted_filters(
            q, site_id, species_id, category, status, has_coordinates, page, page_size
        ),
    )
    return Page(
        items=[tree_to_read(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/trees", response_model=TreeRead, status_code=201)
def post_tree(
    payload: TreeCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> TreeRead:
    tree, replay = create_tree(db, user, payload)
    mark_created(response, replay)
    return tree_to_read(tree)


@router.get("/trees/{tree_id}", response_model=TreeRead)
def get_tree_by_id(
    tree_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TreeRead:
    return tree_to_read(get_tree(db, tree_id))


@router.patch("/trees/{tree_id}", response_model=TreeRead)
def patch_tree(
    tree_id: uuid.UUID,
    payload: TreeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> TreeRead:
    return tree_to_read(update_tree(db, user, tree_id, payload))


@router.get("/batches", response_model=Page[BatchRead])
def get_batches(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    site_id: uuid.UUID | None = None,
    species_id: uuid.UUID | None = None,
    category: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=32),
    has_coordinates: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[BatchRead]:
    rows, total = list_batches(
        db,
        **_planted_filters(
            q, site_id, species_id, category, status, has_coordinates, page, page_size
        ),
    )
    return Page(
        items=[batch_to_read(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/batches", response_model=BatchRead, status_code=201)
def post_batch(
    payload: BatchCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> BatchRead:
    batch, replay = create_batch(db, user, payload)
    mark_created(response, replay)
    return batch_to_read(batch)


@router.get("/batches/{batch_id}", response_model=BatchRead)
def get_batch_by_id(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BatchRead:
    return batch_to_read(get_batch(db, batch_id))


@router.patch("/batches/{batch_id}", response_model=BatchRead)
def patch_batch(
    batch_id: uuid.UUID,
    payload: BatchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> BatchRead:
    return batch_to_read(update_batch(db, user, batch_id, payload))


@router.get("/events", response_model=Page[EventRead])
def get_events(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    tree_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
    site_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[EventRead]:
    rows, total = list_events(
        db,
        page=page,
        page_size=page_size,
        tree_id=tree_id,
        batch_id=batch_id,
        site_id=site_id,
    )
    return Page(
        items=[event_to_read(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/events", response_model=EventRead, status_code=201)
def post_event(
    payload: EventCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> EventRead:
    event, replay = create_event(db, user, payload)
    mark_created(response, replay)
    return event_to_read(event)


@router.get("/map", response_model=MapResponse)
def get_map(
    kind: str | None = Query(default=None, pattern="^(site|tree|batch|all)$"),
    species_id: uuid.UUID | None = None,
    category: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=200),
    district: str | None = Query(default=None, max_length=120),
    farmer_id: uuid.UUID | None = None,
    entered_by: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MapResponse:
    return build_map(
        db,
        kind=kind,
        species_id=species_id,
        category=category,
        status=status,
        query=q,
        district=district,
        farmer_id=farmer_id,
        entered_by=entered_by,
    )


def _farmer(row, viewer: User) -> FarmerRead:
    trees = list(row.trees)
    if viewer.role == "field_officer":
        trees = [tree for tree in trees if tree.registered_by == viewer.id]
    trees.sort(key=lambda tree: tree.planting_date, reverse=True)
    return FarmerRead(
        id=row.id,
        public_code=row.public_code,
        display_name=row.display_name,
        organization_id=row.organization_id,
        organization_name=row.organization.name if row.organization else None,
        province=row.province,
        district=row.district,
        sector=row.sector,
        cell=row.cell,
        village=row.village,
        isibo=row.isibo,
        household=row.household,
        phone=row.phone,
        notes=row.notes,
        data_origin=row.data_origin,
        registered_by=row.registered_by,
        registered_by_name=row.registrar.full_name if row.registrar else None,
        registered_at=row.registered_at,
        site_count=len(row.sites),
        tree_count=len(trees),
        trees=[
            FarmerTreeBrief(
                id=tree.id,
                public_code=tree.public_code,
                species_common_name=tree.species.common_name if tree.species else None,
                planting_date=tree.planting_date,
            )
            for tree in trees
        ],
        has_login=row.user_id is not None,
    )


def _profile_read(name: str, source, user: User) -> ProfileRead:
    return ProfileRead(
        display_name=name,
        phone=source.phone,
        province=source.province,
        district=source.district,
        sector=source.sector,
        cell=source.cell,
        village=source.village,
        isibo=source.isibo,
        household=source.household,
        profile_photo_at=user.profile_photo_at,
    )


def _require_profile_role(user: User) -> None:
    if user.role not in {"farmer", "field_officer"}:
        raise DomainError("This profile is for a farmer or field officer.", status_code=403)


@router.get("/profile", response_model=ProfileRead)
def get_profile(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProfileRead:
    _require_profile_role(user)
    if user.role == "farmer":
        farmer = _own_farmer(db, user)
        return _profile_read(farmer.display_name, farmer, user)
    return _profile_read(user.full_name, user, user)


@router.patch("/profile", response_model=ProfileRead)
def patch_profile(
    payload: FarmerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileRead:
    _require_profile_role(user)
    if user.role == "farmer":
        farmer = _own_farmer(db, user)
        update_farmer(db, user, farmer.id, payload)
        if payload.display_name:
            user.full_name = payload.display_name
            db.commit()
            db.refresh(farmer)
        return _profile_read(farmer.display_name, farmer, user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("display_name"):
        user.full_name = data.pop("display_name")
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return _profile_read(user.full_name, user, user)


@router.post("/profile/photo", response_model=ProfilePhotoRead)
async def post_profile_photo(
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfilePhotoRead:
    _require_profile_role(user)
    save_profile_photo(user, await file.read(2 * 1024 * 1024 + 1))
    db.commit()
    db.refresh(user)
    return ProfilePhotoRead(profile_photo_at=user.profile_photo_at)


@router.delete("/profile/photo", status_code=204)
def delete_profile_photo_route(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _require_profile_role(user)
    delete_profile_photo(user)
    db.commit()
    return Response(status_code=204)


@router.get("/profile/photo")
def get_profile_photo(user: User = Depends(get_current_user)) -> FileResponse:
    _require_profile_role(user)
    path = photo_file(user)
    if path is None:
        raise DomainError("No profile photo is saved.", status_code=404)
    return FileResponse(path, media_type=MEDIA_TYPES[user.profile_photo_ext])


def _own_farmer(db: Session, user: User):
    if user.role != "farmer":
        raise DomainError("This profile is for a smallholder account.", status_code=403)
    farmer = farmer_for_user(db, user.id)
    if farmer is None:
        raise DomainError("Your account is not linked to a household record.", status_code=404)
    return farmer


@router.get("/farmers/me", response_model=FarmerRead)
def get_my_farmer(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FarmerRead:
    farmer = _own_farmer(db, user)
    loaded = next(item for item in list_farmers(db) if item.id == farmer.id)
    return _farmer(loaded, user)


@router.patch("/farmers/me", response_model=FarmerRead)
def patch_my_farmer(
    payload: FarmerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FarmerRead:
    farmer = _own_farmer(db, user)
    update_farmer(db, user, farmer.id, payload)
    if payload.display_name:
        user.full_name = payload.display_name
        db.commit()
    loaded = next(item for item in list_farmers(db) if item.id == farmer.id)
    return _farmer(loaded, user)


@router.get("/farmers", response_model=list[FarmerRead])
def get_farmers(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[FarmerRead]:
    return [_farmer(row, user) for row in list_farmers(db)]


@router.post("/farmers", response_model=FarmerRead, status_code=201)
def post_farmer(
    payload: FarmerCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> FarmerRead:
    row, replay = create_farmer(db, user, payload)
    mark_created(response, replay)
    loaded = next(item for item in list_farmers(db) if item.id == row.id)
    return _farmer(loaded, user)


@router.patch("/farmers/{farmer_id}", response_model=FarmerRead)
def patch_farmer(
    farmer_id: uuid.UUID,
    payload: FarmerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> FarmerRead:
    update_farmer(db, user, farmer_id, payload)
    loaded = next(item for item in list_farmers(db) if item.id == farmer_id)
    return _farmer(loaded, user)


@router.post("/farmers/{farmer_id}/login", response_model=UserRead, status_code=201)
def post_farmer_login(
    farmer_id: uuid.UUID,
    payload: FarmerLoginCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> UserRead:
    account = open_farmer_login(db, user, farmer_id, payload)
    return UserRead(
        id=account.id,
        email=account.email,
        full_name=account.full_name,
        role=account.role,
        organization_id=account.organization_id,
        is_active=account.is_active,
        farmer_id=farmer_id,
    )


@router.get("/seedling-lots", response_model=list[LotRead])
def get_lots(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[LotRead]:
    return [
        LotRead(
            id=row.id,
            public_code=row.public_code,
            nursery_site_id=row.nursery_site_id,
            nursery_site_name=row.nursery_site.name if row.nursery_site else None,
            species_id=row.species_id,
            species_common_name=row.species.common_name if row.species else None,
            quantity_produced=row.quantity_produced,
            quantity_remaining=row.quantity_remaining,
            produced_on=row.produced_on,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_lots(db)
    ]


@router.post("/seedling-lots", response_model=LotRead, status_code=201)
def post_lot(
    payload: LotCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> LotRead:
    row, replay = create_lot(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_lots(db) if item.id == row.id)


@router.get("/distributions", response_model=list[DistributionRead])
def get_distributions(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[DistributionRead]:
    return [
        DistributionRead(
            id=row.id,
            public_code=row.public_code,
            seedling_lot_id=row.seedling_lot_id,
            lot_code=row.seedling_lot.public_code if row.seedling_lot else None,
            destination_site_id=row.destination_site_id,
            destination_site_name=row.destination_site.name if row.destination_site else None,
            farmer_id=row.farmer_id,
            farmer_name=row.farmer.display_name if row.farmer else None,
            quantity=row.quantity,
            distributed_on=row.distributed_on,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_distributions(db)
    ]


@router.post("/distributions", response_model=DistributionRead, status_code=201)
def post_distribution(
    payload: DistributionCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> DistributionRead:
    row, replay = create_distribution(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_distributions(db) if item.id == row.id)


def _target_code(row) -> str | None:
    if getattr(row, "tree", None) is not None:
        return row.tree.public_code
    if getattr(row, "batch", None) is not None:
        return row.batch.public_code
    if getattr(row, "site", None) is not None:
        return row.site.public_code
    return None


@router.get("/growth", response_model=list[GrowthRead])
def get_growth(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[GrowthRead]:
    return [
        GrowthRead(
            id=row.id,
            public_code=row.public_code,
            tree_id=row.tree_id,
            batch_id=row.batch_id,
            target_code=_target_code(row),
            measured_on=row.measured_on,
            height_m=row.height_m,
            dbh_cm=row.dbh_cm,
            survival_count=row.survival_count,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_growth(db)
    ]


@router.post("/growth", response_model=GrowthRead, status_code=201)
def post_growth(
    payload: GrowthCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> GrowthRead:
    row, replay = create_growth(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_growth(db) if item.id == row.id)


@router.get("/maintenance", response_model=list[MaintenanceRead])
def get_maintenance(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[MaintenanceRead]:
    return [
        MaintenanceRead(
            id=row.id,
            public_code=row.public_code,
            tree_id=row.tree_id,
            batch_id=row.batch_id,
            site_id=row.site_id,
            target_code=_target_code(row),
            activity_type=row.activity_type,
            performed_on=row.performed_on,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_maintenance(db)
    ]


@router.post("/maintenance", response_model=MaintenanceRead, status_code=201)
def post_maintenance(
    payload: MaintenanceCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> MaintenanceRead:
    row, replay = create_maintenance(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_maintenance(db) if item.id == row.id)


@router.get("/harvests", response_model=list[HarvestRead])
def get_harvests(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[HarvestRead]:
    return [
        HarvestRead(
            id=row.id,
            public_code=row.public_code,
            tree_id=row.tree_id,
            batch_id=row.batch_id,
            target_code=_target_code(row),
            harvested_on=row.harvested_on,
            quantity=row.quantity,
            quantity_remaining=row.quantity_remaining,
            unit=row.unit,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_harvests(db)
    ]


@router.post("/harvests", response_model=HarvestRead, status_code=201)
def post_harvest(
    payload: HarvestCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> HarvestRead:
    row, replay = create_harvest(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_harvests(db) if item.id == row.id)


@router.get("/sales", response_model=list[SaleRead])
def get_sales(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[SaleRead]:
    return [
        SaleRead(
            id=row.id,
            public_code=row.public_code,
            harvest_id=row.harvest_id,
            harvest_code=row.harvest.public_code if row.harvest else None,
            sold_on=row.sold_on,
            quantity=row.quantity,
            unit=row.unit,
            amount_rwf=row.amount_rwf,
            buyer_name=row.buyer_name,
            notes=row.notes,
            data_origin=row.data_origin,
        )
        for row in list_sales(db)
    ]


@router.post("/sales", response_model=SaleRead, status_code=201)
def post_sale(
    payload: SaleCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> SaleRead:
    row, replay = create_sale(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_sales(db) if item.id == row.id)


@router.get("/advisories", response_model=list[AdvisoryRead])
def get_advisories(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[AdvisoryRead]:
    return [
        AdvisoryRead(
            id=row.id,
            public_code=row.public_code,
            title=row.title,
            body=row.body,
            species_id=row.species_id,
            species_common_name=row.species.common_name if row.species else None,
            farmer_id=row.farmer_id,
            farmer_name=row.farmer.display_name if row.farmer else None,
            site_id=row.site_id,
            site_name=row.site.name if row.site else None,
            issued_on=row.issued_on,
            data_origin=row.data_origin,
        )
        for row in list_advisories(db)
    ]


@router.post("/advisories", response_model=AdvisoryRead, status_code=201)
def post_advisory(
    payload: AdvisoryCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> AdvisoryRead:
    row, replay = create_advisory(db, user, payload)
    mark_created(response, replay)
    return next(item for item in get_advisories(db) if item.id == row.id)


@router.get("/overview/mine", response_model=FarmerOverview)
def my_overview(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FarmerOverview:
    return collect_farmer_overview(db, user)


@router.get("/overview/officer", response_model=OfficerOverview)
def officer_overview(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OfficerOverview:
    return collect_officer_overview(db, user)


@router.get("/overview/country", response_model=CountryOverview)
def country_overview(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CountryOverview:
    if user.role != "viewer":
        raise DomainError("This overview is for a viewer account.", status_code=403)
    return collect_country_overview(db)


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalyticsResponse:
    return collect_analytics(db, user, start_date=start_date, end_date=end_date)


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    district: str | None = Query(default=None),
    species_id: uuid.UUID | None = Query(default=None),
    range: str = Query(default="90"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardResponse:
    return collect_dashboard(
        db,
        user,
        district=district,
        species_id=species_id,
        range_name=range,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/dashboard/map", response_model=MapResponse)
def dashboard_map(
    district: str | None = Query(default=None),
    species_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MapResponse:
    farmer_id = None
    entered_by = None
    if user.role == "field_officer":
        entered_by = user.id
    elif user.role == "farmer":
        farmer_id = db.scalar(select(Farmer.id).where(Farmer.user_id == user.id))
        if farmer_id is None:
            return MapResponse(features=[], unlocated=[], truncated=False)
    result = build_map(
        db,
        kind=None,
        species_id=species_id,
        category=None,
        status=None,
        query=None,
        district=district,
        farmer_id=farmer_id,
        entered_by=entered_by,
    )
    if user.role == "viewer":
        # Public dashboard cards expose species and geography, never household labels.
        for feature in result.features:
            feature.properties.title = feature.properties.species_common_name or "Planting site"
            feature.properties.subtitle = district or "Rwanda"
        for record in result.unlocated:
            record.title = "Record without coordinates"
    return result


@router.post("/assistant", response_model=AssistantReply)
def ask_assistant(
    payload: AssistantRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssistantReply:
    messages = [(item.role, item.content) for item in payload.messages]
    if not any(role == "user" for role, _ in messages):
        raise DomainError("Write a message first.")
    return AssistantReply(reply=assistant_reply(db, user, messages))


@router.get("/audit", response_model=Page[AuditRead])
def get_audit(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Page[AuditRead]:
    rows, total = list_audit(db, page=page, page_size=page_size)
    return Page(
        items=[audit_to_read(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
