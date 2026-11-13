"""Request and response shapes for carbon monitoring."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class CarbonRequestCreate(BaseModel):
    experience: str = Field(min_length=1, max_length=4000)
    training: str = Field(min_length=1, max_length=4000)
    qualifications: str = Field(min_length=1, max_length=4000)


class CarbonDecision(BaseModel):
    decision: str
    reason: str | None = Field(default=None, max_length=2000)


class CarbonDocumentRead(BaseModel):
    id: uuid.UUID
    original_name: str
    uploaded_at: datetime


class CarbonEventRead(BaseModel):
    id: uuid.UUID
    authorization_id: uuid.UUID
    action: str
    reason: str | None
    actor_name: str | None
    created_at: datetime


class CarbonRequestRead(BaseModel):
    id: uuid.UUID
    officer_id: uuid.UUID
    officer_name: str
    officer_email: str
    officer_district: str | None
    status: str
    experience: str
    training: str
    qualifications: str
    decision_reason: str | None
    decided_by_name: str | None
    decided_at: datetime | None
    created_at: datetime
    documents: list[CarbonDocumentRead]
    history: list[CarbonEventRead] | None = None


class CarbonAuthorizationRead(BaseModel):
    status: str
    request: CarbonRequestRead | None
    history: list[CarbonEventRead]


class CarbonEstimateRead(BaseModel):
    aboveground_biomass_kg: float
    carbon_kg: float
    co2_equivalent_kg: float
    tonnes_co2e: float
    label: str
    wood_specific_gravity: float
    methodology: str
    methodology_version: str
    source: str
    assumptions: list[str]


class CarbonRevisionRead(BaseModel):
    id: uuid.UUID
    created_at: datetime
    snapshot: dict


class CarbonMeasurementRead(BaseModel):
    id: uuid.UUID
    public_code: str
    tree_id: uuid.UUID | None
    tree_code: str | None
    species_id: uuid.UUID
    species_common_name: str | None
    species_verified: bool
    species_note: str | None
    latitude: float
    longitude: float
    dbh_cm: float
    height_m: float | None
    status: str
    measured_on: date
    notes: str | None
    has_photo: bool
    photo_at: datetime | None
    collected_by: uuid.UUID
    collected_by_name: str | None
    created_at: datetime
    updated_at: datetime
    review_status: str
    review_reason: str | None
    estimate_note: str | None
    estimate: CarbonEstimateRead | None
    history: list[CarbonRevisionRead]


class CarbonReview(BaseModel):
    decision: str
    reason: str | None = Field(default=None, max_length=2000)


class CarbonOverviewRead(BaseModel):
    total_tonnes_co2e: float
    distinct_trees: int
    distinct_species: int
    agents: int
    accepted_measurements: int
    pending_measurements: int
    correction_measurements: int
    methodology: str
    methodology_version: str


class CarbonMeasurementWrite(BaseModel):
    tree_id: uuid.UUID | None = None
    species_id: uuid.UUID
    species_verified: bool = False
    species_note: str | None = Field(default=None, max_length=2000)
    latitude: float
    longitude: float
    dbh_cm: float
    height_m: float | None = None
    status: str
    measured_on: date
    notes: str | None = Field(default=None, max_length=4000)
    client_request_id: str | None = Field(default=None, max_length=80)
