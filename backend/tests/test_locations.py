from tests.conftest import auth, make_site


def test_place_lists_follow_the_chosen_parent(client, accounts):
    headers = auth(accounts)
    provinces = client.get("/api/v1/locations", headers=headers)
    assert provinces.status_code == 200, provinces.text
    assert "Kigali" in provinces.json()["places"]
    assert "Southern Province" in provinces.json()["places"]

    districts = client.get("/api/v1/locations", params={"province": "Kigali"}, headers=headers)
    assert set(districts.json()["places"]) == {"Nyarugenge", "Gasabo", "Kicukiro"}

    sectors = client.get(
        "/api/v1/locations",
        params={"province": "Kigali", "district": "Kicukiro"},
        headers=headers,
    )
    assert "Gikondo" in sectors.json()["places"]
    assert "Kanombe" in sectors.json()["places"]
    assert client.get("/api/v1/locations").status_code == 401


def test_officer_can_save_isibo_and_household(client, accounts):
    response = make_site(
        client,
        accounts,
        province="Kigali",
        district="Kicukiro",
        sector="Gikondo",
        cell="Kanserege",
        village="Kanserege",
        isibo="Isibo 3",
        household="Household 12",
        client_request_id="site-address-0001",
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["province"] == "Kigali"
    assert body["district"] == "Kicukiro"
    assert body["isibo"] == "Isibo 3"
    assert body["household"] == "Household 12"
