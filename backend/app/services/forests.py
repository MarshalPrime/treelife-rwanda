"""Save a forest boundary and calculate its area in hectares."""

from __future__ import annotations

import uuid

from geoalchemy2 import Geography
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.domain.errors import DomainError
from app.models.entities import DataOrigin, Forest, Species, User
from app.schemas.forests import ForestCreate, ForestPoint, ForestRead
from app.services.common import allocate_code, find_by_request_id, utcnow, write_audit
from app.services.registration import _commit


def _clean_ring(points: list[ForestPoint]) -> list[list[float]]:
    ring: list[list[float]] = []
    for point in points:
        pair = [round(float(point.longitude), 6), round(float(point.latitude), 6)]
        if ring and ring[-1] == pair:
            continue
        ring.append(pair)
    if len(ring) >= 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        raise DomainError(
            "A forest boundary needs at least three corners.",
            status_code=422,
            field="boundary",
        )
    return ring


def _store_boundary(db: Session, row: Forest, ring: list[list[float]]) -> None:
    closed = [*ring, ring[0]]
    coords = ", ".join(f"{lon:.6f} {lat:.6f}" for lon, lat in closed)
    row.ring = ring
    row.boundary = WKTElement(f"POLYGON(({coords}))", srid=4326)
    row.longitude = sum(point[0] for point in ring) / len(ring)
    row.latitude = sum(point[1] for point in ring) / len(ring)
    db.flush()
    valid = db.scalar(select(func.ST_IsValid(row.boundary)))
    if not valid:
        raise DomainError(
            "The boundary crosses itself. Draw a simple outline.",
            status_code=422,
            field="boundary",
        )
    area_m2 = db.scalar(
        select(
            func.ST_Area(cast(Forest.boundary, Geography(geometry_type="POLYGON", srid=4326)))
        ).where(Forest.id == row.id)
    )
    hectares = float(area_m2 or 0) / 10_000
    if hectares < 0.01:
        raise DomainError(
            "That boundary is too small. Draw the outline of the stand.",
            status_code=422,
            field="boundary",
        )
    row.area_hectares = round(hectares, 2)


def _require_species(db: Session, species_id: uuid.UUID) -> Species:
    species = db.get(Species, species_id)
    if species is None:
        raise DomainError("Species was not found.", status_code=422, field="species_id")
    return species


def to_read(row: Forest) -> ForestRead:
    return ForestRead(
        id=row.id,
        public_code=row.public_code,
        name=row.name,
        species_id=row.species_id,
        species_common_name=row.species.common_name if row.species else None,
        estimated_trees=row.estimated_trees,
        distribution=row.distribution,
        status=row.status,
        description=row.description,
        province=row.province,
        district=row.district,
        area_hectares=row.area_hectares,
        latitude=row.latitude,
        longitude=row.longitude,
        boundary=[ForestPoint(longitude=lon, latitude=lat) for lon, lat in row.ring],
        data_origin=row.data_origin,
        registered_by_name=row.registrar.full_name if row.registrar else None,
        registered_at=row.registered_at,
    )


def _loaded(db: Session, forest_id: uuid.UUID) -> Forest | None:
    return db.scalar(
        select(Forest)
        .options(joinedload(Forest.species), joinedload(Forest.registrar))
        .where(Forest.id == forest_id)
    )


def create_forest(
    db: Session,
    user: User,
    payload: ForestCreate,
    *,
    origin: str = DataOrigin.field_entry.value,
    commit: bool = True,
) -> tuple[Forest, bool]:
    existing = find_by_request_id(db, Forest, payload.client_request_id)
    if existing is not None:
        loaded = _loaded(db, existing.id)
        return loaded or existing, True
    _require_species(db, payload.species_id)
    row = Forest(
        id=uuid.uuid4(),
        public_code=allocate_code(db, Forest, "FOREST"),
        name=payload.name or "Forest",
        species_id=payload.species_id,
        estimated_trees=payload.estimated_trees,
        distribution=payload.distribution,
        status=payload.status,
        description=payload.description,
        province=payload.province,
        district=payload.district,
        area_hectares=0.01,
        ring=[],
        boundary=WKTElement("POLYGON((0 0, 0 0.001, 0.001 0.001, 0 0))", srid=4326),
        data_origin=origin,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
        registered_at=utcnow(),
    )
    db.add(row)
    _store_boundary(db, row, _clean_ring(payload.boundary))
    write_audit(db, user, "create", "forest", row.id, ["name", "boundary", "estimated_trees"])
    if commit:
        _commit(db)
    loaded = _loaded(db, row.id)
    return loaded or row, False


def update_forest(db: Session, user: User, forest_id: uuid.UUID, payload: ForestCreate) -> Forest:
    row = _loaded(db, forest_id)
    if row is None:
        raise DomainError("Forest was not found.", status_code=404)
    _require_species(db, payload.species_id)
    row.name = payload.name or row.name
    row.species_id = payload.species_id
    row.estimated_trees = payload.estimated_trees
    row.distribution = payload.distribution
    row.status = payload.status
    row.description = payload.description
    row.province = payload.province
    row.district = payload.district
    _store_boundary(db, row, _clean_ring(payload.boundary))
    write_audit(
        db,
        user,
        "update",
        "forest",
        row.id,
        ["name", "boundary", "estimated_trees", "status", "distribution"],
    )
    _commit(db)
    return _loaded(db, row.id) or row


def get_forest(db: Session, forest_id: uuid.UUID) -> Forest:
    row = _loaded(db, forest_id)
    if row is None:
        raise DomainError("Forest was not found.", status_code=404)
    return row


def list_forests(
    db: Session,
    *,
    query: str | None,
    distribution: str | None,
    status: str | None,
    species_id: uuid.UUID | None,
    district: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Forest], int]:
    stmt = select(Forest).options(joinedload(Forest.species), joinedload(Forest.registrar))
    if distribution:
        stmt = stmt.where(Forest.distribution == distribution)
    if status:
        stmt = stmt.where(Forest.status == status)
    if species_id:
        stmt = stmt.where(Forest.species_id == species_id)
    if district and district.strip():
        stmt = stmt.where(Forest.district.ilike(district.strip()))
    if query and query.strip():
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                Forest.name.ilike(like),
                Forest.public_code.ilike(like),
                Forest.district.ilike(like),
                Forest.description.ilike(like),
            )
        )
    total = len(db.scalars(stmt).unique().all())
    rows = (
        db.scalars(
            stmt.order_by(Forest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        .unique()
        .all()
    )
    return list(rows), total
