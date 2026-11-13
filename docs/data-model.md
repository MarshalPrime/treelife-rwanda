# Data model

The schema is created by `backend/alembic/versions/0001_initial.py` and extended by `0002_value_chain.py`. Enumerations are stored as text with check constraints so later values can be added in a migration.

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

Roles: `admin`, `field_officer`, `farmer`, `viewer`. A farmer login is optional and is stored as `farmers.user_id`. It does not store a national ID.

### organizations

Name and type (`cooperative`, `ngo`, `public_institution`, `private`, `community_group`, `other`). Optional `external_id` and notes. Contact details are not collected.

### species

Scientific name, common name, optional local name, and a default category. The seeded names are a reference list, not evidence that those trees were planted.

### planting_sites

Public code, name, site type, optional organization, administrative place names (province, district, sector, cell, village), optional area, status (`active` or `inactive`), notes, data origin, optional external id, client request id, registrar, and timestamps.

Coordinates are optional and paired. `location` is `geography(POINT, 4326)`.

Site types include `nursery_holding`. A site can also point at one farmer. A seedling lot is produced at a nursery site and reduced when a distribution moves seedlings to a destination site.

### individual_trees and planting_batches

Public code, site, optional farmer, species, category (`urban`, `fruit`, `agroforestry`, `other`), planting date, optional coordinates, status, notes, data origin, external id, client request id, registrar, and timestamps. A farmer account that omits the farmer is stored against that account's own household. An officer can set the farmer when they are helping a household.

Tree and batch status: `planted`, `surviving`, `stressed`, `dead`, `removed`, `unknown`.

Category is stored on the planting record as well as on the species. A fruit species can be recorded as an urban planting.

### lifecycle_events

Exactly one of tree, batch, or site. Event type, date, optional status after the event, optional survival count, notes, data origin, client request id, and the user who recorded it.

Survival count is only valid for a batch, and it cannot exceed that batch's quantity. When `status_after` is set, the target record's status is updated in the same transaction.

Event types: `inspection`, `survival_check`, `maintenance`, `harvest_observation`, `other`.

### carbon_authorizations

A request from a field officer. Status is `pending`, `approved`, `rejected`, or `revoked`. No row means not requested. Experience, training, and qualifications are stored on the request. `decided_by` and `decided_at` record the administrator decision. A partial unique index allows only one pending or approved request per officer.

`carbon_authorization_events` keeps the history of submission, approval, rejection, and revocation, including the actor and reason. `carbon_documents` stores the name of an uploaded certificate. The file itself is on disk, not in the table.

### carbon_measurements

A specialist field measurement: optional tree, species, whether the species was checked, GPS coordinates, diameter at breast height, optional height, health status, measurement date, notes, optional photo, review status, and the authorized user who collected it. When the species has a published basic wood specific gravity and a height, the row also stores the estimated aboveground stock, the methodology, and the version. `species_carbon_parameters` holds those published values. `carbon_measurement_revisions` stores the previous field values when a measurement is edited. The stored figure is an estimate, not a certified credit.

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

A farmer record stores a display name, an optional district, and an optional phone number. It does not store a national ID. Place names and coordinates can still identify a plot. Treat exports as sensitive. Do not load real farmer data until a pilot has an agreed consent and retention process. See [pilot-plan.md](pilot-plan.md).

## Value chain

```text
farmers 1---* planting_sites
planting_sites 1---* seedling_lots     (the nursery site)
species 1---* seedling_lots
seedling_lots 1---* distributions
planting_sites 1---* distributions     (the destination site)
farmers 1---* distributions
individual_trees 1---* growth_measurements
planting_batches 1---* growth_measurements
individual_trees 1---* maintenance_activities
planting_batches 1---* maintenance_activities
planting_sites 1---* maintenance_activities
individual_trees 1---* harvests
planting_batches 1---* harvests
harvests 1---* sales
farmers 1---* advisories
```

A distribution cannot exceed the seedlings still in its lot. A sale cannot exceed the quantity still on its harvest. Growth and harvest records point at exactly one tree or one batch. Maintenance points at exactly one tree, batch, or site. Public codes use the prefixes `FARM`, `LOT`, `DIST`, `GROW`, `WORK`, `HARV`, `SALE`, and `ADV`.
