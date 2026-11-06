from tests.conftest import auth, make_species


def test_tree_can_be_registered_without_a_planting_site(client, accounts):
    species = make_species(client, accounts, scientific_name="Mangifera indica", common_name="Mango")
    created = client.post(
        "/api/v1/trees",
        json={
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-04-12",
            "planting_date_approximate": True,
            "planting_method": "transplant",
            "soil_type": "loam",
            "terrain": "gentle",
            "water_availability": "rainfed",
            "spacing": "4 m",
            "fertilizer_applied": "yes",
            "mulching_applied": "no",
            "watering_provided": "unknown",
            "notes": "Planted beside the path.",
            "latitude": -1.9441,
            "longitude": 30.0619,
            "client_request_id": "planting-step-0001",
        },
        headers=auth(accounts),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["site_id"] is None
    assert body["planting_date_approximate"] is True
    assert body["planting_method"] == "transplant"
    assert body["spacing"] == "4 m"
    assert body["notes"] == "Planted beside the path."

    batch = client.post(
        "/api/v1/batches",
        json={
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-04-12",
            "quantity": 5,
            "client_request_id": "planting-step-batch",
        },
        headers=auth(accounts),
    )
    assert batch.status_code == 422
