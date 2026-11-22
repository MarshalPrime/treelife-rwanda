"""Request and response models for the value chain beyond registration."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.validation import (
    check_historical_date,
    check_measure,
    check_positive_number,
    check_quantity,
    check_request_id,
    clean_optional_text,
)

_PLACE_FIELDS = ("province", "district", "sector", "cell", "village", "isibo", "household")


class FarmerCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    organization_id: uuid.UUID | None = None
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
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

    @field_validator(*_PLACE_FIELDS, "phone", "notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_farmer(self) -> FarmerCreate:
        check_request_id(self.client_request_id)
        return self


class FarmerUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    cell: str | None = Field(default=None, max_length=120)
    village: str | None = Field(default=None, max_length=120)
    isibo: str | None = Field(default=None, max_length=120)
    household: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator(*_PLACE_FIELDS, "phone")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class ProfileRead(BaseModel):
    display_name: str
    phone: str | None = None
    province: str | None = None
    district: str | None = None
    sector: str | None = None
    cell: str | None = None
    village: str | None = None
    isibo: str | None = None
    household: str | None = None
    profile_photo_at: datetime | None = None


class ProfilePhotoRead(BaseModel):
    profile_photo_at: datetime


class FarmerTreeBrief(BaseModel):
    id: uuid.UUID
    public_code: str
    species_common_name: str | None
    planting_date: date
    status: str
    has_coordinates: bool = False


class FarmerRead(BaseModel):
    id: uuid.UUID
    public_code: str
    display_name: str
    organization_id: uuid.UUID | None
    organization_name: str | None
    province: str | None = None
    district: str | None
    sector: str | None = None
    cell: str | None = None
    village: str | None = None
    isibo: str | None = None
    household: str | None = None
    phone: str | None
    notes: str | None
    data_origin: str
    registered_by: uuid.UUID | None = None
    registered_by_name: str | None
    registered_at: datetime
    site_count: int
    tree_count: int = 0
    trees: list[FarmerTreeBrief] = []
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
            "fertilizer",
            "weeding",
            "environmental",
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
    purpose: Literal["sold", "personal_consumption", "stored", "given_away", "other"] = "sold"
    amount_rwf: float = 0
    buyer_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("buyer_name")
    @classmethod
    def clean_buyer(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @field_validator("notes", "client_request_id")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_sale(self) -> SaleCreate:
        if self.purpose == "sold":
            if not self.buyer_name:
                raise ValueError("Name the market or organization. Do not enter a national ID.")
        else:
            self.buyer_name = None
            self.amount_rwf = 0
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
    purpose: str
    buyer_name: str | None
    notes: str | None
    data_origin: str


class HarvestShare(BaseModel):
    harvest_id: uuid.UUID
    public_code: str
    target_code: str | None
    harvested_on: date
    quantity: float
    unit: str
    sold: float
    personal_consumption: float
    stored: float
    given_away: float
    other: float
    unassigned: float
    balanced: bool
    recorded_by: str


class HarvestHistoryItem(BaseModel):
    public_code: str
    kind: Literal["harvest", "destination"]
    occurred_on: date
    target_code: str | None
    quantity: float
    unit: str
    purpose: str | None
    amount_rwf: float | None
    buyer_name: str | None
    recorded_by: str
    harvest_code: str | None


class HarvestOverview(BaseModel):
    harvested_kg: float
    harvested_count: float
    sold_kg: float
    sold_count: float
    sales_rwf: float
    personal_kg: float
    personal_count: float
    stored_kg: float
    stored_count: float
    given_kg: float
    given_count: float
    other_kg: float
    other_count: float
    unassigned_kg: float
    unassigned_count: float
    shares: list[HarvestShare]
    history: list[HarvestHistoryItem]


class HarvestFeedbackCreate(BaseModel):
    harvest_id: uuid.UUID | None = None
    kind: Literal[
        "experience",
        "challenge",
        "loss",
        "suggestion",
        "observation",
        "verification",
        "recommendation",
    ]
    body: str = Field(min_length=1, max_length=2000)
    loss_quantity: float | None = None
    loss_unit: str | None = None
    verified_quantity: float | None = None
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Write the feedback before saving.")
        return cleaned

    @field_validator("client_request_id")
    @classmethod
    def clean_request(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_feedback(self) -> HarvestFeedbackCreate:
        check_request_id(self.client_request_id)
        if self.kind == "loss" and self.loss_quantity is not None:
            if self.loss_unit not in {"kg", "count"}:
                raise ValueError("Loss unit must be kg or count.")
            check_measure(self.loss_quantity, self.loss_unit)
        else:
            self.loss_quantity = None
            self.loss_unit = None
        if self.kind == "verification":
            if self.harvest_id is None or self.verified_quantity is None:
                raise ValueError("Choose the harvest and enter the quantity you checked.")
            if self.verified_quantity < 0 or self.verified_quantity > 1_000_000:
                raise ValueError("Verified quantity must be zero or a positive number.")
        else:
            self.verified_quantity = None
        return self


class HarvestFeedbackRead(BaseModel):
    id: uuid.UUID
    public_code: str
    harvest_id: uuid.UUID | None
    harvest_code: str | None
    kind: str
    body: str
    loss_quantity: float | None
    loss_unit: str | None
    verified_quantity: float | None
    recorded_by: str
    created_at: datetime


class HarvestNoticeRead(BaseModel):
    id: uuid.UUID
    public_code: str
    kind: str
    summary: str
    harvest_code: str | None
    created_at: datetime


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
    checked_trees: int = 0
    survival_percent: int | None = None
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
    checked_trees: int = 0
    survival_percent: int | None = None
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


class DashboardFilters(BaseModel):
    district: str | None = None
    species_id: uuid.UUID | None = None
    range: str
    start_date: date
    end_date: date


class DashboardOptions(BaseModel):
    districts: list[str]
    species: list[dict[str, object]]


class DashboardSummary(BaseModel):
    recorded_trees: int
    standing_trees: int = 0
    checked_trees: int
    surviving_trees: int
    survival_percent: int | None
    healthy_trees: int = 0
    moderate_trees: int = 0
    critical_trees: int = 0
    farmers: int
    sites: int
    species: int
    districts: int
    harvested_kg: float | None = None
    sales_rwf: float | None = None
    records_missing_coordinates: int


class DashboardSeriesPoint(BaseModel):
    day: date
    planted: int
    activity: int
    harvested_kg: float | None = None
    sales_rwf: float | None = None


class DashboardSpeciesCount(BaseModel):
    species_id: uuid.UUID
    species_common_name: str
    trees: int


class DashboardDistrictCount(BaseModel):
    district: str
    trees: int


class DashboardRecent(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    site_name: str | None
    status: str
    planting_date: date
    public_code: str | None = None
    quantity: int


class DashboardAttention(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    reason: str
    public_code: str | None = None
    status: str | None = None
    place: str | None = None


class DashboardAgent(BaseModel):
    id: uuid.UUID
    name: str
    trees_registered: int
    checked: int
    pending: int
    coordinate_percent: int
    last_registered_on: date
    districts: list[str]


class AgentRegistration(BaseModel):
    day: date
    trees: int


class AgentPlaceCount(BaseModel):
    district: str
    sector: str | None = None
    village: str | None = None
    trees: int


class AgentIssue(BaseModel):
    id: uuid.UUID
    kind: Literal["tree", "batch"]
    code: str | None = None
    title: str
    issue: Literal["condition", "visit", "coordinates", "incomplete", "duplicate"]
    place: str | None = None


class AgentBoardRow(BaseModel):
    id: uuid.UUID
    name: str
    trees_registered: int
    checked: int
    pending: int
    coordinate_percent: int
    last_registered_on: date
    last_submission_on: date
    submissions: int
    districts: list[str]
    registrations: list[AgentRegistration]
    places: list[AgentPlaceCount]
    issues: list[AgentIssue]
    incomplete: int
    duplicates: int
    missing_coordinates: int


class AgentSpeciesOption(BaseModel):
    id: uuid.UUID
    common_name: str


class AgentBoardResponse(BaseModel):
    generated_at: datetime
    districts: list[str] = []
    species: list[AgentSpeciesOption] = []
    agents: list[AgentBoardRow]


class DashboardValueChain(BaseModel):
    seedlings_remaining: int
    seedlings_distributed: int
    unsold_kg: float
    advisories: int
    harvest_by_species: list[SpeciesTotal]


class DashboardResponse(BaseModel):
    role: str
    scope_label: str
    linked: bool
    includes_demonstration: bool
    generated_at: datetime
    filters: DashboardFilters
    options: DashboardOptions
    summary: DashboardSummary
    series: list[DashboardSeriesPoint]
    species_counts: list[DashboardSpeciesCount]
    districts: list[DashboardDistrictCount]
    recent: list[DashboardRecent]
    attention: list[DashboardAttention]
    agents: list[DashboardAgent] = []
    map_query: str
    value_chain: DashboardValueChain | None = None


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def clean_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Write a message first.")
        return cleaned


class AssistantRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=12)


class AssistantReply(BaseModel):
    reply: str


class ForecastTotal(BaseModel):
    unit: Literal["kg", "count"]
    low: float
    high: float
    trees: int


class ForecastSpecies(BaseModel):
    species_common_name: str
    unit: Literal["kg", "count"]
    low: float
    high: float
    trees: int
    source: str | None = None


class ForecastGroup(BaseModel):
    label: str
    unit: Literal["kg", "count"]
    low: float
    high: float
    trees: int


class ForecastPlanting(BaseModel):
    public_code: str
    species_common_name: str
    trees: int
    unit: Literal["kg", "count"] | None = None
    low: float | None = None
    high: float | None = None
    basis: Literal["recorded", "household", "reference", "bearing", "young", "none"]
    note: str


class HarvestForecast(BaseModel):
    role: str
    totals: list[ForecastTotal]
    by_species: list[ForecastSpecies]
    by_district: list[ForecastGroup]
    by_province: list[ForecastGroup]
    by_farmer: list[ForecastGroup]
    plantings: list[ForecastPlanting]
    young_trees: int
    bearing_trees: int
    unestimated_trees: int


class HarvestOffer(BaseModel):
    farmer_id: uuid.UUID
    farmer_name: str
    species_id: uuid.UUID
    species_common_name: str
    farm_label: str | None = None
    province: str | None = None
    district: str | None = None
    sector: str | None = None
    trees: int
    unit: Literal["kg", "count"]
    low: float
    high: float
    period: str


class HarvestInterestCreate(BaseModel):
    farmer_id: uuid.UUID
    species_id: uuid.UUID
    district: str | None = Field(default=None, max_length=120)
    quantity: float
    unit: Literal["kg", "count"]
    period: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("period")
    @classmethod
    def clean_period(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Enter the period you want to collect.")
        return cleaned

    @field_validator("notes", "district")
    @classmethod
    def clean_interest_text(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def check_quantity(self) -> HarvestInterestCreate:
        check_positive_number(self.quantity, "Quantity")
        return self


class HarvestInterestUpdate(BaseModel):
    status: Literal["accepted", "rejected", "completed", "cancelled"]
    response_note: str | None = Field(default=None, max_length=2000)

    @field_validator("response_note")
    @classmethod
    def clean_reply(cls, value: str | None) -> str | None:
        return clean_optional_text(value)


class HarvestInterestRead(BaseModel):
    id: uuid.UUID
    public_code: str
    farmer_id: uuid.UUID
    farmer_name: str
    species_common_name: str
    farm_label: str | None = None
    province: str | None = None
    district: str | None = None
    sector: str | None = None
    quantity: float
    unit: Literal["kg", "count"]
    period: str
    notes: str | None = None
    status: Literal["pending", "accepted", "rejected", "completed", "cancelled"]
    response_note: str | None = None
    requester_name: str
    created_at: datetime
