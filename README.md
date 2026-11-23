# TreeLife Rwanda

TreeLife Rwanda is an Ejo Labs Solution for following urban and fruit trees from the nursery to a sale. It records planting sites, individual trees, planting batches, farmers, seedling lots, distribution, growth, maintenance, harvests, sales, and short advice notes, and it shows located records on a map.

The Government of Rwanda already operates the Forestry Management and Evaluation System (FMES) through the Rwanda Forestry Authority. TreeLife is being built to complement that system for urban and fruit-tree lifecycles. It does not replace FMES, and this repository is not connected to it.

## Problem

Tree planting, survival, and fruit production are still difficult to follow from nursery to harvest when records are scattered across paper notes, spreadsheets, and systems that were not designed around an individual urban or fruit tree. Field teams need a simple way to register a place, register either one tree or a batch, and return later for inspection.

## Objectives

- Give field officers and administrators a working registration workflow.
- Keep a site, an individual tree, and a planting batch as separate records.
- Store coordinates in WGS 84 and show them on a map.
- Leave a clean boundary for a future, authorized FMES integration.
- Prepare a pilot package without claiming that a field pilot has already happened.

## What this version does

A signed-in user can:

- register and edit a planting site, and link it to a farmer
- register and edit one tree, or a batch with a quantity
- search, filter, and page through records
- record an inspection or other lifecycle event
- record nursery production, seedling distribution, growth, maintenance, harvest, sales, and advice
- let a field officer request carbon monitoring authorization, and let an administrator approve, reject, or revoke it. An approved officer records a tree measurement, and TreeLife stores that tree's estimated carbon stock when a published wood specific gravity exists for the species. Administrators and viewers see the project total from accepted measurements. The figure is an estimate of standing stock, not annual sequestration and not a certified credit
- see counts for that chain on the analytics page
- see a live standing-tree count on the administrator overview. The count updates when a tree or batch is recorded, and the overview can be filtered by period, district, and species. Field officers, farmers, and viewers see the same overview for the records in their scope
- see located records on a map, filter them by district or farmer, and see which records have no coordinates
- keep a failed create on the device and send it again when the connection returns

Anyone can create a field officer, farmer, or viewer account. Administrator accounts are provisioned by an existing administrator and are not available through public sign-up. An administrator sees the overview, reports, and the audit log, and does not register trees. A field officer registers sites, trees, and batches, and names the farmer they are helping. A farmer registers for their own household, and the record uses their name. A viewer can see the map and the trees, and cannot change them. A field officer can still open a login for an existing farmer from the Farmers page.

## Architecture

The application is one web application and one API, backed by PostgreSQL with PostGIS.

- `frontend/` — Next.js, React, and TypeScript. Leaflet draws the map.
- `backend/` — FastAPI, Pydantic, and SQLAlchemy. Alembic owns the schema.
- `database/` — notes on PostGIS. Migrations live in `backend/alembic`.

Coordinates are decimal degrees in WGS 84 (SRID 4326). The API stores latitude and longitude, and a geography point whose axis order is longitude then latitude.

See [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), and [docs/api.md](docs/api.md).

## Setup

Requirements: Docker, Python 3.11, and Node.js 22 or newer. A local setup that was exercised for this repository used Python 3.11.0 and Node 25.

```bash
cp .env.example .env
docker compose up -d db
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

`.env.example` is the shared environment file. Copy it to `.env` on each machine. Do not commit `.env`. `backend/requirements-dev.txt` installs the API, including `backend/requirements.txt`. `frontend/package-lock.json` pins the web libraries.

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The API documentation is at `http://localhost:8000/docs`.

`python -m app.seed` loads labelled synthetic species, organizations, users, sites, trees, batches, and one nursery-to-sale chain. It refuses to run when `APP_ENV=production`.

The Compose database is published on `localhost:5433` by default so it does not collide with another PostgreSQL service already using `5432`. To use another host port, change both `POSTGRES_HOST_PORT` and the port in `DATABASE_URL` in `.env`. Services inside Compose still connect to `db:5432`.

The web service is published on `localhost:3000` by default. If another local process uses that port, set `WEB_HOST_PORT` and `CORS_ORIGINS` in `.env` (for example, `WEB_HOST_PORT=3100` and `CORS_ORIGINS=http://localhost:3100`) and open that port instead.

More detail is in [docs/development-setup.md](docs/development-setup.md).

## Configuration

Copy `.env.example` to `.env` if you need to override the defaults. The checked-in defaults are for a local database only.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` or `production` |
| `SECRET_KEY` | Signs access tokens. Production must use a unique value of at least 32 characters. |
| `DATABASE_URL` | SQLAlchemy URL for PostgreSQL |
| `POSTGRES_HOST_PORT` | Host port published for the local PostGIS container (default `5433`) |
| `CORS_ORIGINS` | Allowed browser origins |
| `SEED_DEMO_DATA` | When `true`, the API container loads synthetic records |
| `NEXT_PUBLIC_API_URL` | API origin used by the browser |

Development sign-in, after seeding:

| Email | Role | Password |
| --- | --- | --- |
| `admin@demo.treelife.local` | Administrator | `demo-admin-pass1` |
| `officer@demo.treelife.local` | Field officer | `demo-officer-pass1` |
| `viewer@demo.treelife.local` | Viewer | `demo-viewer-pass1` |
| `farmer@demo.treelife.local` | Smallholder farmer | `demo-farmer-pass1` |

These are demonstration accounts. The `.local` suffix is intentional so they are not deliverable mailboxes. Change the passwords before any shared deployment, and do not enable the seed outside local development.

## Testing

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest
cd frontend && npm test && npm run typecheck && npm run lint && npm run build
```

With the API running and the seed loaded:

```bash
python3 tests/smoke.py
```

GitHub Actions runs the same backend and frontend checks. See [docs/STATUS.md](docs/STATUS.md) for the latest local results.

## Demonstration

Use [docs/demo-script.md](docs/demo-script.md). Every seeded record is marked synthetic. Do not describe those points as surveyed trees.

## Roadmap

1. Confirm the registration fields with foresters, cooperatives, and urban greening teams.
2. Add Kinyarwanda and French.
3. Extend the device queue to edits, and detect conflicts when two officers change one record.
4. Agree an FMES exchange with the responsible authority before any adapter sends data. See [docs/fmes-integration.md](docs/fmes-integration.md). The adapter still does not send anything.

The pilot package is [docs/pilot-plan.md](docs/pilot-plan.md). No pilot partner has been selected, and no field results are claimed.

## Current limitations

- FMES is not integrated. No official endpoint, credential, or data dictionary is included.
- The device queue covers failed creates only. It needs the same signed-in browser session, and it does not reconcile conflicting edits.
- The interface is English only.
- Authentication is a bearer token kept in `sessionStorage`. A shared deployment should move that to a hardened cookie session.
- Map tiles come from OpenStreetMap and need a network connection. A production deployment needs a tile arrangement that respects the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- Records are not deleted. Set a site inactive, or a tree to removed, instead.
- This repository has not been deployed, and it has not been used with real farmer or farm data.

## License

The application code is released under the MIT License. The decision is recorded in [docs/decisions/001-license.md](docs/decisions/001-license.md). Leaflet is BSD-2-Clause. OpenStreetMap data and tiles have their own terms and must be attributed, which the map does.

## Security

Do not commit `.env`, real coordinates, or production database dumps. Report vulnerabilities through GitHub private vulnerability reporting for this repository. See [SECURITY.md](SECURITY.md).
