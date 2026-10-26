# API

Interactive documentation is served at `/docs` when the API is running. All paths below are under `/api/v1`.

The API is not an FMES interface. `external_id` is stored and returned, and nothing is sent onward.

## Authentication

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/login` | Public. JSON email and password. |
| POST | `/auth/token` | Public. Form fields `username` and `password`, for the interactive docs. |
| GET | `/auth/me` | Any signed-in user. |

`GET /health` is public and reports whether PostGIS answers.

Other routes require `Authorization: Bearer <token>`.

- Missing or invalid token: `401`
- Viewer attempting a write, or a non-admin opening `/audit`: `403`
- Unknown id: `404`
- Invalid body: `422` with `detail` and `errors`
- Conflicting scientific name or organization name: `409`

A repeated `client_request_id` returns the original record with `200` and `X-Idempotent-Replay: true`. The first successful create returns `201`.

## Registration

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/organizations` | List or create an organization |
| GET, POST | `/species` | List or add a reference species |
| GET, POST | `/sites` | List or create a planting site |
| GET, PATCH | `/sites/{id}` | Read or update a site |
| GET, POST | `/trees` | List or create an individual tree |
| GET, PATCH | `/trees/{id}` | Read or update a tree |
| GET, POST | `/batches` | List or create a planting batch |
| GET, PATCH | `/batches/{id}` | Read or update a batch |
| GET, POST | `/events` | List or record a lifecycle event |
| GET | `/map` | GeoJSON plus records that have no coordinates |
| GET | `/stats` | Counts for the overview |
| GET | `/audit` | Administrators only |

List routes accept `page` (from 1) and `page_size` (1 to 100, default 20) and return:

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20 }
```

### Filters

Sites: `q`, `status`, `province`, `district`, `organization_id`, `has_coordinates`.

Trees and batches: `q`, `site_id`, `species_id`, `category`, `status`, `has_coordinates`.

Events: `tree_id`, `batch_id`, `site_id`.

Map: `kind` (`site`, `tree`, `batch`, or `all`), `species_id`, `category`, `status`, `q`.

A species or category filter applies to trees and batches. Sites are omitted from that map response because a site does not have one species.

### Map body

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [30.06, -1.95] },
      "properties": {
        "id": "uuid",
        "kind": "tree",
        "public_code": "TREE-2026-ABC123",
        "title": "TREE-2026-ABC123 · Avocado",
        "subtitle": "SYNTHETIC Fruit orchard — demo B",
        "status": "surviving",
        "category": "fruit",
        "data_origin": "synthetic_demo"
      }
    }
  ],
  "unlocated": [
    {
      "id": "uuid",
      "kind": "site",
      "public_code": "SITE-2026-ABC123",
      "title": "SYNTHETIC Roadside row — demo C",
      "reason": "No coordinates recorded"
    }
  ],
  "truncated": false
}
```

The coordinate order in GeoJSON is longitude, then latitude. The response also includes separate latitude and longitude fields on the registration resources.

Updates cannot change the public code, the registrar, the data origin, or the client request id. Sending both coordinates as `null` clears the point.

An individual tree response includes `"quantity": 1`. That value is not stored as an editable quantity.
