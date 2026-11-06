"""Map ORM rows to API schemas. Raw geography values stay in the database."""

from __future__ import annotations

from app.models.entities import (
    AuditLog,
    IndividualTree,
    LifecycleEvent,
    Organization,
    PlantingBatch,
    PlantingSite,
    Species,
)
from app.schemas.entities import (
    AuditRead,
    BatchRead,
    EventRead,
    OrganizationRead,
    SiteRead,
    SpeciesRead,
    TreeRead,
)


def has_coordinates(latitude: float | None, longitude: float | None) -> bool:
    return latitude is not None and longitude is not None


def site_to_read(site: PlantingSite) -> SiteRead:
    return SiteRead(
        id=site.id,
        public_code=site.public_code,
        name=site.name,
        site_type=site.site_type,
        organization_id=site.organization_id,
        organization_name=site.organization.name if site.organization else None,
        farmer_id=site.farmer_id,
        farmer_name=site.farmer.display_name if site.farmer else None,
        province=site.province,
        district=site.district,
        sector=site.sector,
        cell=site.cell,
        village=site.village,
        isibo=site.isibo,
        household=site.household,
        latitude=site.latitude,
        longitude=site.longitude,
        has_coordinates=has_coordinates(site.latitude, site.longitude),
        area_hectares=site.area_hectares,
        notes=site.notes,
        status=site.status,
        data_origin=site.data_origin,
        external_id=site.external_id,
        registered_by=site.registered_by,
        registered_by_name=site.registrar.full_name if site.registrar else None,
        registered_at=site.registered_at,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


def tree_to_read(tree: IndividualTree, quantity: int | None = None) -> TreeRead:
    return TreeRead(
        id=tree.id,
        public_code=tree.public_code,
        site_id=tree.site_id,
        site_name=tree.site.name if tree.site else None,
        site_code=tree.site.public_code if tree.site else None,
        farmer_id=tree.farmer_id,
        farmer_name=tree.farmer.display_name if tree.farmer else None,
        province=tree.province,
        district=tree.district,
        sector=tree.sector,
        cell=tree.cell,
        village=tree.village,
        isibo=tree.isibo,
        household=tree.household,
        species_id=tree.species_id,
        species_common_name=tree.species.common_name if tree.species else None,
        species_scientific_name=tree.species.scientific_name if tree.species else None,
        category=tree.category,
        planting_date=tree.planting_date,
        planting_date_approximate=getattr(tree, "planting_date_approximate", False),
        planting_method=getattr(tree, "planting_method", None),
        planting_method_note=getattr(tree, "planting_method_note", None),
        soil_type=getattr(tree, "soil_type", None),
        terrain=getattr(tree, "terrain", None),
        water_availability=getattr(tree, "water_availability", None),
        spacing=getattr(tree, "spacing", None),
        fertilizer_applied=getattr(tree, "fertilizer_applied", None),
        mulching_applied=getattr(tree, "mulching_applied", None),
        watering_provided=getattr(tree, "watering_provided", None),
        quantity=1 if quantity is None else quantity,
        latitude=tree.latitude,
        longitude=tree.longitude,
        has_coordinates=has_coordinates(tree.latitude, tree.longitude),
        status=tree.status,
        notes=tree.notes,
        data_origin=tree.data_origin,
        external_id=tree.external_id,
        registered_by=tree.registered_by,
        registered_by_name=tree.registrar.full_name if tree.registrar else None,
        registered_at=tree.registered_at,
        created_at=tree.created_at,
        updated_at=tree.updated_at,
    )


def batch_to_read(batch: PlantingBatch) -> BatchRead:
    base = tree_to_read(batch, quantity=batch.quantity)  # type: ignore[arg-type]
    return BatchRead(**base.model_dump())


def event_to_read(event: LifecycleEvent) -> EventRead:
    return EventRead(
        id=event.id,
        public_code=event.public_code,
        tree_id=event.tree_id,
        batch_id=event.batch_id,
        site_id=event.site_id,
        event_type=event.event_type,
        event_date=event.event_date,
        status_after=event.status_after,
        survival_count=event.survival_count,
        notes=event.notes,
        data_origin=event.data_origin,
        recorded_by=event.recorded_by,
        recorded_by_name=event.recorder.full_name if event.recorder else None,
        created_at=event.created_at,
    )


def organization_to_read(org: Organization) -> OrganizationRead:
    return OrganizationRead.model_validate(org)


def species_to_read(species: Species) -> SpeciesRead:
    record = SpeciesRead.model_validate(species)
    record.varieties.sort(key=lambda item: item.name.casefold())
    return record


def audit_to_read(entry: AuditLog) -> AuditRead:
    return AuditRead(
        id=entry.id,
        actor_id=entry.actor_id,
        actor_name=entry.actor.full_name if entry.actor else None,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        changed_fields=list(entry.changed_fields or []),
        created_at=entry.created_at,
    )
