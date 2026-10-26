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
