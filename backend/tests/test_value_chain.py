from tests.conftest import auth, make_site, make_species


def test_value_chain_from_nursery_to_sale(client, accounts):
    species = make_species(client, accounts)
    headers = auth(accounts)
    farmer = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "SYNTHETIC Household A",
            "district": "Bugesera",
            "client_request_id": "farmer-request-0001",
        },
        headers=headers,
    )
    assert farmer.status_code == 201, farmer.text
    farmer_id = farmer.json()["id"]
    replay = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Different name",
            "client_request_id": "farmer-request-0001",
        },
        headers=headers,
    )
    assert replay.status_code == 200
    assert replay.headers["X-Idempotent-Replay"] == "true"
    assert replay.json()["id"] == farmer_id
    nursery = make_site(
        client,
        accounts,
        name="Nursery holding",
        site_type="nursery_holding",
        client_request_id="chain-nursery-0001",
    ).json()
    farm = make_site(
        client,
        accounts,
        name="Receiving orchard",
        farmer_id=farmer_id,
        client_request_id="chain-farm-0001",
    ).json()

    lot = client.post(
        "/api/v1/seedling-lots",
        json={
            "nursery_site_id": nursery["id"],
            "species_id": species["id"],
            "quantity_produced": 10,
            "produced_on": "2026-01-15",
            "client_request_id": "lot-request-0001",
        },
        headers=headers,
    )
    assert lot.status_code == 201, lot.text
    too_many = client.post(
        "/api/v1/distributions",
        json={
            "seedling_lot_id": lot.json()["id"],
            "destination_site_id": farm["id"],
            "farmer_id": farmer_id,
            "quantity": 11,
            "distributed_on": "2026-02-01",
            "client_request_id": "dist-request-too-many",
        },
        headers=headers,
    )
    assert too_many.status_code == 422
    sent = client.post(
        "/api/v1/distributions",
        json={
            "seedling_lot_id": lot.json()["id"],
            "destination_site_id": farm["id"],
            "farmer_id": farmer_id,
            "quantity": 4,
            "distributed_on": "2026-02-01",
            "client_request_id": "dist-request-0001",
        },
        headers=headers,
    )
    assert sent.status_code == 201, sent.text
    assert client.get("/api/v1/seedling-lots", headers=headers).json()[0]["quantity_remaining"] == 6

    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": farm["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-02-02",
            "client_request_id": "chain-tree-0001",
        },
        headers=headers,
    )
    assert tree.status_code == 201, tree.text
    growth = client.post(
        "/api/v1/growth",
        json={
            "tree_id": tree.json()["id"],
            "measured_on": "2026-06-01",
            "height_m": 1.4,
            "dbh_cm": 3.2,
            "client_request_id": "growth-request-0001",
        },
        headers=headers,
    )
    assert growth.status_code == 201, growth.text
    work = client.post(
        "/api/v1/maintenance",
        json={
            "site_id": farm["id"],
            "activity_type": "mulching",
            "performed_on": "2026-05-01",
            "client_request_id": "work-request-0001",
        },
        headers=headers,
    )
    assert work.status_code == 201, work.text
    harvest = client.post(
        "/api/v1/harvests",
        json={
            "tree_id": tree.json()["id"],
            "harvested_on": "2026-08-01",
            "quantity": 12,
            "unit": "kg",
            "client_request_id": "harvest-request-0001",
        },
        headers=headers,
    )
    assert harvest.status_code == 201, harvest.text
    oversold = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest.json()["id"],
            "sold_on": "2026-08-02",
            "quantity": 20,
            "amount_rwf": 5000,
            "buyer_name": "SYNTHETIC Market",
            "client_request_id": "sale-request-over",
        },
        headers=headers,
    )
    assert oversold.status_code == 422
    sale = client.post(
        "/api/v1/sales",
        json={
            "harvest_id": harvest.json()["id"],
            "sold_on": "2026-08-02",
            "quantity": 5,
            "amount_rwf": 4000,
            "buyer_name": "SYNTHETIC Market",
            "client_request_id": "sale-request-0001",
        },
        headers=headers,
    )
    assert sale.status_code == 201, sale.text
    advice = client.post(
        "/api/v1/advisories",
        json={
            "title": "Mulch before the dry weeks",
            "body": "Keep the soil covered around young fruit trees.",
            "farmer_id": farmer_id,
            "site_id": farm["id"],
            "species_id": species["id"],
            "issued_on": "2026-05-02",
            "client_request_id": "advice-request-0001",
        },
        headers=headers,
    )
    assert advice.status_code == 201, advice.text
    denied = client.post(
        "/api/v1/farmers",
        json={"display_name": "Blocked", "client_request_id": "farmer-request-blocked"},
        headers=auth(accounts, "viewer"),
    )
    assert denied.status_code == 403

    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200, analytics.text
    body = analytics.json()
    assert body["farmers"] == 1
    assert body["seedlings_remaining"] == 6
    assert body["seedlings_distributed"] == 4
    assert body["harvested_kg"] == 12
    assert body["unsold_kg"] == 7
    assert body["sales_rwf"] == 4000
    assert body["advisories"] == 1
    assert body["maintenance_activities"] == 1
    assert body["growth_measurements"] == 1
    assert body["recorded_trees"] == 1
    assert body["checked_trees"] == 0
    assert body["survival_percent"] is None
    assert body["sites"] == 2
    assert body["sites_visited"] == 1
    assert body["species_counts"][0]["trees"] == 1
    assert len(body["activity"]) == 2
    by_day = {row["day"]: row for row in body["activity"]}
    assert by_day["2026-06-01"]["by_species"] == [{"species_common_name": "Avocado", "checks": 1}]
    assert by_day["2026-05-01"]["by_species"] == [{"species_common_name": "Site work", "checks": 1}]

    dashboard = client.get("/api/v1/dashboard?range=all", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    chain = dashboard.json()["value_chain"]
    assert chain["seedlings_remaining"] == 6
    assert chain["seedlings_distributed"] == 4
    assert chain["unsold_kg"] == 7
    assert chain["advisories"] == 1
    assert chain["harvest_by_species"] == [
        {"species_common_name": "Avocado", "harvested_kg": 12, "harvested_count": 0}
    ]
    assert sum(point["harvested_kg"] for point in dashboard.json()["series"]) == 12
    assert sum(point["sales_rwf"] for point in dashboard.json()["series"]) == 4000

    ranged = client.get(
        "/api/v1/analytics?start_date=2026-05-01&end_date=2026-05-03",
        headers=headers,
    )
    assert ranged.status_code == 200, ranged.text
    assert [row["day"] for row in ranged.json()["activity"]] == [
        "2026-05-01",
        "2026-05-02",
        "2026-05-03",
    ]
    assert ranged.json()["activity"][1]["checks"] == 0

    mapped = client.get(f"/api/v1/map?farmer_id={farmer_id}", headers=headers)
    assert mapped.status_code == 200
    titles = [feature["properties"]["title"] for feature in mapped.json()["features"]]
    assert "Receiving orchard" in titles
    assert "Nursery holding" not in titles

    country = client.get("/api/v1/overview/country", headers=auth(accounts, "viewer"))
    assert country.status_code == 200, country.text
    assert client.get("/api/v1/analytics", headers=auth(accounts, "viewer")).status_code == 403
    country_body = country.json()
    assert set(country_body) == {"recorded_trees", "species_counts", "districts"}
    assert country_body["recorded_trees"] == 1
    assert country_body["species_counts"][0]["species_common_name"] == "Avocado"
    assert country_body["districts"] == [{"district": "Bugesera", "trees": 1}]
    assert client.get("/api/v1/overview/country", headers=headers).status_code == 403

    overview = client.get("/api/v1/overview/officer", headers=headers)
    assert overview.status_code == 200, overview.text
    officer = overview.json()
    assert officer["farmers_helped"] == 1
    assert officer["recorded_trees"] == 1
    assert officer["metal"] == "bronze"
    assert officer["sites"] == 2
    assert officer["harvested_kg"] == 12
    assert officer["sales_rwf"] == 4000
    assert officer["species_counts"][0]["species_common_name"] == "Avocado"
    assert officer["plantings"][0]["farmer_name"] == "SYNTHETIC Household A"
    blocked = client.get("/api/v1/overview/officer", headers=auth(accounts, "viewer"))
    assert blocked.status_code == 403

    second = client.post(
        "/api/v1/farmers",
        json={"display_name": "SYNTHETIC Household B", "client_request_id": "farmer-request-0002"},
        headers=headers,
    )
    assert second.status_code == 201, second.text
    again = client.get("/api/v1/overview/officer", headers=headers)
    assert again.json()["farmers_helped"] == 2


def test_analytics_is_scoped_to_the_registering_officer(client, accounts):
    species = make_species(client, accounts, "Mangifera indica", "Mango")
    first_site = make_site(
        client, accounts, name="Officer A plot", client_request_id="scope-site-a"
    )
    first_tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": first_site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-01",
            "client_request_id": "scope-tree-a",
        },
        headers=auth(accounts),
    )
    assert first_tree.status_code == 201, first_tree.text

    created = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Second Officer",
            "email": "second-officer@scope.treelife.local",
            "password": "scope-pass1",
            "role": "field_officer",
        },
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "second-officer@scope.treelife.local", "password": "scope-pass1"},
    )
    second_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    second_site = client.post(
        "/api/v1/sites",
        json={
            "name": "Officer B plot",
            "site_type": "orchard",
            "client_request_id": "scope-site-b",
        },
        headers=second_headers,
    )
    assert second_site.status_code == 201, second_site.text
    second_tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": second_site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-01-02",
            "client_request_id": "scope-tree-b",
        },
        headers=second_headers,
    )
    assert second_tree.status_code == 201, second_tree.text

    first_report = client.get("/api/v1/analytics", headers=auth(accounts))
    assert first_report.status_code == 200, first_report.text
    assert first_report.json()["trees"] == 1
    assert first_report.json()["recorded_trees"] == 1
    second_report = client.get("/api/v1/analytics", headers=second_headers)
    assert second_report.status_code == 200, second_report.text
    assert second_report.json()["trees"] == 1
    assert second_report.json()["recorded_trees"] == 1
