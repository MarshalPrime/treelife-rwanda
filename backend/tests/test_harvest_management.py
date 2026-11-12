from tests.conftest import auth, make_site, make_species


def test_harvest_destinations_add_up_and_flag_attention(client, accounts):
    species = make_species(
        client, accounts, scientific_name="Mangifera indica", common_name="Mango"
    )
    site = make_site(
        client, accounts, name="SYNTHETIC harvest plot", client_request_id="harvest-site-0001"
    )
    assert site.status_code == 201, site.text
    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-01",
            "client_request_id": "harvest-tree-0001",
        },
        headers=auth(accounts),
    )
    assert tree.status_code == 201, tree.text
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree.json()["id"],
            "harvested_on": "2026-08-01",
            "quantity": 4,
            "unit": "kg",
            "client_request_id": "harvest-record-0001",
        },
        headers=auth(accounts),
    )
    assert harvest.status_code == 201, harvest.text
    harvest_id = harvest.json()["id"]
    sold = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest_id,
            "sold_on": "2026-08-02",
            "quantity": 1,
            "purpose": "sold",
            "amount_rwf": 1500,
            "buyer_name": "SYNTHETIC Market",
            "client_request_id": "dest-sold-0001",
        },
        headers=auth(accounts),
    )
    assert sold.status_code == 201, sold.text
    stored = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest_id,
            "sold_on": "2026-08-02",
            "quantity": 1,
            "purpose": "stored",
            "client_request_id": "dest-stored-0001",
        },
        headers=auth(accounts),
    )
    assert stored.status_code == 201, stored.text
    assert stored.json()["amount_rwf"] == 0
    duplicate = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest_id,
            "sold_on": "2026-08-02",
            "quantity": 1,
            "purpose": "stored",
            "client_request_id": "dest-stored-0002",
        },
        headers=auth(accounts),
    )
    assert duplicate.status_code == 409, duplicate.text

    overview = client.get("/api/v1/harvests/overview", headers=auth(accounts))
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["harvested_kg"] == 4
    assert body["sold_kg"] == 1
    assert body["sales_rwf"] == 1500
    assert body["stored_kg"] == 1
    assert body["unassigned_kg"] == 2
    assert body["shares"][0]["balanced"] is True
    assert body["shares"][0]["recorded_by"] == "Test Officer"
    assert any(
        item["kind"] == "destination" and item["purpose"] == "stored" for item in body["history"]
    )

    created = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "SYNTHETIC Farmer",
            "email": "harvest-farmer@scope.treelife.local",
            "password": "harvest-pass1",
            "role": "farmer",
        },
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "harvest-farmer@scope.treelife.local", "password": "harvest-pass1"},
    )
    farmer = {"Authorization": f"Bearer {login.json()['access_token']}"}
    blocked = client.post(
        "/api/v1/harvest-feedback",
        json={
            "kind": "observation",
            "body": "This role cannot file a visit note.",
            "client_request_id": "feedback-wrong-role",
        },
        headers=farmer,
    )
    assert blocked.status_code == 422, blocked.text
    loss = client.post(
        "/api/v1/harvest-feedback",
        json={
            "harvest_id": harvest_id,
            "kind": "loss",
            "body": "SYNTHETIC fruit spoiled after rain.",
            "loss_quantity": 2,
            "loss_unit": "kg",
            "client_request_id": "feedback-loss-0001",
        },
        headers=farmer,
    )
    assert loss.status_code == 201, loss.text
    assert client.get("/api/v1/harvest-notices", headers=farmer).status_code == 403
    hidden = client.post(
        "/api/v1/harvest-feedback",
        json={
            "kind": "suggestion",
            "body": "Officers record recommendations, not this type.",
            "client_request_id": "feedback-officer-wrong",
        },
        headers=auth(accounts),
    )
    assert hidden.status_code == 422, hidden.text
    checked = client.post(
        "/api/v1/harvest-feedback",
        json={
            "harvest_id": harvest_id,
            "kind": "verification",
            "body": "The recorded harvest is higher than the fruit I saw.",
            "verified_quantity": 0,
            "client_request_id": "feedback-check-0001",
        },
        headers=auth(accounts),
    )
    assert checked.status_code == 201, checked.text

    jump = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree.json()["id"],
            "harvested_on": "2026-09-01",
            "quantity": 12,
            "unit": "kg",
            "client_request_id": "harvest-record-0002",
        },
        headers=auth(accounts),
    )
    assert jump.status_code == 201, jump.text
    notices = client.get("/api/v1/harvest-notices", headers=auth(accounts, "admin"))
    assert notices.status_code == 200, notices.text
    kinds = {row["kind"] for row in notices.json()}
    assert {"loss", "mismatch", "unusual"} <= kinds
    later = client.get("/api/v1/harvests/overview", headers=auth(accounts)).json()
    assert (
        later["sold_kg"]
        + later["personal_kg"]
        + later["stored_kg"]
        + later["given_kg"]
        + later["other_kg"]
        + later["unassigned_kg"]
        == later["harvested_kg"]
    )
