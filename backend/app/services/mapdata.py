"""GeoJSON for the registration map. Coordinates are returned as [longitude, latitude]."""

from __future__ import annotations

import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.entities import Forest, IndividualTree, PlantingBatch, PlantingSite, Species
from app.schemas.entities import MapFeature, MapFeatureProperties, MapResponse, UnlocatedRecord

MAX_FEATURES = 2000


def _feature(
    kind: str, record, title: str, subtitle: str, category: str | None, species_name: str | None
):
    return MapFeature(
        geometry={
            "type": "Point",
            "coordinates": [record.longitude, record.latitude],
        },
        properties=MapFeatureProperties(
            id=record.id,
            kind=kind,
            public_code=record.public_code,
            title=title,
            subtitle=subtitle,
            status=record.status,
            category=category,
            data_origin=record.data_origin,
            species_common_name=species_name,
        ),
    )


def _unlocated(kind: str, record, title: str) -> UnlocatedRecord:
    return UnlocatedRecord(id=record.id, kind=kind, public_code=record.public_code, title=title)


def _query_text(model, query: str | None, extra=()):
    if not query:
        return None
    like = f"%{query.strip()}%"
    parts = [model.public_code.ilike(like), *extra]
    return or_(*parts)


def build_map(
    db: Session,
    *,
    kind: str | None,
    species_id: uuid.UUID | None,
    category: str | None,
    status: str | None,
    query: str | None,
    district: str | None = None,
    farmer_id: uuid.UUID | None = None,
    entered_by: uuid.UUID | None = None,
) -> MapResponse:
    features: list[MapFeature] = []
    unlocated: list[UnlocatedRecord] = []
    truncated = False
    selected = kind or "all"

    def room() -> int:
        return MAX_FEATURES - len(features) - len(unlocated)

    if selected in {"all", "site"} and species_id is None and category is None:
        stmt = select(PlantingSite).options(joinedload(PlantingSite.organization))
        if status in {"active", "inactive"}:
            stmt = stmt.where(PlantingSite.status == status)
        elif status:
            stmt = stmt.where(PlantingSite.id.is_(None))
        text_filter = _query_text(
            PlantingSite,
            query,
            (
                PlantingSite.name.ilike(f"%{query.strip()}%")
                if query
                else PlantingSite.name.is_not(None),
                PlantingSite.district.ilike(f"%{query.strip()}%")
                if query
                else PlantingSite.name.is_not(None),
            ),
        )
        if query and text_filter is not None:
            stmt = stmt.where(text_filter)
        if district:
            stmt = stmt.where(PlantingSite.district.ilike(district.strip()))
        if farmer_id:
            stmt = stmt.where(PlantingSite.farmer_id == farmer_id)
        if entered_by:
            stmt = stmt.where(PlantingSite.registered_by == entered_by)
        rows = (
            db.scalars(stmt.order_by(PlantingSite.created_at.desc()).limit(MAX_FEATURES + 1))
            .unique()
            .all()
        )
        if len(rows) > room():
            truncated = True
        for site in rows:
            if room() <= 0:
                truncated = True
                break
            title = site.name
            if site.latitude is None or site.longitude is None:
                unlocated.append(_unlocated("site", site, title))
            else:
                site_district = site.district or "Location not specified"
                features.append(_feature("site", site, title, site_district, None, None))

    def add_planted(model, kind_name: str, label: str) -> None:
        nonlocal truncated
        if selected not in {"all", kind_name}:
            return
        if room() <= 0:
            truncated = True
            return
        stmt = (
            select(model)
            .options(joinedload(model.site), joinedload(model.species))
            .join(model.species)
            .join(model.site)
        )
        if species_id:
            stmt = stmt.where(model.species_id == species_id)
        if category:
            stmt = stmt.where(model.category == category)
        if status:
            stmt = stmt.where(model.status == status)
        if district:
            stmt = stmt.where(PlantingSite.district.ilike(district.strip()))
        if farmer_id:
            stmt = stmt.where(
                or_(
                    model.farmer_id == farmer_id,
                    and_(model.farmer_id.is_(None), PlantingSite.farmer_id == farmer_id),
                )
            )
        if entered_by:
            stmt = stmt.where(model.registered_by == entered_by)
        if query:
            like = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    model.public_code.ilike(like),
                    model.notes.ilike(like),
                    Species.common_name.ilike(like),
                    PlantingSite.name.ilike(like),
                    PlantingSite.district.ilike(like),
                )
            )
        rows = db.scalars(stmt.order_by(model.created_at.desc()).limit(room() + 1)).unique().all()
        if len(rows) > room():
            truncated = True
        for record in rows:
            if room() <= 0:
                truncated = True
                break
            species_name = record.species.common_name if record.species else label
            title = f"{record.public_code} · {species_name}"
            subtitle = record.site.name if record.site else label
            if record.latitude is None or record.longitude is None:
                unlocated.append(_unlocated(kind_name, record, title))
            else:
                features.append(
                    _feature(kind_name, record, title, subtitle, record.category, species_name)
                )

    add_planted(IndividualTree, "tree", "Individual tree")
    add_planted(PlantingBatch, "batch", "Planting batch")
    if _add_forests_into(
        db,
        features,
        selected=selected,
        species_id=species_id,
        category=category,
        status=status,
        query=query,
        district=district,
        entered_by=entered_by,
    ):
        truncated = True
    return MapResponse(features=features, unlocated=unlocated, truncated=truncated)


def _add_forests_into(
    db: Session,
    features: list[MapFeature],
    *,
    selected: str,
    species_id: uuid.UUID | None,
    category: str | None,
    status: str | None,
    query: str | None,
    district: str | None,
    entered_by: uuid.UUID | None,
) -> bool:
    """Return whether the result was truncated. Forests stay visible for every farmer."""

    if selected not in {"all", "forest"} or category:
        return False
    room = MAX_FEATURES - len(features)
    if room <= 0:
        return True
    stmt = select(Forest).options(joinedload(Forest.species))
    if species_id:
        stmt = stmt.where(Forest.species_id == species_id)
    if status:
        stmt = stmt.where(Forest.status == status)
    if district:
        stmt = stmt.where(Forest.district.ilike(district.strip()))
    if entered_by:
        stmt = stmt.where(Forest.registered_by == entered_by)
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
    rows = db.scalars(stmt.order_by(Forest.created_at.desc()).limit(room + 1)).unique().all()
    truncated = len(rows) > room
    for row in rows[:room]:
        if not row.ring or len(row.ring) < 3:
            continue
        ring = [[float(lon), float(lat)] for lon, lat in row.ring]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        species_name = row.species.common_name if row.species else None
        place = row.district or row.province or "Forest stand"
        features.append(
            MapFeature(
                geometry={"type": "Polygon", "coordinates": [ring]},
                properties=MapFeatureProperties(
                    id=row.id,
                    kind="forest",
                    public_code=row.public_code,
                    title=row.name,
                    subtitle=place,
                    status=row.status,
                    category=None,
                    data_origin=row.data_origin,
                    species_common_name=species_name,
                    area_hectares=row.area_hectares,
                    estimated_trees=row.estimated_trees,
                    distribution=row.distribution,
                ),
            )
        )
    return truncated
