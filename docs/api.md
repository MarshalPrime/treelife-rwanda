# API

Interactive documentation is served at `/docs` when the API is running. All paths below are under `/api/v1`.

The API is not an FMES interface. `external_id` is stored and returned, and nothing is sent onward.

## Authentication

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register` | Public. Name, email, password, and role (`admin`, `field_officer`, `farmer`, or `viewer`). Optional organisation, and for a farmer an optional district and phone. A farmer account also creates the linked farmer record. Duplicate email returns 409. |
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

Map: `kind` (`site`, `tree`, `batch`, or `all`), `species_id`, `category`, `status`, `q`, `district`, `farmer_id`.

`district` and `farmer_id` keep sites that match, and trees or batches whose site matches.

## Value chain

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/farmers` | List or create a farmer |
| POST | `/farmers/{id}/login` | Field officer opens a smallholder login |
| GET, POST | `/seedling-lots` | List or record nursery production |
| GET, POST | `/distributions` | List or move seedlings to a site |
| GET, POST | `/growth` | List or record a height, diameter, or survival count |
| GET, POST | `/maintenance` | List or record pruning, watering, mulching, pest control, or staking |
| GET, POST | `/harvests` | List or record fruit in kilograms or as a count |
| GET, POST | `/sales` | List or record a sale in Rwandan francs |
| GET, POST | `/advisories` | List or write an advice note |
| GET | `/analytics` | Counts for the chain, including harvest by species and sites by district |

These list routes return an array, not a page. Creates follow the same request-id rule as registration. A distribution larger than the remaining lot, or a sale larger than the remaining harvest, is rejected with `422`.

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

## Carbon monitoring

Carbon monitoring is a permission on an existing field officer, not a new role. `GET /auth/me` includes `carbon_monitoring` for a field officer: `not_requested`, `pending`, `approved`, `rejected`, or `revoked`.

| Method | Path | Who |
| --- | --- | --- |
| GET, POST | `/carbon/authorization` | Field officer. Read status or submit experience, training, and qualifications. |
| POST | `/carbon/authorization/{id}/documents` | The officer, while the request is pending. JPEG, PNG, WebP, or PDF. |
| GET | `/carbon/documents/{id}` | The officer who owns it, or an administrator. |
| GET | `/carbon/authorizations` | Administrator. All requests. |
| GET | `/carbon/authorizations/{id}` | Administrator. Profile details, evidence, and history. |
| POST | `/carbon/authorizations/{id}/decision` | Administrator. `approve`, `reject`, or `revoke`. Reject and revoke require `reason`. |
| GET | `/carbon/overview` | Administrator or viewer. Project stock in tCO₂e from the latest accepted measurement of each tree, plus distinct trees, species, agents, and pending or correction counts. |
| GET | `/carbon/measurements` | Approved field officer, for their own records, or an administrator. |
| POST | `/carbon/measurements` | Approved field officer. |
| GET | `/carbon/measurements/{id}` | The officer who collected it, or an administrator. |
| PUT | `/carbon/measurements/{id}` | The officer who collected it. An edit stores a new estimate and returns the record to pending review. |
| POST | `/carbon/measurements/{id}/review` | Administrator. `accept` or `correction`. Correction requires `reason`. |
| POST | `/carbon/measurements/{id}/photo` | The officer who collected it. |
| GET | `/carbon/measurements/{id}/photo` | The officer who collected it, or an administrator. |

A measurement stores who collected it, the time, the review status, and earlier versions after an edit. `estimate` is stored when the species has a published basic wood specific gravity and a height. It is labelled `Estimate`, names the methodology and version, and is not a certified carbon credit. A species without that parameter is saved with `estimate` null and an `estimate_note`. Only accepted measurements enter the overview total, and a later accepted visit replaces the earlier stock for the same tree.

Updates cannot change the public code, the registrar, the data origin, or the client request id. Sending both coordinates as `null` clears the point.

An individual tree response includes `"quantity": 1`. That value is not stored as an editable quantity.
