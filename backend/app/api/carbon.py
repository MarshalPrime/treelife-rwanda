"""Carbon monitoring routes. Authorization is checked on every write and read."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import (
    get_current_user,
    require_admin,
    require_carbon_agent,
    require_carbon_writer,
    require_monitoring_reader,
)
from app.db.session import get_db
from app.domain.errors import DomainError
from app.models.entities import User
from app.schemas.carbon import (
    CarbonAuthorizationRead,
    CarbonDecision,
    CarbonMeasurementRead,
    CarbonMeasurementWrite,
    CarbonOverviewRead,
    CarbonRequestCreate,
    CarbonRequestRead,
    CarbonReview,
)
from app.services.carbon import (
    DOCUMENT_TYPES,
    create_measurement,
    decide,
    document_file,
    get_measurement,
    get_request,
    list_measurements,
    list_requests,
    measurement_photo,
    monitoring_overview,
    officer_view,
    readable_document,
    review_measurement,
    save_document,
    save_measurement_photo,
    submit_request,
    update_measurement,
)
from app.services.profile_photo import MEDIA_TYPES

router = APIRouter(prefix="/carbon", tags=["carbon"])


@router.get("/authorization", response_model=CarbonAuthorizationRead)
def read_authorization(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return officer_view(db, user)


@router.post("/authorization", response_model=CarbonRequestRead, status_code=201)
def create_authorization(
    payload: CarbonRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    row = submit_request(db, user, payload.experience, payload.training, payload.qualifications)
    detail = get_request(db, row.id)
    detail.pop("history", None)
    return detail


@router.post("/authorization/{authorization_id}/documents", response_model=CarbonRequestRead)
async def upload_document(
    authorization_id: uuid.UUID,
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    save_document(
        db,
        user,
        authorization_id,
        file.filename or "evidence",
        await file.read(5 * 1024 * 1024 + 1),
    )
    detail = get_request(db, authorization_id)
    detail.pop("history", None)
    return detail


@router.get("/documents/{document_id}")
def download_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    document = readable_document(db, user, document_id)
    path = document_file(document)
    if path is None:
        raise DomainError("That file was not found.", status_code=404)
    media = DOCUMENT_TYPES.get(document.stored_ext, "application/octet-stream")
    return FileResponse(path, media_type=media, filename=document.original_name)


@router.get("/authorizations", response_model=list[CarbonRequestRead])
def read_authorizations(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict]:
    return list_requests(db)


@router.get("/authorizations/{authorization_id}", response_model=CarbonRequestRead)
def read_authorization_detail(
    authorization_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    return get_request(db, authorization_id)


@router.post("/authorizations/{authorization_id}/decision", response_model=CarbonRequestRead)
def decide_authorization(
    authorization_id: uuid.UUID,
    payload: CarbonDecision,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    return decide(db, admin, authorization_id, payload.decision, payload.reason)


@router.get("/overview", response_model=CarbonOverviewRead)
def read_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_monitoring_reader),
) -> dict:
    return monitoring_overview(db)


@router.post("/measurements/{measurement_id}/review", response_model=CarbonMeasurementRead)
def review_one_measurement(
    measurement_id: uuid.UUID,
    payload: CarbonReview,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    return review_measurement(db, admin, measurement_id, payload.decision, payload.reason)


@router.get("/measurements", response_model=list[CarbonMeasurementRead])
def read_measurements(
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_agent),
) -> list[dict]:
    return list_measurements(db, user)


@router.post("/measurements", response_model=CarbonMeasurementRead)
def post_measurement(
    payload: CarbonMeasurementWrite,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_writer),
) -> dict:
    saved, replay = create_measurement(db, user, payload.model_dump())
    response.status_code = 200 if replay else 201
    if replay:
        response.headers["X-Idempotent-Replay"] = "true"
    return saved


@router.get("/measurements/{measurement_id}", response_model=CarbonMeasurementRead)
def read_measurement(
    measurement_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_agent),
) -> dict:
    return get_measurement(db, user, measurement_id)


@router.put("/measurements/{measurement_id}", response_model=CarbonMeasurementRead)
def put_measurement(
    measurement_id: uuid.UUID,
    payload: CarbonMeasurementWrite,
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_writer),
) -> dict:
    return update_measurement(db, user, measurement_id, payload.model_dump())


@router.post("/measurements/{measurement_id}/photo", response_model=CarbonMeasurementRead)
async def upload_measurement_photo(
    measurement_id: uuid.UUID,
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_writer),
) -> dict:
    row = save_measurement_photo(db, user, measurement_id, await file.read(2 * 1024 * 1024 + 1))
    return get_measurement(db, user, row.id)


@router.get("/measurements/{measurement_id}/photo")
def download_measurement_photo(
    measurement_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_carbon_agent),
) -> FileResponse:
    path = measurement_photo(db, user, measurement_id)
    media = MEDIA_TYPES.get(path.suffix.lstrip("."), "application/octet-stream")
    return FileResponse(path, media_type=media)
