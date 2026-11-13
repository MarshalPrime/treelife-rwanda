"""Carbon monitoring stays behind an approved field-officer authorization."""

from app.services.carbon import tree_carbon_stock
from tests.conftest import auth, make_species

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

REQUEST = {
    "experience": "Measured sample plots for two seasons.",
    "training": "A field course on diameter and height.",
    "qualifications": "Forestry technician certificate.",
}


def _request(client, accounts, headers=None):
    return client.post(
        "/api/v1/carbon/authorization",
        json=REQUEST,
        headers=headers or auth(accounts),
    )


def test_only_an_approved_officer_can_record_carbon(client, accounts):
    officer = auth(accounts)
    admin = auth(accounts, "admin")
    blocked = client.post("/api/v1/carbon/measurements", json={}, headers=officer)
    assert blocked.status_code == 403

    created = _request(client, accounts)
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending"
    assert _request(client, accounts).status_code == 409

    uploaded = client.post(
        f"/api/v1/carbon/authorization/{created.json()['id']}/documents",
        files={"file": ("certificate.png", PNG, "image/png")},
        headers=officer,
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["documents"][0]["original_name"] == "certificate.png"

    missing_reason = client.post(
        f"/api/v1/carbon/authorizations/{created.json()['id']}/decision",
        json={"decision": "reject"},
        headers=admin,
    )
    assert missing_reason.status_code == 422

    rejected = client.post(
        f"/api/v1/carbon/authorizations/{created.json()['id']}/decision",
        json={"decision": "reject", "reason": "The certificate is incomplete."},
        headers=admin,
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["decided_by_name"] == "Test Admin"

    again = _request(client, accounts)
    assert again.status_code == 201, again.text
    approved = client.post(
        f"/api/v1/carbon/authorizations/{again.json()['id']}/decision",
        json={"decision": "approve"},
        headers=admin,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert client.get("/api/v1/auth/me", headers=officer).json()["carbon_monitoring"] == "approved"
    history = client.get("/api/v1/carbon/authorization", headers=officer).json()["history"]
    assert [item["action"] for item in history] == [
        "submitted",
        "rejected",
        "submitted",
        "approved",
    ]

    species = make_species(client, accounts, "Grevillea robusta", "Grevillea")
    measured = client.post(
        "/api/v1/carbon/measurements",
        json={
            "species_id": species["id"],
            "species_verified": True,
            "latitude": -1.5,
            "longitude": 29.6,
            "dbh_cm": 20,
            "height_m": 8,
            "status": "surviving",
            "measured_on": "2026-11-01",
        },
        headers=officer,
    )
    assert measured.status_code == 201, measured.text
    body = measured.json()
    assert body["collected_by_name"] == "Test Officer"
    assert body["review_status"] == "pending"
    assert body["estimate"]["label"] == "Estimate"
    assert body["estimate"]["wood_specific_gravity"] == 0.51
    assert body["estimate"]["methodology_version"] == "1"
    assert (
        body["estimate"]["co2_equivalent_kg"] == tree_carbon_stock(20, 8, 0.51)["co2_equivalent_kg"]
    )
    assert "not a certified carbon credit" in body["estimate"]["assumptions"][0]
    assert "annual sequestration" in body["estimate"]["assumptions"][-1].casefold()
    assert body["public_code"].startswith("CARB-")

    changed = client.put(
        f"/api/v1/carbon/measurements/{body['id']}",
        json={
            "species_id": species["id"],
            "latitude": -1.5,
            "longitude": 29.6,
            "dbh_cm": 22,
            "height_m": 8,
            "status": "surviving",
            "measured_on": "2026-11-01",
        },
        headers=officer,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["dbh_cm"] == 22
    assert changed.json()["history"][0]["snapshot"]["dbh_cm"] == 20

    waiting = client.get("/api/v1/carbon/overview", headers=admin)
    assert waiting.status_code == 200, waiting.text
    assert waiting.json()["total_tonnes_co2e"] == 0
    assert waiting.json()["pending_measurements"] == 1
    accepted = client.post(
        f"/api/v1/carbon/measurements/{body['id']}/review",
        json={"decision": "accept"},
        headers=admin,
    )
    assert accepted.status_code == 200, accepted.text
    overview = client.get("/api/v1/carbon/overview", headers=admin)
    summary = overview.json()
    stock = round(tree_carbon_stock(22, 8, 0.51)["co2_equivalent_kg"] / 1000, 3)
    assert summary["distinct_trees"] == 1
    assert summary["distinct_species"] == 1
    assert summary["agents"] == 1
    assert summary["accepted_measurements"] == 1
    assert summary["total_tonnes_co2e"] == stock
    assert "estimate" not in summary
    assert (
        client.get("/api/v1/carbon/overview", headers=auth(accounts, "viewer")).status_code == 200
    )
    assert client.get("/api/v1/carbon/overview", headers=officer).status_code == 403

    viewer = client.get("/api/v1/carbon/measurements", headers=auth(accounts, "viewer"))
    assert viewer.status_code == 403

    revoked = client.post(
        f"/api/v1/carbon/authorizations/{again.json()['id']}/decision",
        json={"decision": "revoke", "reason": "The authorization is no longer current."},
        headers=admin,
    )
    assert revoked.status_code == 200, revoked.text
    denied = client.post(
        "/api/v1/carbon/measurements",
        json={
            "species_id": species["id"],
            "latitude": -1.5,
            "longitude": 29.6,
            "dbh_cm": 10,
            "status": "unknown",
            "measured_on": "2026-11-02",
        },
        headers=officer,
    )
    assert denied.status_code == 403
    oversight = client.post(
        "/api/v1/carbon/measurements",
        json={
            "species_id": species["id"],
            "latitude": -1.5,
            "longitude": 29.6,
            "dbh_cm": 12,
            "status": "unknown",
            "measured_on": "2026-11-02",
        },
        headers=admin,
    )
    assert oversight.status_code == 403


def test_repeated_measurements_do_not_double_count_the_tree(client, accounts):
    officer = auth(accounts)
    admin = auth(accounts, "admin")
    created = _request(client, accounts)
    client.post(
        f"/api/v1/carbon/authorizations/{created.json()['id']}/decision",
        json={"decision": "approve"},
        headers=admin,
    )
    species = make_species(client, accounts, "Grevillea robusta", "Grevillea")
    tree = client.post(
        "/api/v1/trees",
        json={
            "species_id": species["id"],
            "category": "agroforestry",
            "planting_date": "2026-01-15",
            "latitude": -1.94,
            "longitude": 30.06,
            "client_request_id": "carbon-tree-0001",
        },
        headers=officer,
    )
    assert tree.status_code == 201, tree.text
    tree_id = tree.json()["id"]

    def measure(dbh, day, request_id):
        saved = client.post(
            "/api/v1/carbon/measurements",
            json={
                "tree_id": tree_id,
                "species_id": species["id"],
                "latitude": -1.94,
                "longitude": 30.06,
                "dbh_cm": dbh,
                "height_m": 8,
                "status": "surviving",
                "measured_on": day,
                "client_request_id": request_id,
            },
            headers=officer,
        )
        assert saved.status_code == 201, saved.text
        review = client.post(
            f"/api/v1/carbon/measurements/{saved.json()['id']}/review",
            json={"decision": "accept"},
            headers=admin,
        )
        assert review.status_code == 200, review.text
        return saved.json()

    measure(10, "2026-08-01", "carbon-repeat-early")
    later = measure(20, "2026-10-01", "carbon-repeat-later")
    summary = client.get("/api/v1/carbon/overview", headers=admin).json()
    assert summary["distinct_trees"] == 1
    assert summary["accepted_measurements"] == 2
    assert summary["total_tonnes_co2e"] == round(later["estimate"]["co2_equivalent_kg"] / 1000, 3)

    missing = make_species(client, accounts, "Persea americana", "Avocado")
    plain = client.post(
        "/api/v1/carbon/measurements",
        json={
            "species_id": missing["id"],
            "latitude": -1.94,
            "longitude": 30.06,
            "dbh_cm": 15,
            "height_m": 6,
            "status": "surviving",
            "measured_on": "2026-10-02",
        },
        headers=officer,
    )
    assert plain.status_code == 201, plain.text
    assert plain.json()["estimate"] is None
    assert "wood specific gravity" in plain.json()["estimate_note"]


def test_a_farmer_cannot_request_carbon_authorization(client):
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Trial Farmer",
            "email": "carbon-farmer@trial.treelife.local",
            "password": "test-password-123",
            "role": "farmer",
        },
    )
    assert registered.status_code == 201, registered.text
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "carbon-farmer@trial.treelife.local", "password": "test-password-123"},
    ).json()["access_token"]
    response = client.post(
        "/api/v1/carbon/authorization",
        json=REQUEST,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
