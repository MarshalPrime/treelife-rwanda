# Stack

The workspace contained only a README and a Git repository, so the preferred stack was adopted without replacing an existing application.

- Next.js and TypeScript for the interface
- FastAPI, Pydantic, and SQLAlchemy 2 for the API
- Alembic for migrations
- PostgreSQL and PostGIS for storage
- Leaflet and OpenStreetMap tiles for the map
- Docker Compose for the local database
- pytest, Vitest, Ruff, and GitHub Actions for checks

The web and API run as two processes in development. They are not split into microservices. GeoAlchemy2 talks to PostGIS. Tests run against that database rather than a SQLite substitute, because the geography type and axis order are part of the contract.

One deviation from a fully packaged production stack: offline synchronization is documented and only partly implemented. See [006-offline.md](006-offline.md).
