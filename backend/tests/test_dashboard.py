from tests.conftest import auth, make_site, make_species


def register_user(client, role, email, password="scope-pass1", name="Test person"):
    created = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": password, "role": role},
    )
    assert created.status_code == 201, created.text
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, created.json()


def create_tree(
    client, headers, site_id, species_id, request_id, farmer_id=None, date_value="2025-01-01"
):
    payload = {
        "site_id": site_id,
        "species_id": species_id,
        "category": "fruit",
        "planting_date": date_value,
        "client_request_id": request_id,
    }
    if farmer_id:
        payload["farmer_id"] = farmer_id
    response = client.post("/api/v1/trees", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_batch(
    client, headers, site_id, species_id, request_id, quantity=10, date_value="2025-01-01"
):
    response = client.post(
        "/api/v1/batches",
        json={
            "site_id": site_id,
            "species_id": species_id,
            "category": "fruit",
            "planting_date": date_value,
            "quantity": quantity,
            "client_request_id": request_id,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_dashboard_role_scope_and_viewer_redaction(client, accounts):
    species = make_species(client, accounts, "Persea americana", "Avocado")
    site = make_site(client, accounts, name="Officer plot", client_request_id="dashboard-site")
    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-01",
            "client_request_id": "dashboard-tree",
        },
        headers=auth(accounts),
    )
    assert tree.status_code == 201, tree.text

    officer = client.get("/api/v1/dashboard?range=30", headers=auth(accounts))
    assert officer.status_code == 200, officer.text
    body = officer.json()
    assert body["role"] == "field_officer"
    assert body["summary"]["recorded_trees"] == 1
    assert body["filters"]["range"] == "30"
    assert len(body["series"]) == 30
    assert body["map_query"].startswith("/dashboard/map")

    viewer = client.get("/api/v1/dashboard?range=30", headers=auth(accounts, "viewer"))
    assert viewer.status_code == 200, viewer.text
    viewer_body = viewer.json()
    assert viewer_body["summary"]["harvested_kg"] is None
    assert viewer_body["summary"]["sales_rwf"] is None
    assert all(point["harvested_kg"] is None for point in viewer_body["series"])
    assert all(point["sales_rwf"] is None for point in viewer_body["series"])
    assert viewer_body["attention"] == []


def test_dashboard_rejects_invalid_or_oversized_ranges(client, accounts):
    invalid = client.get("/api/v1/dashboard?range=7", headers=auth(accounts))
    assert invalid.status_code == 422
    oversized = client.get(
        "/api/v1/dashboard?range=all&start_date=1900-01-01&end_date=2300-01-01",
        headers=auth(accounts),
    )
    assert oversized.status_code == 422


def test_farmer_scope_honors_explicit_owner_over_site_owner(client, accounts):
    species = make_species(client, accounts)
    farmer_a_headers, farmer_a = register_user(
        client, "farmer", "farmer-a@dashboard.local", name="Farmer A"
    )
    _, farmer_b = register_user(client, "farmer", "farmer-b@dashboard.local", name="Farmer B")
    site = client.post(
        "/api/v1/sites",
        json={
            "name": "A site",
            "site_type": "orchard",
            "farmer_id": farmer_a["farmer_id"],
            "client_request_id": "owner-site",
        },
        headers=auth(accounts),
    )
    assert site.status_code == 201, site.text
    tree = create_tree(
        client,
        auth(accounts),
        site.json()["id"],
        species["id"],
        "owner-tree",
        farmer_id=farmer_b["farmer_id"],
    )
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree["id"],
            "harvested_on": "2025-01-10",
            "quantity": 4,
            "unit": "kg",
            "client_request_id": "owner-harvest",
        },
        headers=auth(accounts),
    )
    assert harvest.status_code == 201, harvest.text
    sale = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest.json()["id"],
            "sold_on": "2025-01-11",
            "quantity": 2,
            "amount_rwf": 900,
            "buyer_name": "Market",
            "client_request_id": "owner-sale",
        },
        headers=auth(accounts),
    )
    assert sale.status_code == 201, sale.text
    report = client.get(
        "/api/v1/dashboard?range=all&start_date=2025-01-01&end_date=2025-01-31",
        headers=farmer_a_headers,
    )
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["recorded_trees"] == 0
    assert report.json()["summary"]["harvested_kg"] == 0
    assert report.json()["summary"]["sales_rwf"] == 0


def test_batch_latest_survival_and_activity_filters(client, accounts):
    species_a = make_species(client, accounts, "Persea americana", "Avocado")
    species_b = make_species(client, accounts, "Mangifera indica", "Mango")
    site_a = make_site(
        client, accounts, district="North", name="North site", client_request_id="filter-site-a"
    )
    site_b = make_site(
        client, accounts, district="South", name="South site", client_request_id="filter-site-b"
    )
    batch_a = create_batch(
        client, auth(accounts), site_a.json()["id"], species_a["id"], "filter-batch-a"
    )
    create_batch(client, auth(accounts), site_b.json()["id"], species_b["id"], "filter-batch-b")
    first = client.post(
        "/api/v1/events",
        json={
            "batch_id": batch_a["id"],
            "event_type": "survival_check",
            "event_date": "2025-01-05",
            "survival_count": 0,
            "client_request_id": "filter-event-0",
        },
        headers=auth(accounts),
    )
    assert first.status_code == 201, first.text
    second = client.post(
        "/api/v1/growth",
        json={
            "batch_id": batch_a["id"],
            "measured_on": "2025-01-10",
            "survival_count": 6,
            "client_request_id": "filter-growth-6",
        },
        headers=auth(accounts),
    )
    assert second.status_code == 201, second.text
    report = client.get(
        f"/api/v1/dashboard?district=North&species_id={species_a['id']}&range=all&start_date=2025-01-01&end_date=2025-01-31",
        headers=auth(accounts),
    )
    assert report.status_code == 200, report.text
    body = report.json()
    assert body["summary"]["checked_trees"] == 10
    assert body["summary"]["surviving_trees"] == 6
    assert body["summary"]["survival_percent"] == 60
    assert body["districts"] == [{"district": "North", "trees": 10}]
    assert body["species_counts"][0]["trees"] == 10
    assert sum(point["activity"] for point in body["series"]) >= 2


