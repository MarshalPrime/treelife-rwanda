#!/usr/bin/env python3
"""Smoke test for a running TreeLife API.

Requires the development seed. Creates synthetic smoke records and reads them back.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid

API = os.environ.get("API_URL", "http://localhost:8000")
EMAIL = os.environ.get("SMOKE_EMAIL", "officer@demo.treelife.local")
PASSWORD = os.environ.get("SMOKE_PASSWORD", "demo-officer-pass1")


def request(path: str, method: str = "GET", body: dict | None = None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise SystemExit(f"{method} {path} failed with {exc.code}: {detail}") from exc


def main() -> None:
    status, health = request("/api/v1/health")
    assert status == 200 and health["status"] == "ok", health
    print(f"health ok, postgis {health['postgis']}")

    _, token_body = request("/api/v1/auth/login", "POST", {"email": EMAIL, "password": PASSWORD})
    token = token_body["access_token"]
    _, species = request("/api/v1/species", token=token)
    if not species:
        raise SystemExit("No species are loaded. Run python -m app.seed first.")
    species_id = species[0]["id"]
    suffix = uuid.uuid4().hex[:12]

    _, site = request(
        "/api/v1/sites",
        "POST",
        {
            "name": f"SMOKE site {suffix}",
            "site_type": "urban_plot",
            "district": "Smoke",
            "latitude": -1.95,
            "longitude": 30.06,
            "notes": "SYNTHETIC smoke-test record. Not a field observation.",
            "client_request_id": f"smoke-site-{suffix}",
        },
        token,
    )
    _, tree = request(
        "/api/v1/trees",
        "POST",
        {
            "site_id": site["id"],
            "species_id": species_id,
            "category": "fruit",
            "planting_date": "2026-03-01",
            "latitude": -1.9501,
            "longitude": 30.0601,
            "client_request_id": f"smoke-tree-{suffix}",
        },
        token,
    )
    _, batch = request(
        "/api/v1/batches",
        "POST",
        {
            "site_id": site["id"],
            "species_id": species_id,
            "category": "fruit",
            "planting_date": "2026-03-01",
            "quantity": 5,
            "client_request_id": f"smoke-batch-{suffix}",
        },
        token,
    )
    _, fetched = request(f"/api/v1/trees/{tree['id']}", token=token)
    assert fetched["id"] == tree["id"]
    _, mapped = request("/api/v1/map", token=token)
    assert any(feature["properties"]["id"] == tree["id"] for feature in mapped["features"])
    print(f"smoke ok: {site['public_code']} {tree['public_code']} {batch['public_code']}")


if __name__ == "__main__":
    main()
