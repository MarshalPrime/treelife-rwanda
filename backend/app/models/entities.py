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
            "role IN ('admin', 'field_officer', 'viewer')",
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
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scientific_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    common_name: Mapped[str] = mapped_column(String(200), nullable=False)
    local_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )


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
    province: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
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
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("planting_sites.id", ondelete="RESTRICT"), nullable=False
    )
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    planting_date: Mapped[date] = mapped_column(Date, nullable=False)
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

    site: Mapped[PlantingSite] = relationship(back_populates="trees")
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
    species_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("species.id", ondelete="RESTRICT"), nullable=False
    )
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
