import asyncio
import json
import threading
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import live_stream


def test_dashboard_stream_requires_authentication():
    with TestClient(app) as test_client:
        response = test_client.get("/api/v1/dashboard/stream?once=true")
        assert response.status_code == 401


def test_live_hub_notifies_across_threads():
    async def run():
        hub = live_stream.DashboardLiveHub()
        queue = hub.subscribe()
        thread = threading.Thread(target=lambda: (hub.notify(), hub.notify()))
        thread.start()
        thread.join()
        version = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert version == 2
        assert queue.empty()
        hub.unsubscribe(queue)

    asyncio.run(run())


def test_stream_dashboard_events_emits_initial_change_and_heartbeat(monkeypatch):
    user_id = uuid.uuid4()
    counts = iter([100, 100, 105])

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, model, key):
            return SimpleNamespace(id=key, is_active=True, role="admin")

    monkeypatch.setattr(live_stream, "SessionLocal", lambda: FakeSession())

    def fake_snapshot(db, user, *, district=None, species_id=None):
        standing = next(counts)
        return {
            "standing_trees": standing,
            "recorded_trees": standing + 2,
            "healthy_trees": standing,
            "moderate_trees": 0,
            "critical_trees": 0,
            "generated_at": "2026-11-21T10:00:00Z",
        }

    monkeypatch.setattr(live_stream, "collect_live_snapshot", fake_snapshot)

    async def run():
        disconnected = False

        async def is_disconnected():
            return disconnected

        stream = live_stream.stream_dashboard_events(
            user_id=user_id,
            is_disconnected=is_disconnected,
            poll_interval_seconds=0.02,
            heartbeat_seconds=0.01,
        )
        first = await stream.__anext__()
        assert first.startswith("event: trees\n")
        payload_1 = json.loads(first.split("data: ", 1)[1].strip())
        assert payload_1["standing_trees"] == 100

        second = await stream.__anext__()
        assert second == ": heartbeat\n\n"

        live_stream.notify_dashboard_change()
        third = await stream.__anext__()
        payload_2 = json.loads(third.split("data: ", 1)[1].strip())
        assert payload_2["standing_trees"] == 105

        disconnected = True
        with pytest.raises(StopAsyncIteration):
            await stream.__anext__()

    asyncio.run(run())


def test_stream_dashboard_events_once_closes_immediately(monkeypatch):
    user_id = uuid.uuid4()

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, model, key):
            return SimpleNamespace(id=key, is_active=True, role="admin")

    monkeypatch.setattr(live_stream, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(
        live_stream,
        "collect_live_snapshot",
        lambda db, user, *, district=None, species_id=None: {
            "standing_trees": 42,
            "recorded_trees": 42,
            "healthy_trees": 40,
            "moderate_trees": 2,
            "critical_trees": 0,
            "generated_at": "2026-11-21T10:00:00Z",
        },
    )

    async def run():
        async def is_disconnected():
            return False

        items = [
            chunk
            async for chunk in live_stream.stream_dashboard_events(
                user_id=user_id,
                is_disconnected=is_disconnected,
                once=True,
            )
        ]
        assert len(items) == 1
        assert '"standing_trees": 42' in items[0]

    asyncio.run(run())