def test_sales_from_older_count_harvest_are_kept(client, accounts):
    species = make_species(client, accounts)
    site = make_site(client, accounts, client_request_id="sale-site")
    tree = create_tree(client, auth(accounts), site.json()["id"], species["id"], "sale-tree")
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree["id"],
            "harvested_on": "2024-12-01",
            "quantity": 10,
            "unit": "count",
            "client_request_id": "sale-count-harvest",
        },
        headers=auth(accounts),
    )
    assert harvest.status_code == 201, harvest.text
    sale = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest.json()["id"],
            "sold_on": "2025-01-15",
            "quantity": 3,
            "amount_rwf": 1200,
            "buyer_name": "Market",
            "client_request_id": "sale-count-sale",
        },
        headers=auth(accounts),
    )
    assert sale.status_code == 201, sale.text
    report = client.get(
        "/api/v1/dashboard?range=30&start_date=2025-01-01&end_date=2025-01-30",
        headers=auth(accounts),
    )
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["sales_rwf"] == 1200


def test_officer_inspecting_another_officers_tree_does_not_change_denominator(client, accounts):
    species = make_species(client, accounts)
    other_headers, _ = register_user(client, "field_officer", "other-officer@dashboard.local")
    other_site = client.post(
        "/api/v1/sites",
        json={"name": "Other plot", "site_type": "orchard", "client_request_id": "other-site"},
        headers=other_headers,
    )
    assert other_site.status_code == 201, other_site.text
    other_tree = create_tree(
        client, other_headers, other_site.json()["id"], species["id"], "other-tree"
    )
    event = client.post(
        "/api/v1/events",
        json={
            "tree_id": other_tree["id"],
            "event_type": "inspection",
            "event_date": "2025-01-05",
            "status_after": "surviving",
            "client_request_id": "cross-inspection",
        },
        headers=auth(accounts),
    )
    assert event.status_code == 201, event.text
    report = client.get(
        "/api/v1/dashboard?range=30&start_date=2025-01-01&end_date=2025-01-30",
        headers=auth(accounts),
    )
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["recorded_trees"] == 0
    assert report.json()["summary"]["checked_trees"] == 0


def test_all_time_series_starts_at_backdated_planting(client, accounts):
    species = make_species(client, accounts)
    site = make_site(client, accounts, client_request_id="backdated-site")
    create_tree(
        client,
        auth(accounts),
        site.json()["id"],
        species["id"],
        "backdated-tree",
        date_value="2020-01-15",
    )
    report = client.get("/api/v1/dashboard?range=all", headers=auth(accounts))
    assert report.status_code == 200, report.text
    assert report.json()["series"][0]["day"] == "2020-01-01"
    assert report.json()["series"][0]["planted"] == 1


def test_latest_zero_batch_assessment_overrides_earlier_count(client, accounts):
    species = make_species(client, accounts)
    site = make_site(client, accounts, client_request_id="zero-site")
    batch = create_batch(
        client, auth(accounts), site.json()["id"], species["id"], "zero-batch", quantity=5
    )
    first = client.post(
        "/api/v1/events",
        json={
            "batch_id": batch["id"],
            "event_type": "survival_check",
            "event_date": "2025-01-01",
            "survival_count": 4,
            "client_request_id": "zero-first",
        },
        headers=auth(accounts),
    )
    assert first.status_code == 201, first.text
    latest = client.post(
        "/api/v1/growth",
        json={
            "batch_id": batch["id"],
            "measured_on": "2025-01-02",
            "survival_count": 0,
            "client_request_id": "zero-latest",
        },
        headers=auth(accounts),
    )
    assert latest.status_code == 201, latest.text
    report = client.get(
        "/api/v1/dashboard?range=30&start_date=2025-01-01&end_date=2025-01-30",
        headers=auth(accounts),
    )
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["checked_trees"] == 5
    assert report.json()["summary"]["surviving_trees"] == 0
    assert report.json()["summary"]["survival_percent"] == 0


def test_viewer_dashboard_map_has_no_household_names(client, accounts):
    species = make_species(client, accounts)
    farmer_headers, farmer = register_user(
        client, "farmer", "map-farmer@dashboard.local", name="Private Household"
    )
    site = client.post(
        "/api/v1/sites",
        json={
            "name": "Private orchard",
            "site_type": "orchard",
            "farmer_id": farmer["farmer_id"],
            "client_request_id": "private-map-site",
        },
        headers=auth(accounts),
    )
    assert site.status_code == 201, site.text
    create_tree(client, farmer_headers, site.json()["id"], species["id"], "private-map-tree")
    response = client.get("/api/v1/dashboard/map", headers=auth(accounts, "viewer"))
    assert response.status_code == 200, response.text
    payload = response.json()
    serialized = str(payload)
    assert "Private Household" not in serialized
