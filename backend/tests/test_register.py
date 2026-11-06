from tests.conftest import auth, make_site, make_species


def register(client, role, email, **extra):
    payload = {
        "full_name": "Trial User",
        "email": email,
        "password": "register-pass1",
        "role": role,
    }
    payload.update(extra)
    return client.post("/api/v1/auth/register", json=payload)


def login(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "register-pass1"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_registration_keeps_the_three_experiences(client, accounts):
    farmer = register(client, "farmer", "grower@trial.treelife.local", district="Huye")
    assert farmer.status_code == 201, farmer.text
    assert farmer.json()["role"] == "farmer"
    assert farmer.json()["farmer_id"]

    duplicate = register(client, "farmer", "grower@trial.treelife.local")
    assert duplicate.status_code == 409

    short = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Short",
            "email": "short@trial.treelife.local",
            "password": "short",
            "role": "viewer",
        },
    )
    assert short.status_code == 422

    weak = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Letters Only",
            "email": "letters@trial.treelife.local",
            "password": "lettersonly",
            "role": "viewer",
        },
    )
    assert weak.status_code == 422

    farmer_headers = login(client, "grower@trial.treelife.local")
    me = client.get("/api/v1/auth/me", headers=farmer_headers)
    assert me.json()["farmer_id"] == farmer.json()["farmer_id"]

    species = make_species(client, accounts, "Mangifera indica", "Mango")
    site = client.post(
        "/api/v1/sites",
        json={
            "name": "Own orchard",
            "site_type": "orchard",
            "client_request_id": "reg-site-farmer",
        },
        headers=farmer_headers,
    )
    assert site.status_code == 201, site.text
    assert site.json()["farmer_id"] == farmer.json()["farmer_id"]

    tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-01",
            "farmer_id": "00000000-0000-0000-0000-000000000099",
            "client_request_id": "reg-tree-farmer",
        },
        headers=farmer_headers,
    )
    assert tree.status_code == 201, tree.text
    assert tree.json()["farmer_id"] == farmer.json()["farmer_id"]
    assert tree.json()["farmer_name"] == "Trial User"

    officer = register(
        client,
        "field_officer",
        "officer@trial.treelife.local",
        organization_name="Trial Office",
    )
    assert officer.status_code == 201, officer.text
    assert officer.json()["organization_id"]
    officer_headers = login(client, "officer@trial.treelife.local")
    helped = client.post(
        "/api/v1/farmers",
        json={
            "display_name": "Helped Household",
            "district": "Nyagatare",
            "client_request_id": "reg-helped",
        },
        headers=officer_headers,
    )
    assert helped.status_code == 201, helped.text
    office_site = make_site(
        client, accounts, name="Shared plot", client_request_id="reg-office-site"
    )
    assert office_site.status_code == 201, office_site.text
    planted = client.post(
        "/api/v1/trees",
        json={
            "site_id": office_site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-02",
            "farmer_id": helped.json()["id"],
            "client_request_id": "reg-tree-officer",
        },
        headers=officer_headers,
    )
    assert planted.status_code == 201, planted.text
    assert planted.json()["farmer_name"] == "Helped Household"

    viewer = register(
        client, "viewer", "look@trial.treelife.local", organization_name="Showcase Org"
    )
    assert viewer.status_code == 201, viewer.text
    denied = client.post(
        "/api/v1/trees",
        json={
            "site_id": office_site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-03",
        },
        headers=login(client, "look@trial.treelife.local"),
    )
    assert denied.status_code == 403

    admin = register(client, "admin", "gov@trial.treelife.local")
    assert admin.status_code == 403, admin.text
    admin_headers = auth(accounts, "admin")
    audit = client.get("/api/v1/audit", headers=admin_headers)
    assert audit.status_code == 200
    admin_tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": office_site.json()["id"],
            "species_id": species["id"],
            "category": "fruit",
            "planting_date": "2026-03-04",
            "client_request_id": "reg-tree-admin",
        },
        headers=admin_headers,
    )
    assert admin_tree.status_code == 403

    still = client.get("/api/v1/auth/me", headers=auth(accounts))
    assert still.status_code == 200
    assert still.json()["role"] == "field_officer"


def test_officer_profile_saves_name_and_home(client):
    registered = register(client, "field_officer", "officer-profile@trial.treelife.local")
    assert registered.status_code == 201, registered.text
    headers = login(client, "officer-profile@trial.treelife.local")
    saved = client.patch(
        "/api/v1/profile",
        json={
            "display_name": "Officer Profile",
            "province": "Kigali",
            "district": "Gasabo",
            "sector": "Remera",
            "cell": "Rukiri I",
            "village": "Amahoro",
            "isibo": "Isibo 1",
            "household": "Household 2",
            "phone": "0788000000",
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["display_name"] == "Officer Profile"
    assert body["district"] == "Gasabo"
    assert body["household"] == "Household 2"
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["full_name"] == "Officer Profile"


def test_farmer_and_officer_can_save_a_profile_photo(client, accounts):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
    farmer = register(client, "farmer", "photo-farmer@trial.treelife.local")
    assert farmer.status_code == 201, farmer.text
    headers_by_role = {
        "field_officer": auth(accounts, "field_officer"),
        "farmer": login(client, "photo-farmer@trial.treelife.local"),
    }
    for headers in headers_by_role.values():
        saved = client.post(
            "/api/v1/profile/photo",
            headers=headers,
            files={"file": ("face.png", png, "image/png")},
        )
        assert saved.status_code == 200, saved.text
        loaded = client.get("/api/v1/profile/photo", headers=headers)
        assert loaded.status_code == 200
        assert loaded.content.startswith(b"\x89PNG")
        assert client.get("/api/v1/auth/me", headers=headers).json()["profile_photo_at"]
        removed = client.delete("/api/v1/profile/photo", headers=headers)
        assert removed.status_code == 204
        assert client.get("/api/v1/profile/photo", headers=headers).status_code == 404
    rejected = client.post(
        "/api/v1/profile/photo",
        headers=auth(accounts, "field_officer"),
        files={"file": ("note.txt", b"not a photo", "text/plain")},
    )
    assert rejected.status_code == 422
    denied = client.post(
        "/api/v1/profile/photo",
        headers=auth(accounts, "viewer"),
        files={"file": ("face.png", png, "image/png")},
    )
    assert denied.status_code == 403
