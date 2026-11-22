import uuid

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.entities import Farmer
from tests.conftest import auth, make_site, make_species


def _tree(client, accounts, site_id, species_id, request_id, planting_date, farmer_id=None):
    payload = {
        "site_id": site_id,
        "species_id": species_id,
        "category": "fruit",
        "planting_date": planting_date,
        "client_request_id": request_id,
    }
    if farmer_id is not None:
        payload["farmer_id"] = farmer_id
    response = client.post("/api/v1/trees", json=payload, headers=auth(accounts))
    assert response.status_code == 201, response.text
    return response.json()


def _harvest(client, accounts, tree_id, request_id, quantity, harvested_on="2026-08-01"):
    response = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree_id,
            "harvested_on": harvested_on,
            "quantity": quantity,
            "unit": "kg",
            "client_request_id": request_id,
        },
        headers=auth(accounts),
    )
    assert response.status_code == 201, response.text


def test_forecast_uses_age_reference_and_recorded_harvests(client, accounts):
    mango = make_species(client, accounts, "Mangifera indica", "Mango")
    papaya = make_species(client, accounts, "Carica papaya", "Papaya")
    other = make_species(client, accounts, "Annona muricata", "Soursop")
    marked = client.patch(
        f"/api/v1/species/{other['id']}",
        json={"harvest_potential": True},
        headers=auth(accounts, "admin"),
    )
    assert marked.status_code == 200, marked.text
    site = make_site(
        client, accounts, name="SYNTHETIC forecast plot", client_request_id="forecast-site"
    )
    assert site.status_code == 201, site.text
    site_id = site.json()["id"]
    farmer = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Forecast Household",
            "district": "Bugesera",
            "client_request_id": "forecast-farmer",
        },
        headers=auth(accounts),
    )
    assert farmer.status_code == 201, farmer.text
    farmer_id = farmer.json()["id"]

    mature = _tree(client, accounts, site_id, mango["id"], "forecast-mature", "2010-01-01")
    bearing = _tree(
        client, accounts, site_id, mango["id"], "forecast-bearing", "2020-01-01", farmer_id
    )
    young = _tree(client, accounts, site_id, mango["id"], "forecast-young", "2025-06-01", farmer_id)
    picked = _tree(
        client, accounts, site_id, mango["id"], "forecast-picked", "2024-01-01", farmer_id
    )
    _harvest(client, accounts, picked["id"], "forecast-harvest-a", 8, "2026-01-01")
    _harvest(client, accounts, picked["id"], "forecast-harvest-b", 12, "2026-08-01")
    dead = _tree(client, accounts, site_id, mango["id"], "forecast-dead", "2010-01-01")
    removed = client.patch(
        f"/api/v1/trees/{dead['id']}", json={"status": "dead"}, headers=auth(accounts)
    )
    assert removed.status_code == 200, removed.text
    _tree(client, accounts, site_id, papaya["id"], "forecast-papaya", "2024-01-01", farmer_id)
    _tree(client, accounts, site_id, other["id"], "forecast-soursop", "2015-01-01")
    open_site = make_site(
        client, accounts, name="SYNTHETIC open orchard", client_request_id="forecast-site-open"
    )
    assert open_site.status_code == 201, open_site.text
    batch = client.post(
        "/api/v1/batches",
        json={
            "site_id": open_site.json()["id"],
            "species_id": mango["id"],
            "category": "fruit",
            "planting_date": "2010-01-01",
            "quantity": 100,
            "client_request_id": "forecast-batch",
        },
        headers=auth(accounts),
    )
    assert batch.status_code == 201, batch.text

    officer = client.get("/api/v1/harvests/forecast", headers=auth(accounts))
    assert officer.status_code == 200, officer.text
    body = officer.json()
    totals = {row["unit"]: row for row in body["totals"]}
    assert totals["count"]["low"] == 40000
    assert totals["count"]["high"] == 60000
    assert totals["count"]["trees"] == 100
    assert totals["kg"]["low"] == 28 + 34
    assert totals["kg"]["high"] == 32 + 34
    species = {(row["species_common_name"], row["unit"]): row for row in body["by_species"]}
    assert species[("Mango", "count")]["trees"] == 100
    assert species[("Mango", "kg")]["low"] == 28
    assert species[("Mango", "kg")]["high"] == 32
    assert species[("Papaya", "kg")]["low"] == 34
    assert ("Soursop", "kg") not in species
    assert body["unestimated_trees"] == 1
    assert body["young_trees"] >= 1
    assert body["by_farmer"]
    assert any(row["label"] == "Forecast Household" for row in body["by_farmer"])

    account = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Forecast Farmer",
            "email": "forecast-farmer@test.treelife.local",
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
        json={"email": "forecast-farmer@test.treelife.local", "password": "test-password-123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    farm = client.get("/api/v1/harvests/forecast", headers=headers)
    assert farm.status_code == 200, farm.text
    plantings = {row["public_code"]: row for row in farm.json()["plantings"]}
    assert picked["public_code"] in plantings
    assert plantings[picked["public_code"]]["basis"] == "recorded"
    assert plantings[picked["public_code"]]["low"] == 8
    assert plantings[picked["public_code"]]["high"] == 12
    assert plantings[picked["public_code"]]["months"] == [1, 8]
    assert plantings[picked["public_code"]]["kind"] == "tree"
    assert plantings[bearing["public_code"]]["basis"] == "household"
    assert plantings[bearing["public_code"]]["low"] == 10
    assert plantings[mature["public_code"]]["basis"] == "household"
    assert plantings[young["public_code"]]["basis"] == "young"
    assert batch.json()["public_code"] not in plantings
    assert body["agents"] == []
    assert len(body["farmers"]) == 1
    assigned = body["farmers"][0]
    assert assigned["display_name"] == "Forecast Household"
    assert assigned["district"] == "Bugesera"
    officer_plantings = {row["public_code"]: row for row in assigned["plantings"]}
    assert officer_plantings.keys() == plantings.keys()
    assert officer_plantings[picked["public_code"]]["low"] == 8
    assert officer_plantings[picked["public_code"]]["high"] == 12
    assert assigned["young_trees"] == farm.json()["young_trees"]
    assert assigned["unestimated_trees"] == farm.json()["unestimated_trees"]

    admin = client.get("/api/v1/harvests/forecast", headers=auth(accounts, "admin"))
    assert admin.status_code == 200, admin.text
    admin_body = admin.json()
    assert admin_body["totals"] == body["totals"]
    assert picked["public_code"] in {row["public_code"] for row in admin_body["plantings"]}
    assert batch.json()["public_code"] in {row["public_code"] for row in admin_body["plantings"]}
    assert admin_body["registered_trees"] == sum(row["trees"] for row in admin_body["plantings"])
    household = next(
        row for row in admin_body["farmers"] if row["display_name"] == "Forecast Household"
    )
    assert {row["public_code"] for row in household["plantings"]} == set(plantings)
    assert household["agent_name"] == "Test Officer"
    assert any(
        row["display_name"] == "Test Officer" and row["farmer_count"] >= 1
        for row in admin_body["agents"]
    )
