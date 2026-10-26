# database

PostgreSQL with PostGIS stores the registration records. The schema is created by Alembic from `backend/alembic`, not by a separate SQL file.

- Coordinate reference system: WGS 84, SRID 4326.
- `latitude` and `longitude` are decimal degrees for the API.
- `location` is a PostGIS geography point. Its well-known text order is `POINT(longitude latitude)`.
- The first migration enables the `postgis` extension.

Local development uses the `db` service in `docker-compose.yml`. The development password is `treelife`. Do not reuse it for a shared or production database.
