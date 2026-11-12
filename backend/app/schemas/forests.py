"""A forest stand: one named boundary, one estimated count, one main species."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Distribution = Literal["natural", "rows", "clusters", "mixed"]
ForestCondition = Literal["surviving", "stressed", "dead", "unknown"]


class ForestPoint(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class ForestCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    species_id: uuid.UUID
    estimated_trees: int = Field(ge=1, le=10_000_000)
    distribution: Distribution
    status: ForestCondition = "unknown"
    description: str | None = Field(default=None, max_length=2000)
    province: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    boundary: list[ForestPoint] = Field(min_length=3, max_length=60)
    client_request_id: str | None = Field(default=None, max_length=80)

    @field_validator("name", "description", "province", "district", "client_request_id")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ForestRead(BaseModel):
    id: uuid.UUID
    public_code: str
    name: str
    species_id: uuid.UUID
    species_common_name: str | None
    estimated_trees: int
    distribution: str
    status: str
    description: str | None
    province: str | None
    district: str | None
    area_hectares: float
    latitude: float | None
    longitude: float | None
    boundary: list[ForestPoint]
    data_origin: str
    registered_by_name: str | None
    registered_at: datetime
