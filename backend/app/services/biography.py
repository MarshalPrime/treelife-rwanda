"""A tree biography assembled from the records already stored for that tree."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    GrowthMeasurement,
    Harvest,
    LifecycleEvent,
    MaintenanceActivity,
    Sale,
    User,
)
from app.services.registration import get_tree

_METHODS = {
    "ground": "Planted in the ground",
    "transplant": "Transplanted from a nursery",
    "direct_seeding": "Direct seeding",
    "natural": "Natural regeneration",
    "other": "Other planting method",
}
_EVENTS = {
    "inspection": ("inspection", "Inspection"),
    "survival_check": ("inspection", "Survival check"),
    "maintenance": ("care", "Care"),
    "harvest_observation": ("harvest", "Harvest note"),
    "other": ("note", "Observation"),
}
_CARE = {
    "watering": ("watering", "Watering"),
    "fertilizer": ("treatment", "Fertilizer"),
    "pest_control": ("treatment", "Pesticide or herbicide"),
    "pruning": ("care", "Pruning"),
    "weeding": ("care", "Weeding"),
    "mulching": ("care", "Mulching"),
    "staking": ("care", "Staking"),
    "environmental": ("environment", "Environmental damage"),
    "other": ("note", "Other care"),
}
_USES = {
    "sold": "Sold",
    "personal_consumption": "Personal consumption",
    "stored": "Stored",
    "given_away": "Given away",
    "other": "Other use",
}
_ORDER = {
    "planting": 0,
    "care": 1,
    "watering": 1,
    "treatment": 1,
    "inspection": 2,
    "environment": 2,
    "note": 2,
    "harvest": 3,
    "use": 4,
}


def collect_tree_biography(db: Session, user: User, tree_id: uuid.UUID) -> list[dict]:
    tree = get_tree(db, tree_id)
    hide_names = user.role == "viewer"
    entries: list[dict] = [_planting(tree, hide_names)]

    events = (
        db.scalars(
            select(LifecycleEvent)
            .options(joinedload(LifecycleEvent.recorder))
            .where(LifecycleEvent.tree_id == tree.id)
        )
        .unique()
        .all()
    )
    for event in events:
        chapter, title = _EVENTS.get(event.event_type, ("note", "Observation"))
        detail = _join(
            [
                event.notes,
                f"Status afterwards: {event.status_after}" if event.status_after else None,
            ]
        )
        entries.append(
            _entry(
                event.id,
                event.event_date,
                chapter,
                title,
                detail,
                event.public_code,
                None if hide_names else _name(event.recorder),
            )
        )

    care_rows = (
        db.scalars(
            select(MaintenanceActivity)
            .options(joinedload(MaintenanceActivity.registrar))
            .where(MaintenanceActivity.tree_id == tree.id)
        )
        .unique()
        .all()
    )
    for row in care_rows:
        chapter, title = _CARE.get(row.activity_type, ("note", "Other care"))
        entries.append(
            _entry(
                row.id,
                row.performed_on,
                chapter,
                title,
                row.notes,
                row.public_code,
                None if hide_names else _name(row.registrar),
            )
        )

    growth_rows = (
        db.scalars(
            select(GrowthMeasurement)
            .options(joinedload(GrowthMeasurement.registrar))
            .where(GrowthMeasurement.tree_id == tree.id)
        )
        .unique()
        .all()
    )
    for row in growth_rows:
        measures = []
        if row.height_m is not None:
            measures.append(f"Height {row.height_m:g} m")
        if row.dbh_cm is not None:
            measures.append(f"Diameter {row.dbh_cm:g} cm")
        entries.append(
            _entry(
                row.id,
                row.measured_on,
                "inspection",
                "Growth measured",
                _join([*measures, row.notes]),
                row.public_code,
                None if hide_names else _name(row.registrar),
            )
        )

    harvests = list(
        db.scalars(
            select(Harvest).options(joinedload(Harvest.registrar)).where(Harvest.tree_id == tree.id)
        )
        .unique()
        .all()
    )
    harvest_ids = [row.id for row in harvests]
    for row in harvests:
        entries.append(
            _entry(
                row.id,
                row.harvested_on,
                "harvest",
                "Harvest",
                _join([f"{row.quantity:g} {row.unit}", row.notes]),
                row.public_code,
                None if hide_names else _name(row.registrar),
            )
        )
    if harvest_ids:
        sales = (
            db.scalars(
                select(Sale)
                .options(joinedload(Sale.registrar))
                .where(Sale.harvest_id.in_(harvest_ids))
            )
            .unique()
            .all()
        )
        for row in sales:
            buyer = None if hide_names else row.buyer_name
            entries.append(
                _entry(
                    row.id,
                    row.sold_on,
                    "use",
                    _USES.get(row.purpose, "Harvest use"),
                    _join([f"{row.quantity:g} {row.unit}", buyer, row.notes]),
                    row.public_code,
                    None if hide_names else _name(row.registrar),
                )
            )

    entries.sort(key=lambda item: (item["occurred_on"], _ORDER.get(item["chapter"], 9), item["id"]))
    return entries


def _planting(tree, hide_names: bool) -> dict:
    care = []
    if tree.watering_provided == "yes":
        care.append("Water was provided at planting")
    if tree.fertilizer_applied == "yes":
        care.append("Fertilizer was applied at planting")
    if tree.mulching_applied == "yes":
        care.append("Mulch was applied at planting")
    place = ", ".join(
        part for part in (tree.site.name if tree.site else None, tree.district) if part
    )
    farmer = None if hide_names or tree.farmer is None else tree.farmer.display_name
    detail = _join(
        [
            _METHODS.get(tree.planting_method or ""),
            place or None,
            farmer,
            *care,
            tree.notes,
        ]
    )
    return _entry(
        tree.id,
        tree.planting_date,
        "planting",
        "Planted",
        detail,
        tree.public_code,
        None if hide_names else _name(tree.registrar),
    )


def _entry(
    source_id: uuid.UUID,
    occurred_on: date,
    chapter: str,
    title: str,
    detail: str | None,
    public_code: str | None,
    recorded_by_name: str | None,
) -> dict:
    return {
        "id": str(source_id),
        "occurred_on": occurred_on,
        "chapter": chapter,
        "title": title,
        "detail": detail,
        "public_code": public_code,
        "recorded_by_name": recorded_by_name,
    }


def _name(user: User | None) -> str | None:
    return user.full_name if user is not None else None


def _join(parts: list[str | None]) -> str | None:
    text = ". ".join(part.strip().rstrip(".") for part in parts if part and part.strip())
    return text or None
