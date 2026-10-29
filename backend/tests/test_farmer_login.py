from app.services.valuechain import farmer_badges
from tests.conftest import auth, make_species


def test_smallholder_can_record_a_tree(client, accounts):
    officer = auth(accounts)
    farmer = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "SYNTHETIC Household Login",
            "client_request_id": "farmer-login-0001",
        },
        headers=officer,
    )
    assert farmer.status_code == 201, farmer.text
    farmer_id = farmer.json()["id"]

    denied = client.post(
        f"/api/v1/farmers/{farmer_id}/login",
        json={"email": "household@test.treelife.local", "password": "household-pass"},
        headers=auth(accounts, "viewer"),
    )
    assert denied.status_code == 403

    opened = client.post(
        f"/api/v1/farmers/{farmer_id}/login",
        json={"email": "household@test.treelife.local", "password": "household-pass"},
        headers=officer,
    )
    assert opened.status_code == 201, opened.text
    assert opened.json()["role"] == "farmer"
    assert opened.json()["farmer_id"] == farmer_id

    again = client.post(
        f"/api/v1/farmers/{farmer_id}/login",
        json={"email": "other@test.treelife.local", "password": "household-pass"},
        headers=officer,
    )
    assert again.status_code == 409

    signed_in = client.post(
        "/api/v1/auth/login",
        json={"email": "household@test.treelife.local", "password": "household-pass"},
    )
    assert signed_in.status_code == 200
    headers = {"Authorization": f"Bearer {signed_in.json()['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["role"] == "farmer"
    assert me.json()["farmer_id"] == farmer_id

    species = make_species(client, accounts, scientific_name="Citrus limon", common_name="Lemon")
    site = client.post(
        "/api/v1/sites",
        json={
            "name": "Household plot",
            "site_type": "orchard",
            "latitude": -1.95,
            "longitude": 30.06,
            "client_request_id": "farmer-site-0001",
        },
        headers=headers,
    )
    assert site.status_code == 201, site.text
    assert site.json()["farmer_id"] == farmer_id

    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-10-01",
            "client_request_id": "farmer-tree-0001",
        },
        headers=headers,
    )
    assert tree.status_code == 201, tree.text
    assert tree.json()["quantity"] == 1

    overview = client.get("/api/v1/overview/mine", headers=headers)
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["linked"] is True
    assert body["farmer_name"] == "SYNTHETIC Household Login"
    assert body["sites"] == 1
    assert body["trees"] == 1
    assert body["recorded_trees"] == 1
    assert body["species_counts"] == [{"species_common_name": "Lemon", "trees": 1}]
    assert body["plantings"][0]["species_common_name"] == "Lemon"
    assert body["metal"] == "bronze"
    assert body["district"] is None
    blocked = client.get("/api/v1/overview/mine", headers=officer)
    assert blocked.status_code == 403


def test_badge_steps():
    bronze = farmer_badges(1, 1, 1, False)
    assert bronze[0].sentence == "19 more trees move this to silver."
    silver = farmer_badges(20, 2, 1, False)
    assert silver[0].key == "silver"
    assert silver[0].sentence == "30 more trees move this to gold."
    assert silver[1].earned is True
    assert silver[2].earned is False
    edge = farmer_badges(49, 2, 2, True)
    assert edge[0].sentence == "1 more tree moves this to gold."
    assert edge[2].earned is True
    assert edge[3].earned is True
    gold = farmer_badges(56, 3, 1, True)
    assert [badge.key for badge in gold] == [
        "gold",
        "several_species",
        "several_places",
        "follow_through",
    ]
    assert [badge.earned for badge in gold] == [True, True, False, True]
    assert gold[0].sentence == "Fifty trees are recorded."
    assert farmer_badges(0, 0, 0, False)[0].earned is False
