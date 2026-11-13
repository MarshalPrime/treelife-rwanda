# Architecture

TreeLife Rwanda is a single application. The browser talks to a FastAPI service, which talks to PostgreSQL with PostGIS. There is no separate integration service.

```text
Browser (Next.js)
    |  HTTPS JSON, bearer token
FastAPI
    |  SQLAlchemy / GeoAlchemy2
PostgreSQL + PostGIS
```

The FMES adapter in `backend/app/integrations/fmes` is a reserved seam. Registration does not call it. `dispatch_registration_hook` returns immediately after a local commit.

## Modules

| Path | Responsibility |
| --- | --- |
| `frontend/src/app` | Pages for sign-in, lists, forms, details, and the map |
| `frontend/src/lib` | API client, validation, and labels |
| `backend/app/api` | HTTP routes and status codes |
| `backend/app/domain` | Coordinate, quantity, and date rules |
| `backend/app/services` | Create, update, list, audit, and GeoJSON |
| `backend/app/models` | Relational schema |
| `backend/alembic` | Migrations |

## Authentication

Four roles are stored on the user: `admin`, `field_officer`, `farmer`, and `viewer`. A farmer login can record the same field records as a field officer.

- Every registration endpoint requires a bearer token.
- A viewer can read the map and the trees.
- A field officer or a farmer can create and update field records. An officer names the farmer on a tree or batch. A farmer’s record uses their own household.
- An administrator can read the overview, reports, and the audit log, and cannot create or update field records.
- `POST /auth/register` creates an account and asks for one of the four roles. The seeded demonstration sign-ins remain.

The token is a signed JWT kept in `sessionStorage`. That choice is documented as a prototype limit in [decisions/003-authentication.md](decisions/003-authentication.md).

## Coordinates

The coordinate reference system is WGS 84, SRID 4326.

- Latitude is the north-south value, from -90 to 90.
- Longitude is the east-west value, from -180 to 180.
- A record may omit both. It may not store only one.
- PostGIS stores `geography(POINT, 4326)`. Well-known text is `POINT(longitude latitude)`.
- The map GeoJSON position is `[longitude, latitude]`.
- Points outside an approximate Rwanda extent are accepted. The form shows a warning. The boundary is not a hard rule until domain experts confirm it.

## Identifiers

Each site, tree, batch, and event has a UUID primary key and a public code such as `TREE-2026-A1B2C3`. `external_id` is an optional slot for a future external key. Filling it does not mean a record was sent to FMES.

Creates accept `client_request_id`. Repeating the same id returns the original record instead of inserting another one. See [offline-sync.md](offline-sync.md).

## Map tiles

The map uses OpenStreetMap tiles through Leaflet. The page attributes OpenStreetMap. Tile requests need a network connection. A later deployment should use a tile host that fits the expected traffic.

## Carbon monitoring

An administrator can approve a field officer for carbon measurements. The approval is a row in `carbon_authorizations`, not a fifth role. Only that approved field officer can record a measurement. Each measurement stores its original values and, when the species has a published basic wood specific gravity and a height, the carbon stock from Chave et al. 2014 equation 4. `GET /carbon/overview` sums the latest accepted measurement of each tree. Pending and correction records stay out of that total. The result is an estimate of standing stock, not annual sequestration and not a certified credit.

## What is intentionally absent

Nursery stock, distribution, maintenance work orders, harvest quantities, and sales are not modules yet. The lifecycle event types include `maintenance` and `harvest_observation` so those notes have a place without pretending the later workflows exist.
