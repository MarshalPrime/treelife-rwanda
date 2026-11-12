"""Harvest destinations, feedback, and attention notices.

These writes do not call the FMES adapter.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.domain.errors import DomainError
from app.models.entities import (
    DataOrigin,
    Harvest,
    HarvestFeedback,
    HarvestNotice,
    Sale,
    User,
    UserRole,
)
from app.schemas.valuechain import (
    HarvestFeedbackCreate,
    HarvestFeedbackRead,
    HarvestHistoryItem,
    HarvestNoticeRead,
    HarvestOverview,
    HarvestShare,
    SaleCreate,
)
from app.services.common import allocate_code, find_by_request_id, write_audit
from app.services.registration import _commit

FARMER_KINDS = {"experience", "challenge", "loss", "suggestion"}
OFFICER_KINDS = {"observation", "verification", "challenge", "recommendation"}
PURPOSES = ("sold", "personal_consumption", "stored", "given_away", "other")


def _target_code(row: Harvest) -> str | None:
    if row.tree is not None:
        return row.tree.public_code
    if row.batch is not None:
        return row.batch.public_code
    return None


def _name(user: User | None) -> str:
    return user.full_name if user is not None else "Unknown"


def _excerpt(body: str) -> str:
    text = " ".join(body.split())
    if len(text) <= 80:
        return text
    return f"{text[:77]}..."


def _save(db: Session, user: User, row, entity_type: str, fields: list[str]):
    db.add(row)
    db.flush()
    write_audit(db, user, "create", entity_type, row.id, fields)
    row_id = row.id
    model = type(row)
    request_id = getattr(row, "client_request_id", None)
    try:
        _commit(db)
    except DomainError:
        if request_id:
            raced = find_by_request_id(db, model, request_id)
            if raced is not None:
                return raced, True
        raise
    return db.get(model, row_id), False


def reject_duplicate_destination(db: Session, payload: SaleCreate) -> None:
    rows = db.scalars(
        select(Sale).where(
            Sale.harvest_id == payload.harvest_id,
            Sale.purpose == payload.purpose,
            Sale.sold_on == payload.sold_on,
            Sale.buyer_name == payload.buyer_name,
            Sale.notes == payload.notes,
        )
    ).all()
    for row in rows:
        if abs(row.quantity - payload.quantity) < 1e-6:
            raise DomainError(
                "That quantity, date, and destination are already recorded for this harvest.",
                status_code=409,
            )


def flag_unusual_harvest(db: Session, user: User, row: Harvest) -> None:
    target = Harvest.tree_id == row.tree_id if row.tree_id else Harvest.batch_id == row.batch_id
    earlier = list(db.scalars(select(Harvest.quantity).where(target)))
    peak = max(earlier, default=0.0)
    if peak < 1 or row.quantity < peak * 3:
        return
    db.add(
        HarvestNotice(
            public_code=allocate_code(db, HarvestNotice, "NOTE"),
            kind="unusual",
            summary=(
                f"{row.public_code} records {row.quantity:g} {row.unit}, at least three times "
                "the largest earlier harvest of this tree or batch."
            )[:400],
            harvest_id=row.id,
            registered_by=user.id,
        )
    )


def _add(totals: dict[str, float], unit: str, purpose: str, quantity: float) -> None:
    key = "kg" if unit == "kg" else "count"
    totals[f"{purpose}_{key}"] += quantity


def harvest_overview(db: Session) -> HarvestOverview:
    harvests = list(
        db.scalars(
            select(Harvest)
            .options(
                joinedload(Harvest.tree),
                joinedload(Harvest.batch),
                joinedload(Harvest.registrar),
            )
            .order_by(Harvest.harvested_on.desc(), Harvest.created_at.desc())
        )
        .unique()
        .all()
    )
    sales = list(
        db.scalars(
            select(Sale)
            .options(joinedload(Sale.harvest), joinedload(Sale.registrar))
            .order_by(Sale.sold_on.desc(), Sale.created_at.desc())
        )
        .unique()
        .all()
    )
    totals = {
        f"{purpose}_{unit}": 0.0
        for purpose in (*PURPOSES, "unassigned")
        for unit in ("kg", "count")
    }
    totals["harvested_kg"] = 0.0
    totals["harvested_count"] = 0.0
    totals["sales_rwf"] = 0.0
    grouped: dict[uuid.UUID, dict[str, float]] = {}
    for sale in sales:
        grouped.setdefault(sale.harvest_id, {purpose: 0.0 for purpose in PURPOSES})
        grouped[sale.harvest_id][sale.purpose] += sale.quantity
        _add(totals, sale.unit, sale.purpose, sale.quantity)
        if sale.purpose == "sold":
            totals["sales_rwf"] += sale.amount_rwf
    shares: list[HarvestShare] = []
    history: list[HarvestHistoryItem] = []
    for row in harvests:
        parts = grouped.get(row.id, {purpose: 0.0 for purpose in PURPOSES})
        assigned = sum(parts.values())
        unit_key = "kg" if row.unit == "kg" else "count"
        totals[f"harvested_{unit_key}"] += row.quantity
        totals[f"unassigned_{unit_key}"] += row.quantity_remaining
        balanced = abs(assigned + row.quantity_remaining - row.quantity) < 0.05
        shares.append(
            HarvestShare(
                harvest_id=row.id,
                public_code=row.public_code,
                target_code=_target_code(row),
                harvested_on=row.harvested_on,
                quantity=row.quantity,
                unit=row.unit,
                sold=parts["sold"],
                personal_consumption=parts["personal_consumption"],
                stored=parts["stored"],
                given_away=parts["given_away"],
                other=parts["other"],
                unassigned=row.quantity_remaining,
                balanced=balanced,
                recorded_by=_name(row.registrar),
            )
        )
        history.append(
            HarvestHistoryItem(
                public_code=row.public_code,
                kind="harvest",
                occurred_on=row.harvested_on,
                target_code=_target_code(row),
                quantity=row.quantity,
                unit=row.unit,
                purpose=None,
                amount_rwf=None,
                buyer_name=None,
                recorded_by=_name(row.registrar),
                harvest_code=row.public_code,
            )
        )
    for sale in sales:
        history.append(
            HarvestHistoryItem(
                public_code=sale.public_code,
                kind="destination",
                occurred_on=sale.sold_on,
                target_code=None,
                quantity=sale.quantity,
                unit=sale.unit,
                purpose=sale.purpose,
                amount_rwf=sale.amount_rwf,
                buyer_name=sale.buyer_name,
                recorded_by=_name(sale.registrar),
                harvest_code=sale.harvest.public_code if sale.harvest else None,
            )
        )
    history.sort(key=lambda item: (item.occurred_on, item.public_code), reverse=True)
    return HarvestOverview(
        harvested_kg=totals["harvested_kg"],
        harvested_count=totals["harvested_count"],
        sold_kg=totals["sold_kg"],
        sold_count=totals["sold_count"],
        sales_rwf=totals["sales_rwf"],
        personal_kg=totals["personal_consumption_kg"],
        personal_count=totals["personal_consumption_count"],
        stored_kg=totals["stored_kg"],
        stored_count=totals["stored_count"],
        given_kg=totals["given_away_kg"],
        given_count=totals["given_away_count"],
        other_kg=totals["other_kg"],
        other_count=totals["other_count"],
        unassigned_kg=totals["unassigned_kg"],
        unassigned_count=totals["unassigned_count"],
        shares=shares,
        history=history[:80],
    )


def _flag_feedback(db: Session, user: User, row: HarvestFeedback, harvest: Harvest | None) -> None:
    code = harvest.public_code if harvest is not None else "a harvest"
    if row.kind == "loss":
        amount = ""
        if row.loss_quantity is not None:
            amount = f" {row.loss_quantity:g} {row.loss_unit or ''}".rstrip()
        summary = f"Crop loss reported for {code}:{amount}. {_excerpt(row.body)}"
        kind = "loss"
    elif row.kind == "verification" and harvest is not None and row.verified_quantity is not None:
        gap = abs(row.verified_quantity - harvest.quantity)
        if harvest.quantity <= 0 or gap / harvest.quantity <= 0.2:
            return
        summary = (
            f"Verification of {code} recorded {row.verified_quantity:g} {harvest.unit} "
            f"against a harvest of {harvest.quantity:g} {harvest.unit}."
        )
        kind = "mismatch"
    else:
        return
    db.add(
        HarvestNotice(
            public_code=allocate_code(db, HarvestNotice, "NOTE"),
            kind=kind,
            summary=summary[:400],
            harvest_id=harvest.id if harvest is not None else None,
            registered_by=user.id,
        )
    )


def create_feedback(db: Session, user: User, payload: HarvestFeedbackCreate):
    existing = find_by_request_id(db, HarvestFeedback, payload.client_request_id)
    if existing is not None:
        return existing, True
    allowed = (
        FARMER_KINDS
        if user.role == UserRole.farmer.value
        else OFFICER_KINDS
        if user.role == UserRole.field_officer.value
        else set()
    )
    if payload.kind not in allowed:
        raise DomainError("Choose a feedback type for your role.", status_code=422, field="kind")
    harvest = None
    if payload.harvest_id is not None:
        harvest = db.get(Harvest, payload.harvest_id)
        if harvest is None:
            raise DomainError("Harvest was not found.", status_code=422, field="harvest_id")
    row = HarvestFeedback(
        public_code=allocate_code(db, HarvestFeedback, "FEED"),
        harvest_id=payload.harvest_id,
        tree_id=harvest.tree_id if harvest else None,
        batch_id=harvest.batch_id if harvest else None,
        kind=payload.kind,
        body=payload.body,
        loss_quantity=payload.loss_quantity,
        loss_unit=payload.loss_unit,
        verified_quantity=payload.verified_quantity,
        data_origin=DataOrigin.field_entry.value,
        client_request_id=payload.client_request_id,
        registered_by=user.id,
    )
    _flag_feedback(db, user, row, harvest)
    return _save(db, user, row, "harvest_feedback", ["kind"])


def list_feedback(db: Session) -> list[HarvestFeedbackRead]:
    rows = db.scalars(
        select(HarvestFeedback)
        .options(joinedload(HarvestFeedback.harvest), joinedload(HarvestFeedback.registrar))
        .order_by(HarvestFeedback.created_at.desc())
        .limit(50)
    ).unique()
    return [
        HarvestFeedbackRead(
            id=row.id,
            public_code=row.public_code,
            harvest_id=row.harvest_id,
            harvest_code=row.harvest.public_code if row.harvest else None,
            kind=row.kind,
            body=row.body,
            loss_quantity=row.loss_quantity,
            loss_unit=row.loss_unit,
            verified_quantity=row.verified_quantity,
            recorded_by=_name(row.registrar),
            created_at=row.created_at,
        )
        for row in rows
    ]


def list_notices(db: Session) -> list[HarvestNoticeRead]:
    rows = db.scalars(
        select(HarvestNotice)
        .options(joinedload(HarvestNotice.harvest))
        .order_by(HarvestNotice.created_at.desc())
        .limit(20)
    ).unique()
    return [
        HarvestNoticeRead(
            id=row.id,
            public_code=row.public_code,
            kind=row.kind,
            summary=row.summary,
            harvest_code=row.harvest.public_code if row.harvest else None,
            created_at=row.created_at,
        )
        for row in rows
    ]
