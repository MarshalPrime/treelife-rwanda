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
    check_password_strength,
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


class PlaceList(BaseModel):
    level: str
    places: list[str]


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


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    role: UserRole
    organization_name: str | None = Field(default=None, max_length=200)
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", cleaned) is None:
            raise ValueError("Enter a valid email address.")
        return cleaned

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return check_password_strength(value)

    @field_validator(
        "organization_name",
        "province",
        "district",
        "sector",
        "cell",
        "village",
        "isibo",
        "household",
        "phone",
    )
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    organization_id: uuid.UUID | None
    is_active: bool
    farmer_id: uuid.UUID | None = None
    profile_photo_at: datetime | None = None


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


GROWTH_FORMS = {"tree", "shrub", "herb", "vine"}
SPECIES_CLASSES = {"fruit", "timber", "agroforestry", "ornamental", "indigenous", "multipurpose"}
REVIEW_STATUSES = {"verified", "needs_review", "draft", "rejected"}


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


class SpeciesVarietyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class SpeciesUpdate(BaseModel):
    scientific_name: str | None = Field(default=None, min_length=1, max_length=200)
    common_name: str | None = Field(default=None, min_length=1, max_length=200)
    local_name: str | None = Field(default=None, max_length=200)
    other_local_names: list[str] | None = None
    growth_form: str | None = None
    classifications: list[str] | None = None
    primary_uses: str | None = Field(default=None, max_length=500)
    harvest_potential: bool | None = None
    harvest_type: str | None = Field(default=None, max_length=80)
    rwanda_suitability: str | None = Field(default=None, max_length=500)
    data_source: str | None = Field(default=None, max_length=500)
    review_status: str | None = None
    category: TreeCategory | None = None
    variety_name: str | None = Field(default=None, max_length=200)

    @field_validator("scientific_name", "common_name", "variety_name")
    @classmethod
    def clean_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator(
        "local_name", "primary_uses", "harvest_type", "rwanda_suitability", "data_source"
    )
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @field_validator("growth_form")
    @classmethod
    def clean_growth(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if value not in GROWTH_FORMS:
            raise ValueError("Choose a growth form from the list.")
        return value

    @field_validator("review_status")
    @classmethod
    def clean_review(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in REVIEW_STATUSES:
            raise ValueError("Choose a review status from the list.")
        return value

    @field_validator("classifications")
    @classmethod
    def clean_classes(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = []
        for item in value:
            name = item.strip()
            if name not in SPECIES_CLASSES:
                raise ValueError("Choose a classification from the list.")
            if name not in cleaned:
                cleaned.append(name)
        return cleaned

    @field_validator("other_local_names")
    @classmethod
    def clean_other_names(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = []
        for item in value:
            name = item.strip()
            if name and name not in cleaned:
                cleaned.append(name)
        return cleaned


class SpeciesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scientific_name: str
    common_name: str
    local_name: str | None
    other_local_names: list[str] | None = None
    category: TreeCategory
    growth_form: str | None = None
    classifications: list[str] | None = None
    primary_uses: str | None = None
    harvest_potential: bool | None = None
    harvest_type: str | None = None
    rwanda_suitability: str | None = None
    data_source: str | None = None
    review_status: str = "needs_review"
    taxon_rank: str = "species"
    varieties: list[SpeciesVarietyRead] = []
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
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
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
        "isibo",
        "household",
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
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
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

    @field_validator(
        "province",
        "district",
        "sector",
        "cell",
        "village",
        "isibo",
        "household",
        "notes",
        "external_id",
    )
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
    isibo: str | None
    household: str | None
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
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    status: TreeStatus | None = None
    external_id: str | None = Field(default=None, max_length=120)

    @field_validator(
        "province",
        "district",
        "sector",
        "cell",
        "village",
        "isibo",
        "household",
        "notes",
        "external_id",
    )
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class TreeCreate(TreeWriteBase):
    site_id: uuid.UUID | None = None
    species_id: uuid.UUID
    category: TreeCategory
    planting_date: date
    planting_date_approximate: bool = False
    planting_method: str | None = Field(default=None, max_length=40)
    planting_method_note: str | None = Field(default=None, max_length=200)
    soil_type: str | None = Field(default=None, max_length=40)
    terrain: str | None = Field(default=None, max_length=40)
    water_availability: str | None = Field(default=None, max_length=40)
    spacing: str | None = Field(default=None, max_length=40)
    fertilizer_applied: str | None = Field(default=None, max_length=20)
    mulching_applied: str | None = Field(default=None, max_length=20)
    watering_provided: str | None = Field(default=None, max_length=20)
    farmer_id: uuid.UUID | None = None
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("client_request_id")
    @classmethod
    def clean_request(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @field_validator(
        "planting_method",
        "planting_method_note",
        "soil_type",
        "terrain",
        "water_availability",
        "spacing",
        "fertilizer_applied",
        "mulching_applied",
        "watering_provided",
    )
    @classmethod
    def clean_planting(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_tree(self) -> TreeCreate:
        check_coordinate_pair(self.latitude, self.longitude)
        check_historical_date(self.planting_date, "Planting date")
        check_request_id(self.client_request_id)
        allowed = {
            "planting_method": {"ground", "transplant", "direct_seeding", "natural", "other"},
            "soil_type": {"clay", "sandy", "loam", "rocky", "other", "unknown"},
            "terrain": {"flat", "gentle", "steep", "other", "unknown"},
            "water_availability": {"rainfed", "nearby", "irrigation", "limited", "unknown"},
            "fertilizer_applied": {"yes", "no", "unknown"},
            "mulching_applied": {"yes", "no", "unknown"},
            "watering_provided": {"yes", "no", "unknown"},
        }
        for field, choices in allowed.items():
            value = getattr(self, field)
            if value is not None and value not in choices:
                raise ValueError("Choose one of the listed values.")
        if self.planting_method != "other":
            self.planting_method_note = None
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
    site_id: uuid.UUID | None
    site_name: str | None
    site_code: str | None
    farmer_id: uuid.UUID | None = None
    farmer_name: str | None = None
    province: str | None = None
    district: str | None = None
    sector: str | None = None
    cell: str | None = None
    village: str | None = None
    isibo: str | None = None
    household: str | None = None
    species_id: uuid.UUID
    species_common_name: str | None
    species_scientific_name: str | None
    category: TreeCategory
    planting_date: date
    planting_date_approximate: bool = False
    planting_method: str | None = None
    planting_method_note: str | None = None
    soil_type: str | None = None
    terrain: str | None = None
    water_availability: str | None = None
    spacing: str | None = None
    fertilizer_applied: str | None = None
    mulching_applied: str | None = None
    watering_provided: str | None = None
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
        if self.site_id is None:
            raise ValueError("Choose a planting site.")
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
