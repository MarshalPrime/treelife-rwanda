from tests.conftest import auth, make_site, make_species


def test_tree_biography_follows_planting_care_and_harvest(client, accounts):
    species = make_species(client, accounts, "Mangifera indica", "Mango")
    site = make_site(client, accounts, client_request_id="site-for-biography").json()
    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-02-01",
            "planting_method": "transplant",
            "watering_provided": "yes",
            "client_request_id": "tree-for-biography",
        },
        headers=auth(accounts),
    ).json()
    watering = client.post(
        "/api/v1/maintenance",
        json={
            "tree_id": tree["id"],
            "activity_type": "watering",
            "performed_on": "2026-03-01",
            "notes": "Amount: 20 litres",
            "client_request_id": "bio-water",
        },
        headers=auth(accounts),
    )
    assert watering.status_code == 201, watering.text
    damage = client.post(
        "/api/v1/maintenance",
        json={
            "tree_id": tree["id"],
            "activity_type": "environmental",
            "performed_on": "2026-04-02",
            "notes": "Storm broke one branch.",
            "client_request_id": "bio-storm",
        },
        headers=auth(accounts),
    )
    assert damage.status_code == 201, damage.text
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree["id"],
            "harvested_on": "2026-08-01",
            "quantity": 4,
            "unit": "kg",
            "client_request_id": "bio-harvest",
        },
        headers=auth(accounts),
    )
    assert harvest.status_code == 201, harvest.text

    biography = client.get(f"/api/v1/trees/{tree['id']}/biography", headers=auth(accounts))
    assert biography.status_code == 200, biography.text
    titles = [entry["title"] for entry in biography.json()["entries"]]
    assert titles == ["Planted", "Watering", "Environmental damage", "Harvest"]
    assert "Transplanted from a nursery" in biography.json()["entries"][0]["detail"]
    assert "20 litres" in biography.json()["entries"][1]["detail"]
    assert biography.json()["entries"][0]["recorded_by_name"] == "Test Officer"

    hidden = client.get(f"/api/v1/trees/{tree['id']}/biography", headers=auth(accounts, "viewer"))
    assert hidden.status_code == 200, hidden.text
    assert all(entry["recorded_by_name"] is None for entry in hidden.json()["entries"])

    admin = client.get(f"/api/v1/trees/{tree['id']}/biography", headers=auth(accounts, "admin"))
    assert admin.status_code == 200, admin.text
    assert [entry["title"] for entry in admin.json()["entries"]] == titles
