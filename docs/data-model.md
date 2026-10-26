# Data model

The schema is created by `backend/alembic/versions/0001_initial.py`. Enumerations are stored as text with check constraints so later values can be added in a migration.

## Records

```text
organizations 1---* users
organizations 1---* planting_sites
users 1---* planting_sites        (registered_by)
planting_sites 1---* individual_trees
planting_sites 1---* planting_batches
species 1---* individual_trees
species 1---* planting_batches
individual_trees 1---* lifecycle_events
planting_batches 1---* lifecycle_events
planting_sites 1---* lifecycle_events
users 1---* audit_logs
```

An individual tree is one tree. It has no quantity column. A planting batch has `quantity` from 1 to 100000. Both point at one site and one species, so the farm or plot is not copied onto every tree.

## Tables

### users

Email, full name, password hash, role, optional organization, and active flag. No phone number and no national identifier.

Roles: `admin`, `field_officer`, `viewer`.

### organizations

Name and type (`cooperative`, `ngo`, `public_institution`, `private`, `community_group`, `other`). Optional `external_id` and notes. Contact details are not collected.

### species

Scientific name, common name, optional local name, and a default category. The seeded names are a reference list, not evidence that those trees were planted.

### planting_sites

Public code, name, site type, optional organization, administrative place names (province, district, sector, cell, village), optional area, status (`active` or `inactive`), notes, data origin, optional external id, client request id, registrar, and timestamps.

Coordinates are optional and paired. `location` is `geography(POINT, 4326)`.

Site types include `nursery_holding` so a later nursery module has a place to attach without a second copy of the site.

### individual_trees and planting_batches

Public code, site, species, category (`urban`, `fruit`, `agroforestry`, `other`), planting date, optional coordinates, status, notes, data origin, external id, client request id, registrar, and timestamps.

Tree and batch status: `planted`, `surviving`, `stressed`, `dead`, `removed`, `unknown`.

Category is stored on the planting record as well as on the species. A fruit species can be recorded as an urban planting.

### lifecycle_events

Exactly one of tree, batch, or site. Event type, date, optional status after the event, optional survival count, notes, data origin, client request id, and the user who recorded it.

Survival count is only valid for a batch, and it cannot exceed that batch's quantity. When `status_after` is set, the target record's status is updated in the same transaction.

Event types: `inspection`, `survival_check`, `maintenance`, `harvest_observation`, `other`.

### audit_logs

Actor, action (`create` or `update`), entity type, entity id, and the names of changed fields. Values such as notes and coordinates are not copied into the log.

## Data origin

`field_entry`, `synthetic_demo`, or `imported`.

The API sets `field_entry` for records created through the registration endpoints. The seed sets `synthetic_demo` directly. Clients cannot choose the origin, so a user cannot mark a new entry as a verified import.

## Validation

- Names are required and trimmed.
- Latitude and longitude are both present or both empty, and inside the global ranges.
- Planting and event dates are on or after 1950-01-01 and not more than one day in the future.
- Batch quantity is a whole number from 1 to 100000.
- Area, when present, is from 0 to 100000 hectares.

## Indexes

Unique public codes, unique client request ids, and GIST indexes on the three geography columns. Foreign keys and status/district filters have btree indexes.

## Personal and location data

The model avoids phone numbers, national IDs, and free-text contact fields. Place names and coordinates can still identify a plot. Treat exports as sensitive. Do not load real farmer data until a pilot has an agreed consent and retention process. See [pilot-plan.md](pilot-plan.md).
