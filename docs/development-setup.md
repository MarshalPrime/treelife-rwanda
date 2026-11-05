# Development setup

## Tools

- Docker, for PostgreSQL with PostGIS
- Python 3.11
- Node.js 22 or newer
- Git

The API image is `postgis/postgis:16-3.4`. On an Apple Silicon Mac, Docker may run that image with emulation. That is sufficient for local development.

## Database

From the repository root:

```bash
cp .env.example .env
docker compose up -d db
```

`.env.example` is committed. `.env` is not. The copy gives every collaborator the same local database URL, demo passwords, and API address. Python libraries come from `backend/requirements-dev.txt`. Web libraries come from `frontend/package-lock.json` through `npm ci`.

The database listens on `localhost:5433` by default because port `5432` is commonly used by another local PostgreSQL service. User, password, and database name are all `treelife`. This password is only for the local container. Set `POSTGRES_HOST_PORT` in `.env` if you need a different host port; the API container continues to use `db:5432`. When running the API on the host, `DATABASE_URL` must use the matching published host port (for example, `localhost:5433`).

The Compose web service listens on `localhost:3000` by default. If that port is occupied, set `WEB_HOST_PORT` and `CORS_ORIGINS` in `.env` (for example, `WEB_HOST_PORT=3100` and `CORS_ORIGINS=http://localhost:3100`) and use that port in the browser.

## API

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
cd backend
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

`alembic upgrade head` creates the tables and the PostGIS extension. The seed is idempotent. Running it again does not duplicate the demonstration rows.

Open `http://localhost:8000/docs`.

## Web

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The browser calls `http://localhost:8000` unless `NEXT_PUBLIC_API_URL` is set.

The tree and site forms include a map. Current location, a click, a dragged pin, or a place search fills latitude and longitude. The map and the search use OpenStreetMap, so no map key is required. The coordinates can still be typed.

Sign in with `officer@demo.treelife.local` and `demo-officer-pass`, or with `farmer@demo.treelife.local` and `demo-farmer-pass`, after seeding.

## Tests

The API tests need the database container.

Run them against a separate database so the fixture cleanup cannot touch development data:

Create the isolated database once:

```bash
docker compose exec db createdb -U treelife treelife_dashboard_test
```

The test suite refuses to run when the database name does not end in `_test`.

```bash
cd backend
.venv/bin/ruff check .
.venv/bin/ruff format --check .
DATABASE_URL=postgresql+psycopg://treelife:treelife@localhost:5433/treelife_dashboard_test .venv/bin/pytest
```

```bash
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

Smoke test, with the API already running:

```bash
python3 tests/smoke.py
```

## Full stack in Docker

`docker compose up --build` starts the database, applies migrations, seeds demonstration data, and serves the API and web app. Use that when you want one command. Day-to-day development is faster with the database in Docker and the API and web app on the host, because reload is simpler.

## Configuration files

- `.env.example` lists every variable.
- Do not commit `.env`.
- Set `APP_ENV=production` only with a real `SECRET_KEY` and `SEED_DEMO_DATA=false`.
