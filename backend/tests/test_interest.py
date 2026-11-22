import uuid

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.entities import Farmer
from tests.conftest import auth, make_site, make_species


def test_viewer_interest_stays_separate_from_the_forecast(client, accounts):
    species = make_species(client, accounts, "Mangifera indica", "Mango")
    site = make_site(
        client, accounts, name="SYNTHETIC buyer plot", client_request_id="interest-site"
    )
    assert site.status_code == 201, site.text
    farmer = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Buyer Household",
            "district": "Bugesera",
            "client_request_id": "interest-farmer",
        },
        headers=auth(accounts),
    )
    assert farmer.status_code == 201, farmer.text
    farmer_id = farmer.json()["id"]
    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": species["id"],
            "farmer_id": farmer_id,
            "category": "fruit",
            "planting_date": "2024-01-01",
            "client_request_id": "interest-tree",
        },
        headers=auth(accounts),
    )
    assert tree.status_code == 201, tree.text
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree.json()["id"],
            "harvested_on": "2026-08-01",
            "quantity": 10,
            "unit": "kg",
            "client_request_id": "interest-harvest",
        },
        headers=auth(accounts),
    )
    assert harvest.status_code == 201, harvest.text

    before = client.get("/api/v1/harvests/forecast", headers=auth(accounts, "admin")).json()
    offers = client.get("/api/v1/harvest-offers", headers=auth(accounts, "viewer"))
    assert offers.status_code == 200, offers.text
    offer = next(row for row in offers.json() if row["farmer_name"] == "Buyer Household")
    assert offer["low"] == 10
    assert offer["period"] == "August"
    assert "phone" not in offer

    created = client.post(
        "/api/v1/harvest-interests",
        json={
            "farmer_id": farmer_id,
            "species_id": species["id"],
            "district": offer["district"],
            "quantity": 4,
            "unit": "kg",
            "period": "June to August",
            "notes": "SYNTHETIC request for planning only.",
        },
        headers=auth(accounts, "viewer"),
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending"
    after = client.get("/api/v1/harvests/forecast", headers=auth(accounts, "admin")).json()
    assert after["totals"] == before["totals"]

    blocked = client.post(
        "/api/v1/harvest-interests",
        json={
            "farmer_id": farmer_id,
            "species_id": species["id"],
            "district": offer["district"],
            "quantity": 1,
            "unit": "kg",
            "period": "June",
        },
        headers=auth(accounts),
    )
    assert blocked.status_code == 403, blocked.text

    account = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Interest Farmer",
            "email": "interest-farmer@test.treelife.local",
            "password": "test-password-123",
            "role": "farmer",
            "district": "Bugesera",
        },
    )
    assert account.status_code == 201, account.text
    with SessionLocal() as db:
        account_id = uuid.UUID(account.json()["id"])
        linked = db.scalar(select(Farmer).where(Farmer.user_id == account_id))
        linked.user_id = None
        db.flush()
        row = db.get(Farmer, uuid.UUID(farmer_id))
        row.user_id = account_id
        db.commit()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "interest-farmer@test.treelife.local", "password": "test-password-123"},
    )
    farmer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    visible = client.get("/api/v1/harvest-interests", headers=farmer_headers)
    assert visible.status_code == 200, visible.text
    assert visible.json()[0]["public_code"] == created.json()["public_code"]
    accepted = client.patch(
        f"/api/v1/harvest-interests/{created.json()['id']}",
        json={"status": "accepted", "response_note": "We can talk about August."},
        headers=farmer_headers,
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "accepted"

    officer = client.get("/api/v1/harvest-interests", headers=auth(accounts))
    assert officer.status_code == 200, officer.text
    assert officer.json()[0]["status"] == "accepted"
    outsider = client.patch(
        f"/api/v1/harvest-interests/{created.json()['id']}",
        json={"status": "completed"},
        headers=auth(accounts, "viewer"),
    )
    assert outsider.status_code == 403, outsider.text
