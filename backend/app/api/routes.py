"""HTTP routes for registration, inspection, and the map."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin, require_writer
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.domain.errors import DomainError
from app.models.entities import User
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
    SiteCreate,
    SiteRead,
    SiteUpdate,
    SpeciesCreate,
    SpeciesRead,
    StatsResponse,
    TokenResponse,
    TreeCreate,
    TreeRead,
    TreeUpdate,
    UserRead,
)
from app.services.mapdata import build_map
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
    update_batch,
    update_site,
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
        postgis = db.execute(text("SELECT PostGIS_Version()")).scalar_one()
    except Exception as exc:
        raise DomainError("Database is unavailable.", status_code=503) from exc
    return {"status": "ok", "database": "ok", "postgis": postgis}


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
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/stats", response_model=StatsResponse)
def stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> StatsResponse:
    return collect_stats(db)


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
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SpeciesRead]:
    return [species_to_read(item) for item in list_species(db, q)]


@router.post("/species", response_model=SpeciesRead, status_code=201)
def post_species(
    payload: SpeciesCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> SpeciesRead:
    return species_to_read(create_species(db, user, payload))


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
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MapResponse:
    return build_map(
        db, kind=kind, species_id=species_id, category=category, status=status, query=q
    )


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
