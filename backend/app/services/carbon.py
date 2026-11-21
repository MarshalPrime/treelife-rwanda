"""Carbon monitoring authorization and field measurements.

Calculated carbon is an estimate. It is not a certified credit and not a
verified emission reduction.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.domain.errors import DomainError
from app.domain.validation import (
    check_coordinate_pair,
    check_historical_date,
    check_positive_number,
    check_request_id,
)
from app.models.entities import (
    CarbonAuthorization,
    CarbonAuthorizationEvent,
    CarbonDocument,
    CarbonMeasurement,
    CarbonMeasurementRevision,
    IndividualTree,
    Species,
    SpeciesCarbonParameter,
    User,
    UserRole,
)
from app.services.common import allocate_code, utcnow, write_audit
from app.services.profile_photo import detect_photo

OPEN_STATUSES = {"pending", "approved"}
STATUSES = {"surviving", "stressed", "dead", "planted", "unknown"}
REVIEW_STATUSES = {"pending", "accepted", "correction"}
METHODOLOGY_ID = "chave2014-eq4"
METHODOLOGY_VERSION = "1"
CARBON_FRACTION = 0.47
CO2_PER_CARBON = 44 / 12
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
MAX_PHOTO_BYTES = 2 * 1024 * 1024
DOCUMENT_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
}


def tree_carbon_stock(dbh_cm: float, height_m: float, specific_gravity: float) -> dict:
    """Chave et al. 2014 equation 4, then the IPCC default carbon fraction.

    specific_gravity is basic wood specific gravity for this species.
    The result is an estimate of aboveground stock, not annual sequestration.
    """
    biomass = 0.0673 * (specific_gravity * (dbh_cm**2) * height_m) ** 0.976
    carbon = biomass * CARBON_FRACTION
    co2e = carbon * CO2_PER_CARBON
    return {
        "aboveground_biomass_kg": round(biomass, 3),
        "carbon_kg": round(carbon, 3),
        "co2_equivalent_kg": round(co2e, 3),
        "tonnes_co2e": round(co2e / 1000, 6),
    }


def _clear_stock(row: CarbonMeasurement, note: str) -> None:
    row.agb_kg = None
    row.carbon_kg = None
    row.co2e_kg = None
    row.wood_specific_gravity = None
    row.parameter_source = None
    row.methodology_id = METHODOLOGY_ID
    row.methodology_version = METHODOLOGY_VERSION
    row.estimate_note = note


def store_carbon_estimate(db: Session, row: CarbonMeasurement) -> None:
    species = db.get(Species, row.species_id)
    parameter = None
    if species is not None:
        parameter = db.scalar(
            select(SpeciesCarbonParameter).where(
                SpeciesCarbonParameter.scientific_name == species.scientific_name
            )
        )
    if parameter is None:
        _clear_stock(
            row,
            "No published basic wood specific gravity is stored for this species, so carbon stock is not calculated.",
        )
        return
    if row.height_m is None or row.height_m <= 0:
        _clear_stock(
            row,
            "Height is required for this methodology, so carbon stock is not calculated.",
        )
        return
    stock = tree_carbon_stock(row.dbh_cm, row.height_m, parameter.basic_specific_gravity)
    row.agb_kg = stock["aboveground_biomass_kg"]
    row.carbon_kg = stock["carbon_kg"]
    row.co2e_kg = stock["co2_equivalent_kg"]
    row.wood_specific_gravity = parameter.basic_specific_gravity
    row.parameter_source = parameter.source
    row.methodology_id = METHODOLOGY_ID
    row.methodology_version = METHODOLOGY_VERSION
    row.estimate_note = None


def carbon_status(db: Session, user_id: uuid.UUID) -> str:
    row = _latest(db, user_id)
    return row.status if row is not None else "not_requested"


def _latest(db: Session, user_id: uuid.UUID) -> CarbonAuthorization | None:
    return db.scalar(
        select(CarbonAuthorization)
        .where(CarbonAuthorization.user_id == user_id)
        .order_by(CarbonAuthorization.created_at.desc())
        .limit(1)
    )


def _require_text(value: str, field: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise DomainError(f"{label} is required.", field=field)
    if len(cleaned) > 4000:
        raise DomainError(f"{label} must be 4000 characters or fewer.", field=field)
    return cleaned


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError(
            "A carbon monitoring request is already open for this field officer.",
            status_code=409,
        ) from exc
    from app.services.live_stream import notify_dashboard_change

    notify_dashboard_change()


def submit_request(
    db: Session, user: User, experience: str, training: str, qualifications: str
) -> CarbonAuthorization:
    if user.role != UserRole.field_officer.value:
        raise DomainError(
            "Only a field officer can request carbon monitoring authorization.",
            status_code=403,
        )
    current = _latest(db, user.id)
    if current is not None and current.status in OPEN_STATUSES:
        raise DomainError(
            "This field officer already has an open carbon monitoring request.",
            status_code=409,
        )
    row = CarbonAuthorization(
        user_id=user.id,
        status="pending",
        experience=_require_text(experience, "experience", "Experience"),
        training=_require_text(training, "training", "Training"),
        qualifications=_require_text(qualifications, "qualifications", "Qualifications"),
    )
    db.add(row)
    db.flush()
    db.add(
        CarbonAuthorizationEvent(
            authorization_id=row.id,
            user_id=user.id,
            action="submitted",
            actor_id=user.id,
        )
    )
    write_audit(
        db,
        user,
        "create",
        "carbon_authorization",
        row.id,
        ["status", "experience", "training", "qualifications"],
    )
    _commit(db)
    return db.get(CarbonAuthorization, row.id)


def document_directory() -> Path:
    directory = Path(get_settings().carbon_document_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _detect_document(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "pdf"
    return detect_photo(data)


def save_document(
    db: Session, user: User, authorization_id: uuid.UUID, filename: str, data: bytes
) -> CarbonDocument:
    row = db.get(CarbonAuthorization, authorization_id)
    if row is None or row.user_id != user.id:
        raise DomainError("That authorization request was not found.", status_code=404)
    if user.role != UserRole.field_officer.value:
        raise DomainError(
            "Only the field officer can add evidence to this request.", status_code=403
        )
    if row.status != "pending":
        raise DomainError(
            "Evidence can be added while the request is pending review.", status_code=409
        )
    if not data:
        raise DomainError("Choose a file to upload.", field="file")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise DomainError("Choose a file smaller than 5 MB.", field="file")
    extension = _detect_document(data)
    if extension is None:
        raise DomainError("Use a JPEG, PNG, WebP, or PDF file.", field="file")
    document = CarbonDocument(
        authorization_id=row.id,
        original_name=(filename or "evidence").strip()[:200] or "evidence",
        stored_ext=extension,
    )
    db.add(document)
    db.flush()
    (document_directory() / f"{document.id}.{extension}").write_bytes(data)
    write_audit(db, user, "create", "carbon_document", document.id, ["file"])
    _commit(db)
    return db.get(CarbonDocument, document.id)


def document_file(document: CarbonDocument) -> Path | None:
    path = document_directory() / f"{document.id}.{document.stored_ext}"
    return path if path.is_file() else None


def readable_document(db: Session, user: User, document_id: uuid.UUID) -> CarbonDocument:
    document = db.get(CarbonDocument, document_id)
    if document is None:
        raise DomainError("That file was not found.", status_code=404)
    authorization = db.get(CarbonAuthorization, document.authorization_id)
    if authorization is None:
        raise DomainError("That file was not found.", status_code=404)
    if user.role != UserRole.admin.value and authorization.user_id != user.id:
        raise DomainError("You cannot open this file.", status_code=403)
    return document


def officer_view(db: Session, user: User) -> dict:
    if user.role != UserRole.field_officer.value:
        raise DomainError("Carbon monitoring authorization is for field officers.", status_code=403)
    current = _latest(db, user.id)
    return {
        "status": current.status if current is not None else "not_requested",
        "request": _request_read(db, current) if current is not None else None,
        "history": _history(db, user.id),
    }


def _request_read(db: Session, row: CarbonAuthorization | None) -> dict | None:
    if row is None:
        return None
    decider = db.get(User, row.decided_by) if row.decided_by else None
    officer = db.get(User, row.user_id)
    documents = list(
        db.scalars(
            select(CarbonDocument)
            .where(CarbonDocument.authorization_id == row.id)
            .order_by(CarbonDocument.uploaded_at)
        ).all()
    )
    return {
        "id": row.id,
        "officer_id": row.user_id,
        "officer_name": officer.full_name if officer else "",
        "officer_email": officer.email if officer else "",
        "officer_district": officer.district if officer else None,
        "status": row.status,
        "experience": row.experience,
        "training": row.training,
        "qualifications": row.qualifications,
        "decision_reason": row.decision_reason,
        "decided_by_name": decider.full_name if decider else None,
        "decided_at": row.decided_at,
        "created_at": row.created_at,
        "documents": [
            {
                "id": item.id,
                "original_name": item.original_name,
                "uploaded_at": item.uploaded_at,
            }
            for item in documents
        ],
    }


def _history(db: Session, user_id: uuid.UUID) -> list[dict]:
    rows = (
        db.scalars(
            select(CarbonAuthorizationEvent)
            .options(joinedload(CarbonAuthorizationEvent.actor))
            .where(CarbonAuthorizationEvent.user_id == user_id)
            .order_by(CarbonAuthorizationEvent.created_at)
        )
        .unique()
        .all()
    )
    return [
        {
            "id": item.id,
            "authorization_id": item.authorization_id,
            "action": item.action,
            "reason": item.reason,
            "actor_name": item.actor.full_name if item.actor else None,
            "created_at": item.created_at,
        }
        for item in rows
    ]


def list_requests(db: Session) -> list[dict]:
    rows = db.scalars(
        select(CarbonAuthorization).order_by(CarbonAuthorization.created_at.desc())
    ).all()
    return [item for row in rows if (item := _request_read(db, row)) is not None]


def get_request(db: Session, authorization_id: uuid.UUID) -> dict:
    row = db.get(CarbonAuthorization, authorization_id)
    if row is None:
        raise DomainError("That authorization request was not found.", status_code=404)
    detail = _request_read(db, row)
    assert detail is not None
    detail["history"] = _history(db, row.user_id)
    return detail


def decide(
    db: Session, admin: User, authorization_id: uuid.UUID, decision: str, reason: str | None
) -> dict:
    row = db.get(CarbonAuthorization, authorization_id)
    if row is None:
        raise DomainError("That authorization request was not found.", status_code=404)
    cleaned = reason.strip() if reason else ""
    if decision == "approve":
        if row.status != "pending":
            raise DomainError("Only a pending request can be approved.", status_code=409)
        row.status = "approved"
        action = "approved"
    elif decision == "reject":
        if row.status != "pending":
            raise DomainError("Only a pending request can be rejected.", status_code=409)
        if not cleaned:
            raise DomainError("Give a reason for the rejection.", field="reason")
        row.status = "rejected"
        action = "rejected"
    elif decision == "revoke":
        if row.status != "approved":
            raise DomainError("Only an approved authorization can be revoked.", status_code=409)
        if not cleaned:
            raise DomainError("Give a reason for the revocation.", field="reason")
        row.status = "revoked"
        action = "revoked"
    else:
        raise DomainError("Choose approve, reject, or revoke.", field="decision")
    row.decision_reason = cleaned or None
    row.decided_by = admin.id
    row.decided_at = utcnow()
    db.add(
        CarbonAuthorizationEvent(
            authorization_id=row.id,
            user_id=row.user_id,
            action=action,
            reason=row.decision_reason,
            actor_id=admin.id,
        )
    )
    write_audit(db, admin, "update", "carbon_authorization", row.id, ["status", "decision_reason"])
    _commit(db)
    return get_request(db, row.id)


def is_carbon_agent(db: Session, user: User) -> bool:
    if user.role == UserRole.admin.value:
        return True
    return user.role == UserRole.field_officer.value and carbon_status(db, user.id) == "approved"


def _estimate_read(row: CarbonMeasurement) -> dict | None:
    if row.co2e_kg is None or row.wood_specific_gravity is None:
        return None
    source = row.parameter_source or "The species wood record."
    return {
        "aboveground_biomass_kg": row.agb_kg,
        "carbon_kg": row.carbon_kg,
        "co2_equivalent_kg": row.co2e_kg,
        "tonnes_co2e": round(row.co2e_kg / 1000, 6),
        "label": "Estimate",
        "wood_specific_gravity": row.wood_specific_gravity,
        "methodology": row.methodology_id or METHODOLOGY_ID,
        "methodology_version": row.methodology_version or METHODOLOGY_VERSION,
        "source": source,
        "assumptions": [
            "This is an estimate. It is not a certified carbon credit and not a verified emission reduction.",
            "Aboveground biomass uses Chave et al. 2014, equation 4, with this species basic wood specific gravity.",
            f"Wood specific gravity {row.wood_specific_gravity} g/cm³. {source}",
            "Carbon is 47% of that dry aboveground biomass, the IPCC default fraction.",
            "Carbon dioxide equivalent multiplies that carbon by 44/12.",
            "This is standing stock. Annual sequestration, roots, soil carbon, and leakage are not included.",
        ],
    }


def _measurement_read(db: Session, row: CarbonMeasurement) -> dict:
    collector = db.get(User, row.collected_by)
    species = db.get(Species, row.species_id)
    tree = db.get(IndividualTree, row.tree_id) if row.tree_id else None
    revisions = db.scalars(
        select(CarbonMeasurementRevision)
        .where(CarbonMeasurementRevision.measurement_id == row.id)
        .order_by(CarbonMeasurementRevision.created_at)
    ).all()
    return {
        "id": row.id,
        "public_code": row.public_code,
        "tree_id": row.tree_id,
        "tree_code": tree.public_code if tree else None,
        "species_id": row.species_id,
        "species_common_name": species.common_name if species else None,
        "species_verified": row.species_verified,
        "species_note": row.species_note,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "dbh_cm": row.dbh_cm,
        "height_m": row.height_m,
        "status": row.status,
        "measured_on": row.measured_on,
        "notes": row.notes,
        "has_photo": row.photo_ext is not None,
        "photo_at": row.photo_at,
        "collected_by": row.collected_by,
        "collected_by_name": collector.full_name if collector else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "review_status": row.review_status,
        "review_reason": row.review_reason,
        "estimate_note": row.estimate_note,
        "estimate": _estimate_read(row),
        "history": [
            {"id": item.id, "created_at": item.created_at, "snapshot": item.snapshot}
            for item in revisions
        ],
    }


def _checked(call) -> None:
    try:
        call()
    except ValueError as exc:
        raise DomainError(str(exc)) from exc


def _validate_measurement(db: Session, payload: dict) -> None:
    if payload["status"] not in STATUSES:
        raise DomainError("Choose a recorded health status.", field="status")
    _checked(lambda: check_coordinate_pair(payload["latitude"], payload["longitude"]))
    if payload["latitude"] is None or payload["longitude"] is None:
        raise DomainError("Record both latitude and longitude.", field="latitude")
    _checked(lambda: check_positive_number(payload["dbh_cm"], "Diameter at breast height"))
    if payload["dbh_cm"] > 500:
        raise DomainError("Diameter at breast height must be 500 cm or less.", field="dbh_cm")
    if payload.get("height_m") is not None:
        _checked(lambda: check_positive_number(payload["height_m"], "Height"))
        if payload["height_m"] > 150:
            raise DomainError("Height must be 150 metres or less.", field="height_m")
    _checked(lambda: check_historical_date(payload["measured_on"], "Measurement date"))
    _checked(lambda: check_request_id(payload.get("client_request_id")))
    if db.get(Species, payload["species_id"]) is None:
        raise DomainError("Choose a species from the list.", field="species_id")
    if payload.get("tree_id") is not None and db.get(IndividualTree, payload["tree_id"]) is None:
        raise DomainError("That tree was not found.", field="tree_id")
    note = payload.get("species_note")
    if note is not None and len(note) > 2000:
        raise DomainError(
            "The species note must be 2000 characters or fewer.", field="species_note"
        )
    notes = payload.get("notes")
    if notes is not None and len(notes) > 4000:
        raise DomainError("Notes must be 4000 characters or fewer.", field="notes")


def monitoring_overview(db: Session) -> dict:
    """Project stock from the latest accepted measurement of each tree."""
    rows = list(db.scalars(select(CarbonMeasurement)).all())
    accepted = [row for row in rows if row.review_status == "accepted"]
    latest: dict[uuid.UUID, CarbonMeasurement] = {}
    for row in sorted(accepted, key=lambda item: (item.measured_on, item.created_at)):
        latest[row.tree_id or row.id] = row
    stock_kg = sum(row.co2e_kg or 0 for row in latest.values())
    return {
        "total_tonnes_co2e": round(stock_kg / 1000, 3),
        "distinct_trees": len(latest),
        "distinct_species": len({row.species_id for row in latest.values()}),
        "agents": len({row.collected_by for row in accepted}),
        "accepted_measurements": len(accepted),
        "pending_measurements": sum(row.review_status == "pending" for row in rows),
        "correction_measurements": sum(row.review_status == "correction" for row in rows),
        "methodology": METHODOLOGY_ID,
        "methodology_version": METHODOLOGY_VERSION,
    }


def review_measurement(
    db: Session, admin: User, measurement_id: uuid.UUID, decision: str, reason: str | None
) -> dict:
    row = db.get(CarbonMeasurement, measurement_id)
    if row is None:
        raise DomainError("That measurement was not found.", status_code=404)
    if decision not in {"accept", "correction"}:
        raise DomainError("Choose accept or correction.", field="decision")
    cleaned = (reason or "").strip()
    if decision == "correction" and not cleaned:
        raise DomainError("A correction needs a reason.", field="reason")
    row.review_status = "accepted" if decision == "accept" else "correction"
    row.review_reason = cleaned or None
    row.reviewed_by = admin.id
    row.reviewed_at = utcnow()
    write_audit(db, admin, "update", "carbon_measurement", row.id, ["review_status"])
    _commit(db)
    return _measurement_read(db, db.get(CarbonMeasurement, row.id))


def list_measurements(db: Session, user: User) -> list[dict]:
    query = select(CarbonMeasurement).order_by(
        CarbonMeasurement.measured_on.desc(), CarbonMeasurement.created_at.desc()
    )
    if user.role != UserRole.admin.value:
        query = query.where(CarbonMeasurement.collected_by == user.id)
    return [_measurement_read(db, row) for row in db.scalars(query).all()]


def get_measurement(db: Session, user: User, measurement_id: uuid.UUID) -> dict:
    row = _editable(db, user, measurement_id, write=False)
    return _measurement_read(db, row)


def _editable(db: Session, user: User, measurement_id: uuid.UUID, write: bool) -> CarbonMeasurement:
    row = db.get(CarbonMeasurement, measurement_id)
    if row is None:
        raise DomainError("That measurement was not found.", status_code=404)
    if user.role != UserRole.admin.value and row.collected_by != user.id:
        raise DomainError("You can only open measurements you collected.", status_code=403)
    if write and user.role not in {UserRole.admin.value, UserRole.field_officer.value}:
        raise DomainError("You cannot change this measurement.", status_code=403)
    return row


def _snapshot(row: CarbonMeasurement) -> dict:
    return {
        "species_id": str(row.species_id),
        "species_verified": row.species_verified,
        "species_note": row.species_note,
        "tree_id": str(row.tree_id) if row.tree_id else None,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "dbh_cm": row.dbh_cm,
        "height_m": row.height_m,
        "status": row.status,
        "measured_on": row.measured_on.isoformat(),
        "notes": row.notes,
    }


def create_measurement(db: Session, user: User, payload: dict) -> tuple[dict, bool]:
    existing_id = payload.get("client_request_id")
    if existing_id:
        found = db.scalar(
            select(CarbonMeasurement).where(CarbonMeasurement.client_request_id == existing_id)
        )
        if found is not None:
            return _measurement_read(db, found), True
    _validate_measurement(db, payload)
    row = CarbonMeasurement(
        public_code=allocate_code(db, CarbonMeasurement, "CARB"),
        tree_id=payload.get("tree_id"),
        species_id=payload["species_id"],
        species_verified=bool(payload.get("species_verified")),
        species_note=(payload.get("species_note") or "").strip() or None,
        latitude=payload["latitude"],
        longitude=payload["longitude"],
        dbh_cm=payload["dbh_cm"],
        height_m=payload.get("height_m"),
        status=payload["status"],
        measured_on=payload["measured_on"],
        notes=(payload.get("notes") or "").strip() or None,
        collected_by=user.id,
        client_request_id=existing_id,
        review_status="pending",
    )
    store_carbon_estimate(db, row)
    db.add(row)
    db.flush()
    write_audit(
        db,
        user,
        "create",
        "carbon_measurement",
        row.id,
        ["species_id", "dbh_cm", "height_m", "status", "coordinates", "measured_on"],
    )
    _commit(db)
    saved = db.get(CarbonMeasurement, row.id)
    return _measurement_read(db, saved), False


def update_measurement(db: Session, user: User, measurement_id: uuid.UUID, payload: dict) -> dict:
    row = _editable(db, user, measurement_id, write=True)
    _validate_measurement(db, payload)
    previous = _snapshot(row)
    row.tree_id = payload.get("tree_id")
    row.species_id = payload["species_id"]
    row.species_verified = bool(payload.get("species_verified"))
    row.species_note = (payload.get("species_note") or "").strip() or None
    row.latitude = payload["latitude"]
    row.longitude = payload["longitude"]
    row.dbh_cm = payload["dbh_cm"]
    row.height_m = payload.get("height_m")
    row.status = payload["status"]
    row.measured_on = payload["measured_on"]
    row.notes = (payload.get("notes") or "").strip() or None
    row.review_status = "pending"
    row.review_reason = None
    row.reviewed_by = None
    row.reviewed_at = None
    store_carbon_estimate(db, row)
    db.add(
        CarbonMeasurementRevision(
            measurement_id=row.id,
            actor_id=user.id,
            snapshot=previous,
        )
    )
    write_audit(
        db,
        user,
        "update",
        "carbon_measurement",
        row.id,
        ["species_id", "dbh_cm", "height_m", "status", "coordinates", "measured_on", "notes"],
    )
    _commit(db)
    return _measurement_read(db, db.get(CarbonMeasurement, row.id))


def save_measurement_photo(
    db: Session, user: User, measurement_id: uuid.UUID, data: bytes
) -> CarbonMeasurement:
    row = _editable(db, user, measurement_id, write=True)
    if not data:
        raise DomainError("Choose a photo to upload.", field="photo")
    if len(data) > MAX_PHOTO_BYTES:
        raise DomainError("Choose a photo smaller than 2 MB.", field="photo")
    extension = detect_photo(data)
    if extension is None:
        raise DomainError("Use a JPEG, PNG, or WebP photo.", field="photo")
    directory = document_directory()
    for old in directory.glob(f"measurement-{row.id}.*"):
        old.unlink()
    (directory / f"measurement-{row.id}.{extension}").write_bytes(data)
    row.photo_ext = extension
    row.photo_at = utcnow()
    write_audit(db, user, "update", "carbon_measurement", row.id, ["photo"])
    _commit(db)
    return db.get(CarbonMeasurement, row.id)


def measurement_photo(db: Session, user: User, measurement_id: uuid.UUID) -> Path:
    row = _editable(db, user, measurement_id, write=False)
    if not row.photo_ext:
        raise DomainError("No photo is saved for this measurement.", status_code=404)
    path = document_directory() / f"measurement-{row.id}.{row.photo_ext}"
    if not path.is_file():
        raise DomainError("No photo is saved for this measurement.", status_code=404)
    return path
