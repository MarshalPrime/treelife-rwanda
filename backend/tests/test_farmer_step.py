from tests.conftest import auth, make_species


def test_new_farmer_keeps_one_record_and_its_address(client, accounts):
    headers = auth(accounts)
    created = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Aline",
            "phone": "0788 111 222",
            "province": "Southern Province",
            "district": "Huye",
            "sector": "Ngoma",
            "cell": "Ngoma",
            "village": "Butare",
            "isibo": "Isibo 3",
            "household": "Household 12",
            "client_request_id": "farmer-step-0001",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["province"] == "Southern Province"
    assert body["isibo"] == "Isibo 3"
    assert body["registered_by"] == accounts["field_officer"]["id"]

    duplicate = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Someone else",
            "phone": "0788111222",
            "client_request_id": "farmer-step-0002",
        },
        headers=headers,
    )
    assert duplicate.status_code == 422
    assert duplicate.json()["errors"][0]["field"] == "phone"

    updated = client.patch(
        f"/api/v1/farmers/{body['id']}",
        json={"display_name": "Aline M.", "household": "Household 4"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["id"] == body["id"]
    assert updated.json()["display_name"] == "Aline M."
    assert updated.json()["phone"] == "0788 111 222"
    assert updated.json()["household"] == "Household 4"

    listed = client.get("/api/v1/farmers", headers=headers)
    matches = [item for item in listed.json() if item["id"] == body["id"]]
    assert len(matches) == 1
    assert matches[0]["tree_count"] == 0
    assert matches[0]["trees"] == []


def test_officer_sees_trees_recorded_with_their_farmer(client, accounts):
    headers = auth(accounts)
    farmer = client.post(
        "/api/v1/farmers",
        json={"display_name": "Farmer", "client_request_id": "farmer-trees-0001"},
        headers=headers,
    )
    assert farmer.status_code == 201, farmer.text
    species = make_species(
        client, accounts, scientific_name="Persea americana", common_name="Avocado"
    )
    tree = client.post(
        "/api/v1/trees",
        json={
            "species_id": species["id"],
            "category": "fruit",
            "farmer_id": farmer.json()["id"],
            "planting_date": "2026-05-02",
            "planting_method": "ground",
            "client_request_id": "farmer-trees-0002",
        },
        headers=headers,
    )
    assert tree.status_code == 201, tree.text
    listed = client.get("/api/v1/farmers", headers=headers)
    match = next(item for item in listed.json() if item["id"] == farmer.json()["id"])
    assert match["tree_count"] == 1
    assert match["trees"][0]["species_common_name"] == "Avocado"
    assert match["trees"][0]["planting_date"] == "2026-05-02"
