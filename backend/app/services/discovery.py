"""Buyer discovery of expected harvests.

A request records interest only. It does not change the forecast or a recorded harvest.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.domain.errors import DomainError
from app.models.entities import Farmer, HarvestInterest, User
from app.schemas.valuechain import (
    HarvestInterestCreate,
    HarvestInterestRead,
    HarvestInterestUpdate,
    HarvestOffer,
)
from app.services.common import allocate_code, utcnow, write_audit
from app.services.dashboard import household_id
from app.services.forecast import _estimates
from app.services.registration import _commit

MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
NEXT_STATUS = {
    "pending": {"accepted", "rejected", "cancelled"},
    "accepted": {"completed", "cancelled"},
}


def collect_offers(db: Session, user: User) -> list[HarvestOffer]:
    grouped: dict[tuple, dict] = {}
    for row in _estimates(db, user):
        if row["farmer_id"] is None or row["low"] is None or row["unit"] is None:
            continue
        key = (row["farmer_id"], row["species_id"], row["district"] or "", row["unit"])
        bucket = grouped.get(key)
        if bucket is None:
            bucket = {
                "farmer_id": row["farmer_id"],
                "farmer_name": row["farmer"] or "Household",
                "species_id": row["species_id"],
                "species": row["species"],
                "sites": set(),
                "provinces": set(),
                "sectors": set(),
                "months": set(),
                "trees": 0,
                "low": 0.0,
                "high": 0.0,
                "unit": row["unit"],
                "district": row["district"],
            }
            grouped[key] = bucket
        bucket["trees"] += row["trees"]
        bucket["low"] += row["low"]
        bucket["high"] += row["high"]
        bucket["months"].update(row["months"])
        if row["site_name"]:
            bucket["sites"].add(row["site_name"])
        if row["province"]:
            bucket["provinces"].add(row["province"])
        if row["sector"]:
            bucket["sectors"].add(row["sector"])
    offers = []
    for bucket in grouped.values():
        months = sorted(bucket["months"])
        period = (
            ", ".join(MONTHS[month - 1] for month in months)
            if months
            else "When these trees are productive"
        )
        sites = bucket["sites"]
        offers.append(
            HarvestOffer(
                farmer_id=bucket["farmer_id"],
                farmer_name=bucket["farmer_name"],
                species_id=bucket["species_id"],
                species_common_name=bucket["species"],
                farm_label=next(iter(sites))
                if len(sites) == 1
                else "Several farms"
                if sites
                else None,
                province=next(iter(bucket["provinces"])) if len(bucket["provinces"]) == 1 else None,
                district=bucket["district"],
                sector=next(iter(bucket["sectors"])) if len(bucket["sectors"]) == 1 else None,
                trees=bucket["trees"],
                unit=bucket["unit"],
                low=round(bucket["low"], 2),
                high=round(bucket["high"], 2),
                period=period,
            )
        )
    offers.sort(
        key=lambda offer: (offer.species_common_name, offer.farmer_name, offer.district or "")
    )
    return offers


def _match(offers: list[HarvestOffer], payload: HarvestInterestCreate) -> HarvestOffer:
    district = payload.district or None
    for offer in offers:
        if (
            offer.farmer_id == payload.farmer_id
            and offer.species_id == payload.species_id
            and offer.unit == payload.unit
            and (offer.district or None) == district
        ):
            return offer
    raise DomainError("That expected harvest is no longer available.", status_code=404)


def _read(row: HarvestInterest) -> HarvestInterestRead:
    return HarvestInterestRead(
        id=row.id,
        public_code=row.public_code,
        farmer_id=row.farmer_id,
        farmer_name=row.farmer.display_name,
        species_common_name=row.species.common_name,
        farm_label=row.farm_label,
        province=row.province,
        district=row.district,
        sector=row.sector,
        quantity=row.quantity,
        unit=row.unit,
        period=row.period,
        notes=row.notes,
        status=row.status,
        response_note=row.response_note,
        requester_name=row.requester.full_name,
        created_at=row.created_at,
    )


def _visible(db: Session, user: User):
    statement = (
        select(HarvestInterest)
        .options(
            joinedload(HarvestInterest.farmer),
            joinedload(HarvestInterest.species),
            joinedload(HarvestInterest.requester),
        )
        .order_by(HarvestInterest.created_at.desc())
    )
    if user.role == "admin":
        return statement
    if user.role == "viewer":
        return statement.where(HarvestInterest.requester_id == user.id)
    if user.role == "farmer":
        farmer_id = household_id(db, user)
        if farmer_id is None:
            return statement.where(HarvestInterest.id.is_(None))
        return statement.where(HarvestInterest.farmer_id == farmer_id)
    return statement.join(Farmer, HarvestInterest.farmer_id == Farmer.id).where(
        Farmer.registered_by == user.id
    )


def list_interests(db: Session, user: User) -> list[HarvestInterestRead]:
    rows = db.scalars(_visible(db, user)).unique().all()
    return [_read(row) for row in rows]


def create_interest(db: Session, user: User, payload: HarvestInterestCreate) -> HarvestInterestRead:
    if user.role != "viewer":
        raise DomainError("Only a viewer account can request a forecast.", status_code=403)
    offer = _match(collect_offers(db, user), payload)
    existing = db.scalar(
        select(HarvestInterest.id).where(
            HarvestInterest.requester_id == user.id,
            HarvestInterest.farmer_id == offer.farmer_id,
            HarvestInterest.species_id == offer.species_id,
            HarvestInterest.unit == offer.unit,
            HarvestInterest.district == offer.district,
            HarvestInterest.status == "pending",
        )
    )
    if existing is not None:
        raise DomainError("You already have a pending request for this forecast.", status_code=409)
    row = HarvestInterest(
        public_code=allocate_code(db, HarvestInterest, "INT"),
        requester_id=user.id,
        farmer_id=offer.farmer_id,
        species_id=offer.species_id,
        province=offer.province,
        district=offer.district,
        sector=offer.sector,
        farm_label=offer.farm_label,
        quantity=payload.quantity,
        unit=payload.unit,
        period=payload.period,
        notes=payload.notes,
        status="pending",
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        user,
        "create",
        "harvest_interest",
        row.id,
        ["farmer_id", "species_id", "quantity", "period"],
    )
    _commit(db)
    saved = db.scalar(
        select(HarvestInterest)
        .options(
            joinedload(HarvestInterest.farmer),
            joinedload(HarvestInterest.species),
            joinedload(HarvestInterest.requester),
        )
        .where(HarvestInterest.id == row.id)
    )
    return _read(saved)


def _can_answer(user: User, farmer: Farmer) -> bool:
    if user.role == "admin":
        return True
    if user.role == "farmer":
        return farmer.user_id == user.id
    if user.role == "field_officer":
        return farmer.registered_by == user.id
    return False


def update_interest(
    db: Session, user: User, interest_id: uuid.UUID, payload: HarvestInterestUpdate
) -> HarvestInterestRead:
    row = db.scalar(
        select(HarvestInterest)
        .options(joinedload(HarvestInterest.farmer))
        .where(HarvestInterest.id == interest_id)
    )
    if row is None:
        raise DomainError("Request not found.", status_code=404)
    if payload.status not in NEXT_STATUS.get(row.status, set()):
        raise DomainError("That status change is not available.", status_code=409)
    if user.role == "viewer":
        if row.requester_id != user.id or payload.status != "cancelled":
            raise DomainError(
                "You can cancel your own pending or accepted request.", status_code=403
            )
    elif not _can_answer(user, row.farmer):
        raise DomainError("You cannot answer this request.", status_code=403)
    row.status = payload.status
    row.response_note = payload.response_note
    row.responded_by = user.id
    row.updated_at = utcnow()
    write_audit(db, user, "update", "harvest_interest", row.id, ["status"])
    _commit(db)
    saved = db.scalar(
        select(HarvestInterest)
        .options(
            joinedload(HarvestInterest.farmer),
            joinedload(HarvestInterest.species),
            joinedload(HarvestInterest.requester),
        )
        .where(HarvestInterest.id == row.id)
    )
    return _read(saved)
