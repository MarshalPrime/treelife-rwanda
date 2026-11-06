from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import make_url

from alembic import command
from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import User

TRUNCATE = (
    "TRUNCATE audit_logs, sales, harvests, maintenance_activities, growth_measurements, "
    "distributions, seedling_lots, advisories, lifecycle_events, individual_trees, "
    "planting_batches, planting_sites, farmers, users, organizations, species_varieties, species "
    "RESTART IDENTITY CASCADE"
)


@pytest.fixture(scope="session")
def database():
    database_name = make_url(get_settings().database_url).database or ""
    if not database_name.endswith("_test"):
        pytest.fail(
            "Refusing to run integration tests against a non-test database. "
            "Set DATABASE_URL to a database whose name ends in _test."
        )
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    command.upgrade(config, "head")
    yield


@pytest.fixture
def client(database):
    with SessionLocal() as db:
        db.execute(text(TRUNCATE))
        db.commit()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def accounts(client):
    password = "test-password-123"
    people = [
        ("admin", "admin@test.treelife.local", "Test Admin"),
        ("field_officer", "officer@test.treelife.local", "Test Officer"),
        ("viewer", "viewer@test.treelife.local", "Test Viewer"),
    ]
    created = {}
    with SessionLocal() as db:
        for role, email, name in people:
            user = User(
                email=email,
                full_name=name,
                password_hash=hash_password(password),
                role=role,
                is_active=True,
            )
            db.add(user)
            db.flush()
            created[role] = {"email": email, "password": password, "id": str(user.id)}
        inactive = User(
            email="inactive@test.treelife.local",
            full_name="Inactive User",
            password_hash=hash_password(password),
            role="viewer",
            is_active=False,
        )
        db.add(inactive)
        db.commit()
    headers = {}
    for role, info in created.items():
        response = client.post(
            "/api/v1/auth/login",
            json={"email": info["email"], "password": info["password"]},
        )
        assert response.status_code == 200, response.text
        headers[role] = {"Authorization": f"Bearer {response.json()['access_token']}"}
    created["headers"] = headers
    created["inactive_password"] = password
    return created


def auth(accounts, role="field_officer"):
    return accounts["headers"][role]


def make_species(client, accounts, scientific_name="Persea americana", common_name="Avocado"):
    response = client.post(
        "/api/v1/species",
        json={"scientific_name": scientific_name, "common_name": common_name, "category": "fruit"},
        headers=auth(accounts, "admin"),
    )
    assert response.status_code == 201, response.text
    return response.json()


def make_site(client, accounts, **overrides):
    payload = {
        "name": "Hill orchard",
        "site_type": "orchard",
        "district": "Bugesera",
        "province": "Eastern Province",
        "latitude": -1.2345,
        "longitude": 30.6789,
        "client_request_id": "site-request-0001",
    }
    payload.update(overrides)
    response = client.post("/api/v1/sites", json=payload, headers=auth(accounts))
    return response
