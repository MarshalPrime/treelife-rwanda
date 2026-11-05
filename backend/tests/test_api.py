from datetime import date, timedelta

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal
from tests.conftest import auth, make_site, make_species


def test_health_reports_postgis(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["postgis"]


def test_login_and_me(client, accounts):
    response = client.get("/api/v1/auth/me", headers=auth(accounts, "viewer"))
    assert response.status_code == 200
    assert response.json()["role"] == "viewer"
    form = client.post(
        "/api/v1/auth/token",
        data={"username": accounts["admin"]["email"], "password": accounts["admin"]["password"]},
    )
    assert form.status_code == 200
    assert form.json()["role"] == "admin"


def test_rejects_unknown_and_inactive_users(client, accounts):
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@test.treelife.local", "password": "test-password-123"},
    )
    assert bad.status_code == 401
    inactive = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@test.treelife.local", "password": accounts["inactive_password"]},
    )
    assert inactive.status_code == 401


def test_viewer_cannot_create_and_anonymous_cannot_read(client, accounts):
    denied = client.post(
        "/api/v1/sites",
        json={"name": "Blocked", "site_type": "farm"},
        headers=auth(accounts, "viewer"),
    )
    assert denied.status_code == 403
    anonymous = client.get("/api/v1/sites")
    assert anonymous.status_code == 401


