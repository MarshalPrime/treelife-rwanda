"""Request and response models for the value chain beyond registration."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.validation import (
    check_historical_date,
    check_measure,
    check_positive_number,
    check_quantity,
    check_request_id,
    clean_optional_text,
)


class FarmerCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    organization_id: uuid.UUID | None = None
    district: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator("district", "phone", "notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_farmer(self) -> FarmerCreate:
        check_request_id(self.client_request_id)
        return self


class FarmerRead(BaseModel):
    id: uuid.UUID
    public_code: str
    display_name: str
    organization_id: uuid.UUID | None
    organization_name: str | None
    district: str | None
    phone: str | None
    notes: str | None
    data_origin: str
    registered_by_name: str | None
    registered_at: datetime
    site_count: int
    has_login: bool = False


class FarmerLoginCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", cleaned) is None:
            raise ValueError("Enter a valid email address.")
        return cleaned

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class LotCreate(BaseModel):
    nursery_site_id: uuid.UUID
    species_id: uuid.UUID
    quantity_produced: int
    produced_on: date
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_lot(self) -> LotCreate:
        check_quantity(self.quantity_produced)
        check_historical_date(self.produced_on, "Production date")
        check_request_id(self.client_request_id)
        return self


class LotRead(BaseModel):
    id: uuid.UUID
    public_code: str
    nursery_site_id: uuid.UUID
    nursery_site_name: str | None
    species_id: uuid.UUID
    species_common_name: str | None
    quantity_produced: int
    quantity_remaining: int
    produced_on: date
    notes: str | None
    data_origin: str


class DistributionCreate(BaseModel):
    seedling_lot_id: uuid.UUID
    destination_site_id: uuid.UUID
    farmer_id: uuid.UUID | None = None
    quantity: int
    distributed_on: date
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_distribution(self) -> DistributionCreate:
        check_quantity(self.quantity)
        check_historical_date(self.distributed_on, "Distribution date")
        check_request_id(self.client_request_id)
        return self


class DistributionRead(BaseModel):
    id: uuid.UUID
    public_code: str
    seedling_lot_id: uuid.UUID
    lot_code: str | None
    destination_site_id: uuid.UUID
    destination_site_name: str | None
    farmer_id: uuid.UUID | None
    farmer_name: str | None
    quantity: int
    distributed_on: date
    notes: str | None
    data_origin: str


class GrowthCreate(BaseModel):
    tree_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    measured_on: date
    height_m: float | None = None
    dbh_cm: float | None = None
    survival_count: int | None = None
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_growth(self) -> GrowthCreate:
        if (self.tree_id is None) == (self.batch_id is None):
            raise ValueError("Choose either one tree or one planting batch.")
        if self.height_m is None and self.dbh_cm is None and self.survival_count is None:
            raise ValueError("Enter a height, a diameter, or a survival count.")
        if self.height_m is not None:
            check_positive_number(self.height_m, "Height")
        if self.dbh_cm is not None:
            check_positive_number(self.dbh_cm, "Diameter")
        if self.survival_count is not None and self.tree_id is not None:
            raise ValueError("Survival count is for a planting batch.")
        if self.survival_count is not None and self.survival_count < 0:
            raise ValueError("Survival count cannot be negative.")
        check_historical_date(self.measured_on, "Measurement date")
        check_request_id(self.client_request_id)
        return self


class GrowthRead(BaseModel):
    id: uuid.UUID
    public_code: str
    tree_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    target_code: str | None
    measured_on: date
    height_m: float | None
    dbh_cm: float | None
    survival_count: int | None
    notes: str | None
    data_origin: str


class MaintenanceCreate(BaseModel):
    tree_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    site_id: uuid.UUID | None = None
    activity_type: str
    performed_on: date
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_maintenance(self) -> MaintenanceCreate:
        chosen = [self.tree_id, self.batch_id, self.site_id]
        if sum(value is not None for value in chosen) != 1:
            raise ValueError("Choose one tree, one batch, or one site.")
        if self.activity_type not in {
            "pruning",
            "watering",
            "mulching",
            "pest_control",
            "staking",
            "other",
        }:
            raise ValueError("Choose a maintenance activity.")
        check_historical_date(self.performed_on, "Activity date")
        check_request_id(self.client_request_id)
        return self


class MaintenanceRead(BaseModel):
    id: uuid.UUID
    public_code: str
    tree_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    site_id: uuid.UUID | None
    target_code: str | None
    activity_type: str
    performed_on: date
    notes: str | None
    data_origin: str


class HarvestCreate(BaseModel):
    tree_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    harvested_on: date
    quantity: float
    unit: str
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_harvest(self) -> HarvestCreate:
        if (self.tree_id is None) == (self.batch_id is None):
            raise ValueError("Choose either one tree or one planting batch.")
        if self.unit not in {"kg", "count"}:
            raise ValueError("Unit must be kg or count.")
        check_measure(self.quantity, self.unit)
        check_historical_date(self.harvested_on, "Harvest date")
        check_request_id(self.client_request_id)
        return self


class HarvestRead(BaseModel):
    id: uuid.UUID
    public_code: str
    tree_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    target_code: str | None
    harvested_on: date
    quantity: float
    quantity_remaining: float
    unit: str
    notes: str | None
    data_origin: str


class SaleCreate(BaseModel):
    harvest_id: uuid.UUID
    sold_on: date
    quantity: float
    amount_rwf: float
    buyer_name: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("buyer_name")
    @classmethod
    def clean_buyer(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Buyer name is required.")
        return cleaned

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_sale(self) -> SaleCreate:
        if self.amount_rwf < 0 or self.amount_rwf > 100_000_000_000:
            raise ValueError("Amount must be zero or a positive number of Rwandan francs.")
        check_historical_date(self.sold_on, "Sale date")
        check_request_id(self.client_request_id)
        return self


class SaleRead(BaseModel):
    id: uuid.UUID
    public_code: str
    harvest_id: uuid.UUID
    harvest_code: str | None
    sold_on: date
    quantity: float
    unit: str
    amount_rwf: float
    buyer_name: str
    notes: str | None
    data_origin: str


class AdvisoryCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    species_id: uuid.UUID | None = None
    farmer_id: uuid.UUID | None = None
    site_id: uuid.UUID | None = None
    issued_on: date
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("title", "body")
    @classmethod
    def clean_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_advisory(self) -> AdvisoryCreate:
        check_historical_date(self.issued_on, "Advice date")
        check_request_id(self.client_request_id)
        return self


class AdvisoryRead(BaseModel):
    id: uuid.UUID
    public_code: str
    title: str
    body: str
    species_id: uuid.UUID | None
    species_common_name: str | None
    farmer_id: uuid.UUID | None
    farmer_name: str | None
    site_id: uuid.UUID | None
    site_name: str | None
    issued_on: date
    data_origin: str


class SpeciesTotal(BaseModel):
    species_common_name: str
    harvested_kg: float
    harvested_count: float


class SpeciesCount(BaseModel):
    species_common_name: str
    trees: int


class ActivitySlice(BaseModel):
    species_common_name: str
    checks: int


class ActivityDay(BaseModel):
    day: date
    checks: int
    by_species: list[ActivitySlice]


class FarmerPlanting(BaseModel):
    id: uuid.UUID
    kind: str
    species_common_name: str
    site_name: str | None
    farmer_name: str | None = None
    status: str
    planting_date: date
    quantity: int


class FarmerBadge(BaseModel):
    key: str
    title: str
    sentence: str
    earned: bool


class FarmerOverview(BaseModel):
    linked: bool
    farmer_id: uuid.UUID | None
    farmer_name: str
    sites: int
    trees: int
    batches: int
    recorded_trees: int
    surviving_trees: int
    harvested_kg: float
    sales_rwf: float
    species_counts: list[SpeciesCount]
    plantings: list[FarmerPlanting]
    district: str | None
    organization_name: str | None
    phone: str | None
    metal: str | None


class OfficerOverview(BaseModel):
    officer_name: str
    farmers_helped: int
    sites: int
    trees: int
    batches: int
    recorded_trees: int
    surviving_trees: int
    harvested_kg: float
    sales_rwf: float
    species_counts: list[SpeciesCount]
    plantings: list[FarmerPlanting]
    metal: str | None


class DistrictTotal(BaseModel):
    district: str
    sites: int


class DistrictTrees(BaseModel):
    district: str
    trees: int


class CountryOverview(BaseModel):
    recorded_trees: int
    species_counts: list[SpeciesCount]
    districts: list[DistrictTrees]


class AnalyticsResponse(BaseModel):
    farmers: int
    seedling_lots: int
    seedlings_remaining: int
    seedlings_distributed: int
    growth_measurements: int
    maintenance_activities: int
    harvests: int
    harvested_kg: float
    harvested_count: float
    unsold_kg: float
    sales: int
    sales_rwf: float
    advisories: int
    trees: int
    surviving_trees: int
    recorded_trees: int
    checked_trees: int
    survival_percent: int | None
    sites: int
    sites_visited: int
    includes_demonstration: bool
    species_counts: list[SpeciesCount]
    activity: list[ActivityDay]
    by_species: list[SpeciesTotal]
    by_district: list[DistrictTotal]
