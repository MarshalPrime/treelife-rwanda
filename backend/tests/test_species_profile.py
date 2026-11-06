from tests.conftest import auth, make_species


def test_species_harvest_details_stay_blank(client, accounts):
    created = make_species(client, accounts)
    assert created["category"] == "fruit"
    assert created["local_name"] is None
    assert created["harvest_potential"] is None
    assert created["harvest_type"] is None
    assert created["varieties"] == []
    assert created["review_status"] == "draft"
    assert created["growth_form"] is None

    other = client.post(
        "/api/v1/species",
        json={
            "scientific_name": "Grevillea robusta",
            "common_name": "Grevillea",
            "category": "agroforestry",
        },
        headers=auth(accounts, "admin"),
    )
    assert other.status_code == 201, other.text
    assert other.json()["harvest_potential"] is None
    assert other.json()["harvest_type"] is None
    assert other.json()["varieties"] == []

    found = client.get("/api/v1/species?q=robusta", headers=auth(accounts))
    assert found.status_code == 200
    assert [item["common_name"] for item in found.json()] == ["Grevillea"]