def test_site_tree_and_batch_registration_round_trip(client, accounts):
    species = make_species(client, accounts)
    site_response = make_site(client, accounts)
    assert site_response.status_code == 201, site_response.text
    site = site_response.json()
    assert site["public_code"].startswith("SITE-")
    assert site["has_coordinates"] is True
    assert site["registered_by_name"] == "Test Officer"
    with SessionLocal() as db:
        row = db.execute(
            text(
                "SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon "
                "FROM planting_sites WHERE id = :id"
            ),
            {"id": site["id"]},
        ).one()
    assert row.lat == pytest.approx(-1.2345)
    assert row.lon == pytest.approx(30.6789)

    tree_response = client.post(
        "/api/v1/trees",
        json={
            "site_id": site["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-01",
            "latitude": -1.2346,
            "longitude": 30.679,
            "client_request_id": "tree-request-0001",
        },
        headers=auth(accounts),
    )
    assert tree_response.status_code == 201, tree_response.text
    tree = tree_response.json()
    assert tree["quantity"] == 1
    assert tree["public_code"].startswith("TREE-")
    assert tree["species_common_name"] == "Avocado"

    batch_response = client.post(
        "/api/v1/batches",
        json={
            "site_id": site["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-02-02",
            "quantity": 25,
            "client_request_id": "batch-request-0001",
        },
        headers=auth(accounts),
    )
    assert batch_response.status_code == 201, batch_response.text
    batch = batch_response.json()
    assert batch["quantity"] == 25
    assert batch["has_coordinates"] is False
    assert batch["public_code"].startswith("BATCH-")

    fetched = client.get(f"/api/v1/trees/{tree['id']}", headers=auth(accounts, "viewer"))
    assert fetched.status_code == 200
    missing = client.get(
        "/api/v1/trees/00000000-0000-0000-0000-000000000000",
        headers=auth(accounts),
    )
    assert missing.status_code == 404

    updated = client.patch(
        f"/api/v1/trees/{tree['id']}",
        json={"notes": "Replaced the stake.", "status": "stressed"},
        headers=auth(accounts),
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Replaced the stake."
    assert updated.json()["status"] == "stressed"

    listed = client.get("/api/v1/trees?q=Avocado", headers=auth(accounts))
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


def test_validation_and_idempotency(client, accounts):
    species = make_species(client, accounts, "Mangifera indica", "Mango")
    invalid = make_site(
        client, accounts, latitude=120, longitude=30, client_request_id="site-bad-lat"
    )
    assert invalid.status_code == 422
    assert any("Latitude" in error["message"] for error in invalid.json()["errors"])

    half = make_site(client, accounts, latitude=-1.5, longitude=None, client_request_id="site-half")
    assert half.status_code == 422

    blank = make_site(client, accounts, name="   ", client_request_id="site-blank")
    assert blank.status_code == 422

    outside = make_site(
        client,
        accounts,
        name="Outside Rwanda",
        latitude=0.31,
        longitude=32.58,
        client_request_id="site-outside-rwanda",
    )
    assert outside.status_code == 201

    first = make_site(client, accounts, name="Original site", client_request_id="site-same-key")
    assert first.status_code == 201
    replay = make_site(client, accounts, name="Different site", client_request_id="site-same-key")
    assert replay.status_code == 200
    assert replay.headers["X-Idempotent-Replay"] == "true"
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["name"] == "Original site"

    site_id = first.json()["id"]
    future = client.post(
        "/api/v1/trees",
        json={
            "site_id": site_id,
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": str(date.today() + timedelta(days=10)),
        },
        headers=auth(accounts),
    )
    assert future.status_code == 422

    zero = client.post(
        "/api/v1/batches",
        json={
            "site_id": site_id,
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-01",
            "quantity": 0,
        },
        headers=auth(accounts),
    )
    assert zero.status_code == 422

    unknown_site = client.post(
        "/api/v1/trees",
        json={
            "site_id": "00000000-0000-0000-0000-000000000000",
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-01",
        },
        headers=auth(accounts),
    )
    assert unknown_site.status_code == 422


def test_pagination_filter_and_audit(client, accounts):
    for index in range(3):
        response = make_site(
            client,
            accounts,
            name=f"Plot {index}",
            district="Gasabo" if index == 0 else "Huye",
            latitude=None,
            longitude=None,
            client_request_id=f"site-page-{index}",
        )
        assert response.status_code == 201, response.text
    page = client.get("/api/v1/sites?page=1&page_size=2", headers=auth(accounts))
    body = page.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    filtered = client.get("/api/v1/sites?district=Gasabo", headers=auth(accounts, "viewer"))
    assert filtered.json()["total"] == 1
    missing_coordinates = client.get("/api/v1/sites?has_coordinates=false", headers=auth(accounts))
    assert missing_coordinates.json()["total"] == 3

    audit_forbidden = client.get("/api/v1/audit", headers=auth(accounts))
    assert audit_forbidden.status_code == 403
    audit = client.get("/api/v1/audit", headers=auth(accounts, "admin"))
    assert audit.status_code == 200
    assert audit.json()["total"] >= 3


def test_map_all_keeps_all_site_districts(client, accounts):
    species = make_species(client, accounts, "Mangifera indica", "Mango")
    huye = make_site(
        client,
        accounts,
        name="Huye orchard",
        district="Huye",
        latitude=-2.60,
        longitude=29.74,
        client_request_id="map-district-huye",
    ).json()
    gasabo = make_site(
        client,
        accounts,
        name="Gasabo orchard",
        district="Gasabo",
        latitude=-1.90,
        longitude=30.10,
        client_request_id="map-district-gasabo",
    ).json()
    for site, suffix, latitude, longitude in (
        (huye, "huye", -2.60, 29.74),
        (gasabo, "gasabo", -1.90, 30.10),
    ):
        tree = client.post(
            "/api/v1/trees",
            json={
                "site_id": site["id"],
                "species_id": species["id"],
                "category": "fruit",
                "planting_date": "2026-02-01",
                "latitude": latitude,
                "longitude": longitude,
                "client_request_id": f"map-district-tree-{suffix}",
            },
            headers=auth(accounts),
        )
        assert tree.status_code == 201, tree.text

    response = client.get("/api/v1/map", headers=auth(accounts))
    assert response.status_code == 200, response.text
    titles = {feature["properties"]["title"] for feature in response.json()["features"]}
    assert "Huye orchard" in titles
    assert "Gasabo orchard" in titles
    assert sum("Mango" in title for title in titles) == 2


def test_inspection_updates_status_and_map(client, accounts):
    species = make_species(client, accounts, "Carica papaya", "Papaya")
    site = make_site(client, accounts, client_request_id="site-for-event").json()
    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-15",
            "latitude": -1.5,
            "longitude": 30.1,
        },
        headers=auth(accounts),
    ).json()
    batch = client.post(
        "/api/v1/batches",
        json={
            "site_id": site["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-15",
            "quantity": 10,
        },
        headers=auth(accounts),
    ).json()
    event = client.post(
        "/api/v1/events",
        json={
            "tree_id": tree["id"],
            "event_type": "inspection",
            "event_date": "2026-09-01",
            "status_after": "surviving",
            "notes": "Leaves present.",
            "client_request_id": "event-request-0001",
        },
        headers=auth(accounts),
    )
    assert event.status_code == 201, event.text
    assert event.json()["public_code"].startswith("EVT-")
    refreshed = client.get(f"/api/v1/trees/{tree['id']}", headers=auth(accounts))
    assert refreshed.json()["status"] == "surviving"
    replay = client.post(
        "/api/v1/events",
        json={
            "tree_id": tree["id"],
            "event_type": "inspection",
            "event_date": "2026-09-01",
            "status_after": "dead",
            "client_request_id": "event-request-0001",
        },
        headers=auth(accounts),
    )
    assert replay.status_code == 200
    assert (
        client.get(f"/api/v1/trees/{tree['id']}", headers=auth(accounts)).json()["status"]
        == "surviving"
    )

    too_many = client.post(
        "/api/v1/events",
        json={
            "batch_id": batch["id"],
            "event_type": "survival_check",
            "event_date": "2026-09-02",
            "survival_count": 11,
        },
        headers=auth(accounts),
    )
    assert too_many.status_code == 422

    both_targets = client.post(
        "/api/v1/events",
        json={
            "tree_id": tree["id"],
            "batch_id": batch["id"],
            "event_type": "inspection",
            "event_date": "2026-09-02",
        },
        headers=auth(accounts),
    )
    assert both_targets.status_code == 422

    mapped = client.get("/api/v1/map", headers=auth(accounts))
    assert mapped.status_code == 200
    body = mapped.json()
    tree_features = [
        feature for feature in body["features"] if feature["properties"]["kind"] == "tree"
    ]
    assert tree_features
    assert tree_features[0]["geometry"]["coordinates"] == pytest.approx([30.1, -1.5])
    assert any(item["kind"] == "batch" for item in body["unlocated"])

    filtered = client.get(
        f"/api/v1/map?species_id={species['id']}&category=fruit", headers=auth(accounts)
    )
    assert filtered.status_code == 200
    assert all(feature["properties"]["kind"] != "site" for feature in filtered.json()["features"])
    stats = client.get("/api/v1/stats", headers=auth(accounts, "viewer"))
    assert stats.status_code == 200
    assert stats.json()["trees"] == 1
    assert stats.json()["records_missing_coordinates"] >= 1
