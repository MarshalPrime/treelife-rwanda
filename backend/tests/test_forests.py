"""A forest stand is saved as one boundary with a calculated area."""

from tests.conftest import auth, make_species


def _boundary():
    return [
        {"longitude": 30.05, "latitude": -1.95},
        {"longitude": 30.07, "latitude": -1.95},
        {"longitude": 30.07, "latitude": -1.93},
        {"longitude": 30.05, "latitude": -1.93},
    ]


def _payload(species_id: str, **overrides):
    body = {
        "name": "SYNTHETIC Test stand",
        "species_id": species_id,
        "estimated_trees": 400,
        "distribution": "clusters",
        "status": "surviving",
        "description": "SYNTHETIC DEMONSTRATION RECORD.",
        "district": "Bugesera",
        "boundary": _boundary(),
        "client_request_id": "forest-request-0001",
    }
    body.update(overrides)
    return body


def test_officer_saves_a_forest_and_the_map_shades_it(client, accounts):
    species = make_species(client, accounts)
    created = client.post(
        "/api/v1/forests",
        json=_payload(species["id"]),
        headers=auth(accounts),
    )
    assert created.status_code == 201, created.text
    forest = created.json()
    assert forest["public_code"].startswith("FOREST-")
    assert forest["area_hectares"] > 100
    assert forest["estimated_trees"] == 400
    assert len(forest["boundary"]) == 4

    replay = client.post(
        "/api/v1/forests",
        json=_payload(species["id"]),
        headers=auth(accounts),
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == forest["id"]

    viewer = client.post(
        "/api/v1/forests",
        json=_payload(species["id"], client_request_id="forest-request-0002"),
        headers=auth(accounts, "viewer"),
    )
    assert viewer.status_code == 403

    listed = client.get("/api/v1/forests?distribution=clusters", headers=auth(accounts, "viewer"))
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    mapped = client.get("/api/v1/map?kind=forest", headers=auth(accounts, "viewer"))
    assert mapped.status_code == 200, mapped.text
    features = mapped.json()["features"]
    assert len(features) == 1
    assert features[0]["geometry"]["type"] == "Polygon"
    assert features[0]["properties"]["estimated_trees"] == 400
    assert features[0]["properties"]["area_hectares"] == forest["area_hectares"]

    updated = client.put(
        f"/api/v1/forests/{forest['id']}",
        json=_payload(
            species["id"],
            name="SYNTHETIC Test stand revised",
            estimated_trees=450,
            distribution="rows",
            status="stressed",
            client_request_id=None,
            boundary=[
                {"longitude": 30.05, "latitude": -1.95},
                {"longitude": 30.09, "latitude": -1.95},
                {"longitude": 30.09, "latitude": -1.93},
                {"longitude": 30.05, "latitude": -1.93},
            ],
        ),
        headers=auth(accounts, "admin"),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "SYNTHETIC Test stand revised"
    assert updated.json()["area_hectares"] > forest["area_hectares"]
    assert updated.json()["distribution"] == "rows"


def test_a_boundary_needs_three_corners(client, accounts):
    species = make_species(
        client, accounts, scientific_name="Grevillea robusta", common_name="Grevillea"
    )
    response = client.post(
        "/api/v1/forests",
        json=_payload(
            species["id"],
            client_request_id="forest-request-short",
            boundary=[
                {"longitude": 30.05, "latitude": -1.95},
                {"longitude": 30.06, "latitude": -1.95},
            ],
        ),
        headers=auth(accounts),
    )
    assert response.status_code == 422
