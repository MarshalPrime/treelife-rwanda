"""Relational schema for registration, inspection, and audit.

An individual tree, a planting batch, and a planting site are separate records.
Site geography is stored once and referenced by trees and batches.

Coordinate reference system: WGS 84, SRID 4326.
`latitude` and `longitude` are decimal degrees for the API.
`location` is a PostGIS geography point for spatial queries.
Geography well-known text uses POINT(longitude latitude).
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, date, datetime
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UserRole(str, enum.Enum):
    admin = "admin"
    field_officer = "field_officer"
    farmer = "farmer"
    viewer = "viewer"


class OrganizationType(str, enum.Enum):
    cooperative = "cooperative"
    ngo = "ngo"
    public_institution = "public_institution"
    private = "private"
    community_group = "community_group"
    other = "other"


class SiteType(str, enum.Enum):
    farm = "farm"
    urban_plot = "urban_plot"
    roadside = "roadside"
    institution = "institution"
    orchard = "orchard"
    nursery_holding = "nursery_holding"
    other = "other"


class SiteStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class TreeCategory(str, enum.Enum):
    urban = "urban"
    fruit = "fruit"
    agroforestry = "agroforestry"
    other = "other"


class TreeStatus(str, enum.Enum):
    planted = "planted"
    surviving = "surviving"
    stressed = "stressed"
    dead = "dead"
    removed = "removed"
    unknown = "unknown"


class DataOrigin(str, enum.Enum):
    field_entry = "field_entry"
    synthetic_demo = "synthetic_demo"
    imported = "imported"


class EventType(str, enum.Enum):
    inspection = "inspection"
    survival_check = "survival_check"
    maintenance = "maintenance"
    harvest_observation = "harvest_observation"
    other = "other"


def _geography() -> Geography:
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(
            "org_type IN ('cooperative', 'ngo', 'public_institution', 'private', "
            "'community_group', 'other')",
            name="ck_organizations_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    org_type: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    members: Mapped[list[User]] = relationship(back_populates="organization")
    sites: Mapped[list[PlantingSite]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'field_officer', 'farmer', 'viewer')",
            name="ck_users_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default=UserRole.viewer.value)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    province: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    sector: Mapped[str | None] = mapped_column(String(120))
    cell: Mapped[str | None] = mapped_column(String(120))
    village: Mapped[str | None] = mapped_column(String(120))
    isibo: Mapped[str | None] = mapped_column(String(120))
    household: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(30))
    profile_photo_ext: Mapped[str | None] = mapped_column(String(8))
    profile_photo_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    organization: Mapped[Organization | None] = relationship(back_populates="members")


class Species(Base):
    __tablename__ = "species"
    __table_args__ = (
        CheckConstraint(
            "category IN ('urban', 'fruit', 'agroforestry', 'other')",
            name="ck_species_category",
        ),
        CheckConstraint(
            "growth_form IS NULL OR growth_form IN ('tree', 'shrub', 'herb', 'vine')",
            name="ck_species_growth_form",
        ),
        CheckConstraint(
            "review_status IN ('verified', 'needs_review', 'draft', 'rejected')",
            name="ck_species_review_status",
        ),
        CheckConstraint(
            "taxon_rank IN ('species', 'genus')",
            name="ck_species_taxon_rank",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scientific_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    common_name: Mapped[str] = mapped_column(String(200), nullable=False)
    local_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    other_local_names: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    growth_form: Mapped[str | None] = mapped_column(String(20), nullable=True)
    classifications: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    primary_uses: Mapped[str | None] = mapped_column(Text, nullable=True)
    harvest_potential: Mapped[bool | None] = mapped_column(nullable=True)
    harvest_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rwanda_suitability: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="needs_review", server_default="needs_review"
    )
    taxon_rank: Mapped[str] = mapped_column(
        String(20), nullable=False, default="species", server_default="species"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    varieties: Mapped[list[SpeciesVariety]] = relationship(back_populates="species")


class SpeciesVariety(Base):
    """A named variety of an approved species. Empty until an administrator records one."""

    __tablename__ = "species_varieties"
    __table_args__ = (UniqueConstraint("species_id", "name", name="uq_species_varieties_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    species: Mapped[Species] = relationship(back_populates="varieties")


class PlantingSite(Base):
    __tablename__ = "planting_sites"
    __table_args__ = (
        CheckConstraint(
            "site_type IN ('farm', 'urban_plot', 'roadside', 'institution', 'orchard', "
            "'nursery_holding', 'other')",
            name="ck_sites_type",
        ),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_sites_status"),
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_sites_origin",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_sites_latitude",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_sites_longitude",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_sites_coordinate_pair",
        ),
        CheckConstraint(
            "area_hectares IS NULL OR (area_hectares >= 0 AND area_hectares <= 100000)",
            name="ck_sites_area",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    site_type: Mapped[str] = mapped_column(String(40), nullable=False)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True
    )
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isibo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    household: Mapped[str | None] = mapped_column(String(120), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[Any | None] = mapped_column(_geography(), nullable=True)
    area_hectares: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=SiteStatus.active.value)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    organization: Mapped[Organization | None] = relationship(back_populates="sites")
    farmer: Mapped[Farmer | None] = relationship(back_populates="sites")
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])
    trees: Mapped[list[IndividualTree]] = relationship(back_populates="site")
    batches: Mapped[list[PlantingBatch]] = relationship(back_populates="site")


class IndividualTree(Base):
    __tablename__ = "individual_trees"
    __table_args__ = (
        CheckConstraint(
            "category IN ('urban', 'fruit', 'agroforestry', 'other')",
            name="ck_trees_category",
        ),
        CheckConstraint(
            "status IN ('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown')",
            name="ck_trees_status",
        ),
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_trees_origin",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_trees_latitude",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_trees_longitude",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_trees_coordinate_pair",
        ),
        CheckConstraint(
            "planting_method IS NULL OR planting_method IN "
            "('ground', 'transplant', 'direct_seeding', 'natural', 'other')",
            name="ck_trees_planting_method",
        ),
        CheckConstraint(
            "soil_type IS NULL OR soil_type IN "
            "('clay', 'sandy', 'loam', 'rocky', 'other', 'unknown')",
            name="ck_trees_soil",
        ),
        CheckConstraint(
            "terrain IS NULL OR terrain IN ('flat', 'gentle', 'steep', 'other', 'unknown')",
            name="ck_trees_terrain",
        ),
        CheckConstraint(
            "water_availability IS NULL OR water_availability IN "
            "('rainfed', 'nearby', 'irrigation', 'limited', 'unknown')",
            name="ck_trees_water",
        ),
        CheckConstraint(
            "fertilizer_applied IS NULL OR fertilizer_applied IN ('yes', 'no', 'unknown')",
            name="ck_trees_fertilizer",
        ),
        CheckConstraint(
            "mulching_applied IS NULL OR mulching_applied IN ('yes', 'no', 'unknown')",
            name="ck_trees_mulching",
        ),
        CheckConstraint(
            "watering_provided IS NULL OR watering_provided IN ('yes', 'no', 'unknown')",
            name="ck_trees_watering",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=True
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True
    )
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isibo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    household: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    planting_date: Mapped[date] = mapped_column(Date, nullable=False)
    planting_date_approximate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    planting_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    planting_method_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    soil_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    terrain: Mapped[str | None] = mapped_column(String(40), nullable=True)
    water_availability: Mapped[str | None] = mapped_column(String(40), nullable=True)
    spacing: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fertilizer_applied: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mulching_applied: Mapped[str | None] = mapped_column(String(20), nullable=True)
    watering_provided: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[Any | None] = mapped_column(_geography(), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TreeStatus.planted.value
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    site: Mapped[PlantingSite | None] = relationship(back_populates="trees")
    farmer: Mapped[Farmer | None] = relationship(back_populates="trees", foreign_keys=[farmer_id])
    species: Mapped[Species] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class PlantingBatch(Base):
    __tablename__ = "planting_batches"
    __table_args__ = (
        CheckConstraint(
            "category IN ('urban', 'fruit', 'agroforestry', 'other')",
            name="ck_batches_category",
        ),
        CheckConstraint(
            "status IN ('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown')",
            name="ck_batches_status",
        ),
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_batches_origin",
        ),
        CheckConstraint("quantity >= 1 AND quantity <= 100000", name="ck_batches_quantity"),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_batches_latitude",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_batches_longitude",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_batches_coordinate_pair",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=False
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True
    )
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isibo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    household: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    planting_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[Any | None] = mapped_column(_geography(), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TreeStatus.planted.value
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    site: Mapped[PlantingSite] = relationship(back_populates="batches")
    farmer: Mapped[Farmer | None] = relationship(foreign_keys=[farmer_id])
    species: Mapped[Species] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class Forest(Base):
    """A stand of many trees, recorded as one boundary instead of one point each."""

    __tablename__ = "forests"
    __table_args__ = (
        CheckConstraint(
            "distribution IN ('natural', 'rows', 'clusters', 'mixed')",
            name="ck_forests_distribution",
        ),
        CheckConstraint(
            "status IN ('surviving', 'stressed', 'dead', 'unknown')",
            name="ck_forests_status",
        ),
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_forests_origin",
        ),
        CheckConstraint(
            "estimated_trees >= 1 AND estimated_trees <= 10000000",
            name="ck_forests_trees",
        ),
        CheckConstraint("area_hectares > 0", name="ck_forests_area"),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_forests_latitude",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_forests_longitude",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    estimated_trees: Mapped[int] = mapped_column(Integer, nullable=False)
    distribution: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    area_hectares: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    ring: Mapped[list] = mapped_column(JSONB, nullable=False)
    boundary: Mapped[Any] = mapped_column(
        Geography(geometry_type="POLYGON", srid=4326, spatial_index=False), nullable=False
    )
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    species: Mapped[Species] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('inspection', 'survival_check', 'maintenance', "
            "'harvest_observation', 'other')",
            name="ck_events_type",
        ),
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_events_origin",
        ),
        CheckConstraint(
            "status_after IS NULL OR status_after IN "
            "('planted', 'surviving', 'stressed', 'dead', 'removed', 'unknown', 'active', 'inactive')",
            name="ck_events_status_after",
        ),
        CheckConstraint(
            "survival_count IS NULL OR (survival_count >= 0 AND survival_count <= 100000)",
            name="ck_events_survival_count",
        ),
        CheckConstraint(
            "(CASE WHEN tree_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN batch_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN site_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_events_one_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="RESTRICT"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_batches.id", ondelete="RESTRICT"), nullable=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    status_after: Mapped[str | None] = mapped_column(String(32), nullable=True)
    survival_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    tree: Mapped[IndividualTree | None] = relationship()
    batch: Mapped[PlantingBatch | None] = relationship()
    site: Mapped[PlantingSite | None] = relationship()
    recorder: Mapped[User] = relationship(foreign_keys=[recorded_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (CheckConstraint("action IN ('create', 'update')", name="ck_audit_action"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    actor: Mapped[User | None] = relationship()


class Farmer(Base):
    """A household or producer name linked to sites. No national identifier is stored."""

    __tablename__ = "farmers"
    __table_args__ = (
        CheckConstraint(
            "data_origin IN ('field_entry', 'synthetic_demo', 'imported')",
            name="ck_farmers_origin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isibo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    household: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    organization: Mapped[Organization | None] = relationship()
    account: Mapped[User | None] = relationship(foreign_keys=[user_id])
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])
    sites: Mapped[list[PlantingSite]] = relationship(back_populates="farmer")
    trees: Mapped[list[IndividualTree]] = relationship(
        back_populates="farmer", foreign_keys="IndividualTree.farmer_id"
    )


class SeedlingLot(Base):
    __tablename__ = "seedling_lots"
    __table_args__ = (
        CheckConstraint(
            "quantity_produced >= 1 AND quantity_produced <= 100000", name="ck_lots_produced"
        ),
        CheckConstraint(
            "quantity_remaining >= 0 AND quantity_remaining <= quantity_produced",
            name="ck_lots_remaining",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    nursery_site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=False
    )
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    quantity_produced: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    produced_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    nursery_site: Mapped[PlantingSite] = relationship()
    species: Mapped[Species] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class Distribution(Base):
    __tablename__ = "distributions"
    __table_args__ = (
        CheckConstraint("quantity >= 1 AND quantity <= 100000", name="ck_distributions_quantity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    seedling_lot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seedling_lots.id", ondelete="RESTRICT"), nullable=False
    )
    destination_site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=False
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    distributed_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    seedling_lot: Mapped[SeedlingLot] = relationship()
    destination_site: Mapped[PlantingSite] = relationship()
    farmer: Mapped[Farmer | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class GrowthMeasurement(Base):
    __tablename__ = "growth_measurements"
    __table_args__ = (
        CheckConstraint(
            "(tree_id IS NOT NULL AND batch_id IS NULL) OR (tree_id IS NULL AND batch_id IS NOT NULL)",
            name="ck_growth_one_target",
        ),
        CheckConstraint(
            "height_m IS NOT NULL OR dbh_cm IS NOT NULL OR survival_count IS NOT NULL",
            name="ck_growth_measure",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="RESTRICT"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_batches.id", ondelete="RESTRICT"), nullable=True
    )
    measured_on: Mapped[date] = mapped_column(Date, nullable=False)
    height_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    dbh_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    survival_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    tree: Mapped[IndividualTree | None] = relationship()
    batch: Mapped[PlantingBatch | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class MaintenanceActivity(Base):
    __tablename__ = "maintenance_activities"
    __table_args__ = (
        CheckConstraint(
            "activity_type IN ('pruning', 'watering', 'mulching', 'pest_control', 'staking', 'other')",
            name="ck_maintenance_type",
        ),
        CheckConstraint(
            "(CASE WHEN tree_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN batch_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN site_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_maintenance_one_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="RESTRICT"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_batches.id", ondelete="RESTRICT"), nullable=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=True
    )
    activity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    performed_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    tree: Mapped[IndividualTree | None] = relationship()
    batch: Mapped[PlantingBatch | None] = relationship()
    site: Mapped[PlantingSite | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class Harvest(Base):
    __tablename__ = "harvests"
    __table_args__ = (
        CheckConstraint("unit IN ('kg', 'count')", name="ck_harvests_unit"),
        CheckConstraint("quantity > 0 AND quantity <= 1000000", name="ck_harvests_quantity"),
        CheckConstraint(
            "quantity_remaining >= 0 AND quantity_remaining <= quantity",
            name="ck_harvests_remaining",
        ),
        CheckConstraint(
            "(tree_id IS NOT NULL AND batch_id IS NULL) OR (tree_id IS NULL AND batch_id IS NOT NULL)",
            name="ck_harvests_one_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="RESTRICT"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_batches.id", ondelete="RESTRICT"), nullable=True
    )
    harvested_on: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_remaining: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    tree: Mapped[IndividualTree | None] = relationship()
    batch: Mapped[PlantingBatch | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint("quantity > 0 AND quantity <= 1000000", name="ck_sales_quantity"),
        CheckConstraint("amount_rwf >= 0 AND amount_rwf <= 100000000000", name="ck_sales_amount"),
        CheckConstraint(
            "purpose IN ('sold', 'personal_consumption', 'stored', 'given_away', 'other')",
            name="ck_sales_purpose",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    harvest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harvests.id", ondelete="RESTRICT"), nullable=False
    )
    sold_on: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    amount_rwf: Mapped[float] = mapped_column(Float, nullable=False)
    purpose: Mapped[str] = mapped_column(
        String(32), nullable=False, default="sold", server_default="sold"
    )
    buyer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    harvest: Mapped[Harvest] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class HarvestFeedback(Base):
    __tablename__ = "harvest_feedback"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('experience', 'challenge', 'loss', 'suggestion', "
            "'observation', 'verification', 'recommendation')",
            name="ck_harvest_feedback_kind",
        ),
        CheckConstraint(
            "loss_quantity IS NULL OR (loss_quantity > 0 AND loss_quantity <= 1000000)",
            name="ck_harvest_feedback_loss",
        ),
        CheckConstraint(
            "verified_quantity IS NULL OR (verified_quantity >= 0 AND verified_quantity <= 1000000)",
            name="ck_harvest_feedback_verified",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    harvest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harvests.id", ondelete="SET NULL"), nullable=True
    )
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="SET NULL"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_batches.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    loss_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    loss_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    verified_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    harvest: Mapped[Harvest | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class HarvestNotice(Base):
    __tablename__ = "harvest_notices"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('loss', 'unusual', 'mismatch')",
            name="ck_harvest_notices_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    summary: Mapped[str] = mapped_column(String(400), nullable=False)
    harvest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harvests.id", ondelete="SET NULL"), nullable=True
    )
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    harvest: Mapped[Harvest | None] = relationship()


class Advisory(Base):
    __tablename__ = "advisories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    species_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="SET NULL"), nullable=True
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="SET NULL"), nullable=True
    )
    issued_on: Mapped[date] = mapped_column(Date, nullable=False)
    data_origin: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DataOrigin.field_entry.value
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    species: Mapped[Species | None] = relationship()
    farmer: Mapped[Farmer | None] = relationship()
    site: Mapped[PlantingSite | None] = relationship()
    registrar: Mapped[User] = relationship(foreign_keys=[registered_by])


class CarbonAuthorization(Base):
    __tablename__ = "carbon_authorizations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'revoked')",
            name="ck_carbon_authorizations_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    experience: Mapped[str] = mapped_column(Text, nullable=False)
    training: Mapped[str] = mapped_column(Text, nullable=False)
    qualifications: Mapped[str] = mapped_column(Text, nullable=False)
    decision_reason: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    officer: Mapped[User] = relationship(foreign_keys=[user_id])
    decider: Mapped[User | None] = relationship(foreign_keys=[decided_by])
    documents: Mapped[list["CarbonDocument"]] = relationship(back_populates="authorization")  # noqa: UP037
    events: Mapped[list["CarbonAuthorizationEvent"]] = relationship(back_populates="authorization")  # noqa: UP037


class CarbonAuthorizationEvent(Base):
    __tablename__ = "carbon_authorization_events"
    __table_args__ = (
        CheckConstraint(
            "action IN ('submitted', 'approved', 'rejected', 'revoked')",
            name="ck_carbon_authorization_events_action",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    authorization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("carbon_authorizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    authorization: Mapped[CarbonAuthorization] = relationship(back_populates="events")
    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id])


class CarbonDocument(Base):
    __tablename__ = "carbon_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    authorization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("carbon_authorizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    stored_ext: Mapped[str] = mapped_column(String(8), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )

    authorization: Mapped[CarbonAuthorization] = relationship(back_populates="documents")


class SpeciesCarbonParameter(Base):
    """Published basic wood specific gravity for one species. Empty means no carbon stock."""

    __tablename__ = "species_carbon_parameters"
    __table_args__ = (
        CheckConstraint(
            "basic_specific_gravity > 0 AND basic_specific_gravity <= 1.5",
            name="ck_species_carbon_parameters_gravity",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scientific_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    basic_specific_gravity: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )


class CarbonMeasurement(Base):
    __tablename__ = "carbon_measurements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('surviving', 'stressed', 'dead', 'planted', 'unknown')",
            name="ck_carbon_measurements_status",
        ),
        CheckConstraint(
            "review_status IN ('pending', 'accepted', 'correction')",
            name="ck_carbon_measurements_review",
        ),
        CheckConstraint("dbh_cm > 0", name="ck_carbon_measurements_dbh"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_trees.id", ondelete="SET NULL"), nullable=True
    )
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    species_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    species_note: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    dbh_cm: Mapped[float] = mapped_column(Float, nullable=False)
    height_m: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    measured_on: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    review_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    agb_kg: Mapped[float | None] = mapped_column(Float)
    carbon_kg: Mapped[float | None] = mapped_column(Float)
    co2e_kg: Mapped[float | None] = mapped_column(Float)
    wood_specific_gravity: Mapped[float | None] = mapped_column(Float)
    methodology_id: Mapped[str | None] = mapped_column(String(40))
    methodology_version: Mapped[str | None] = mapped_column(String(20))
    parameter_source: Mapped[str | None] = mapped_column(Text)
    estimate_note: Mapped[str | None] = mapped_column(Text)
    photo_ext: Mapped[str | None] = mapped_column(String(8))
    photo_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )

    species: Mapped[Species] = relationship()
    tree: Mapped[IndividualTree | None] = relationship()
    collector: Mapped[User] = relationship(foreign_keys=[collected_by])


class CarbonMeasurementRevision(Base):
    __tablename__ = "carbon_measurement_revisions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    measurement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carbon_measurements.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
