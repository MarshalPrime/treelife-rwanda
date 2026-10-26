"""Pydantic request and response models."""

from __future__ import annotations

import enum
import re
import uuid
from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.validation import (
    check_area,
    check_coordinate_pair,
    check_historical_date,
    check_quantity,
    check_request_id,
    clean_optional_text,
)
from app.models.entities import (
    EventType,
    OrganizationType,
    SiteStatus,
    SiteType,
    TreeCategory,
    TreeStatus,
    UserRole,
)

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    full_name: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        # .local is allowed so demonstration accounts are not deliverable mailboxes.
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", cleaned) is None:
            raise ValueError("Enter a valid email address.")
        return cleaned


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    organization_id: uuid.UUID | None
    is_active: bool


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    org_type: OrganizationType
    external_id: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator("external_id", "notes")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    org_type: OrganizationType
    external_id: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class SpeciesCreate(BaseModel):
    scientific_name: str = Field(min_length=1, max_length=200)
    common_name: str = Field(min_length=1, max_length=200)
    local_name: str | None = Field(default=None, max_length=200)
    category: TreeCategory

    @field_validator("scientific_name", "common_name")
    @classmethod
    def clean_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("local_name")
    @classmethod
    def clean_local(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class SpeciesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scientific_name: str
    common_name: str
    local_name: str | None
    category: TreeCategory
    created_at: datetime


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    site_type: SiteType
    organization_id: uuid.UUID | None = None
    farmer_id: uuid.UUID | None = None
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    latitude: float | None = None
    longitude: float | None = None
    area_hectares: float | None = None
    notes: str | None = Field(default=None, max_length=2000)
    external_id: str | None = Field(
        default=None,
        max_length=120,
        description="Optional external identifier. This field is not synchronized with FMES.",
    )
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator(
        "province",
        "district",
        "sector",
        "cell",
        "village",
        "notes",
        "external_id",
        "client_request_id",
    )
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_site(self) -> SiteCreate:
        check_coordinate_pair(self.latitude, self.longitude)
        check_area(self.area_hectares)
        check_request_id(self.client_request_id)
        return self


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    site_type: SiteType | None = None
    organization_id: uuid.UUID | None = None
    farmer_id: uuid.UUID | None = None
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    latitude: float | None = None
    longitude: float | None = None
    area_hectares: float | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: SiteStatus | None = None
    external_id: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator("province", "district", "sector", "cell", "village", "notes", "external_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_site(self) -> SiteUpdate:
        provided = self.model_fields_set
        if "latitude" in provided or "longitude" in provided:
            if "latitude" not in provided or "longitude" not in provided:
                raise ValueError("Provide both latitude and longitude when updating coordinates.")
            check_coordinate_pair(self.latitude, self.longitude)
        if "area_hectares" in provided:
            check_area(self.area_hectares)
        return self


class SiteRead(BaseModel):
    id: uuid.UUID
    public_code: str
    name: str
    site_type: SiteType
    organization_id: uuid.UUID | None
    organization_name: str | None
    farmer_id: uuid.UUID | None = None
    farmer_name: str | None = None
    province: str | None
    district: str | None
    sector: str | None
    cell: str | None
    village: str | None
    latitude: float | None
    longitude: float | None
    has_coordinates: bool
    area_hectares: float | None
    notes: str | None
    status: SiteStatus
    data_origin: str
    external_id: str | None
    registered_by: uuid.UUID
    registered_by_name: str | None
    registered_at: datetime
    created_at: datetime
    updated_at: datetime


class TreeWriteBase(BaseModel):
    species_id: uuid.UUID | None = None
    category: TreeCategory | None = None
    planting_date: date | None = None
    latitude: float | None = None
    longitude: float | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: TreeStatus | None = None
    external_id: str | None = Field(default=None, max_length=120)

    @field_validator("notes", "external_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class TreeCreate(TreeWriteBase):
    site_id: uuid.UUID
    species_id: uuid.UUID
    category: TreeCategory
    planting_date: date
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("client_request_id")
    @classmethod
    def clean_request(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_tree(self) -> TreeCreate:
        check_coordinate_pair(self.latitude, self.longitude)
        check_historical_date(self.planting_date, "Planting date")
        check_request_id(self.client_request_id)
        return self


class TreeUpdate(TreeWriteBase):
    site_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_tree(self) -> TreeUpdate:
        provided = self.model_fields_set
        if "latitude" in provided or "longitude" in provided:
            if "latitude" not in provided or "longitude" not in provided:
                raise ValueError("Provide both latitude and longitude when updating coordinates.")
            check_coordinate_pair(self.latitude, self.longitude)
        if "planting_date" in provided:
            if self.planting_date is None:
                raise ValueError("Planting date is required.")
            check_historical_date(self.planting_date, "Planting date")
        return self


class TreeRead(BaseModel):
    id: uuid.UUID
    public_code: str
    site_id: uuid.UUID
    site_name: str | None
    site_code: str | None
    species_id: uuid.UUID
    species_common_name: str | None
    species_scientific_name: str | None
    category: TreeCategory
    planting_date: date
    quantity: int = 1
    latitude: float | None
    longitude: float | None
    has_coordinates: bool
    status: TreeStatus
    notes: str | None
    data_origin: str
    external_id: str | None
    registered_by: uuid.UUID
    registered_by_name: str | None
    registered_at: datetime
    created_at: datetime
    updated_at: datetime


class BatchCreate(TreeCreate):
    quantity: int

    @model_validator(mode="after")
    def validate_batch(self) -> BatchCreate:
        check_quantity(self.quantity)
        return self


class BatchUpdate(TreeUpdate):
    quantity: int | None = None

    @model_validator(mode="after")
    def validate_batch(self) -> BatchUpdate:
        if "quantity" in self.model_fields_set:
            if self.quantity is None:
                raise ValueError("Quantity must be a whole number from 1 to 100000.")
            check_quantity(self.quantity)
        return self


class BatchRead(TreeRead):
    quantity: int


class EventCreate(BaseModel):
    tree_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    site_id: uuid.UUID | None = None
    event_type: EventType
    event_date: date
    status_after: str | None = None
    survival_count: int | None = Field(default=None, ge=0, le=100_000)
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "status_after", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_event(self) -> EventCreate:
        selected = [self.tree_id, self.batch_id, self.site_id]
        if sum(value is not None for value in selected) != 1:
            raise ValueError("Choose exactly one tree, planting batch, or site.")
        check_historical_date(self.event_date, "Event date")
        check_request_id(self.client_request_id)
        if self.status_after is not None:
            allowed = {item.value for item in TreeStatus} | {item.value for item in SiteStatus}
            if self.status_after not in allowed:
                raise ValueError("Status is not a recognized tree or site status.")
        return self


class EventRead(BaseModel):
    id: uuid.UUID
    public_code: str
    tree_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    site_id: uuid.UUID | None
    event_type: EventType
    event_date: date
    status_after: str | None
    survival_count: int | None
    notes: str | None
    data_origin: str
    recorded_by: uuid.UUID
    recorded_by_name: str | None
    created_at: datetime


class MapFeatureProperties(BaseModel):
    id: uuid.UUID
    kind: str
    public_code: str
    title: str
    subtitle: str
    status: str
    category: str | None
    data_origin: str
    species_common_name: str | None = None


class MapFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: MapFeatureProperties


class UnlocatedRecord(BaseModel):
    id: uuid.UUID
    kind: str
    public_code: str
    title: str
    reason: str = "No coordinates recorded"


class MapResponse(BaseModel):
    type: str = "FeatureCollection"
    features: list[MapFeature]
    unlocated: list[UnlocatedRecord]
    truncated: bool


class StatsResponse(BaseModel):
    sites: int
    trees: int
    batches: int
    events: int
    records_missing_coordinates: int
    synthetic_records: int


class AuditRead(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: str
    changed_fields: list[str]
    created_at: datetime


class HealthResponse(BaseModel):
    status: str
    database: str
    postgis: str | None = None


def enum_value(value: enum.Enum | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, enum.Enum):
        return str(value.value)
    return str(value)
