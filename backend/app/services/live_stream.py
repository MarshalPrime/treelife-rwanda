"""Live dashboard stream hub and lightweight tree-count snapshot."""

from __future__ import annotations

import asyncio
import json
import threading
import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import User
from app.services.common import utcnow
from app.services.dashboard import (
    filter_inventory,
    health_amounts,
    read_inventory,
    standing_amount,
)


class DashboardLiveHub:
    """Thread-safe in-process pub/sub hub for dashboard tree updates."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[asyncio.Queue[int], asyncio.AbstractEventLoop] = {}
        self._version = 0

    def subscribe(self) -> asyncio.Queue[int]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[int] = asyncio.Queue()
        with self._lock:
            self._subscribers[queue] = loop
        return queue

    def unsubscribe(self, queue: asyncio.Queue[int]) -> None:
        with self._lock:
            self._subscribers.pop(queue, None)

    def notify(self) -> int:
        with self._lock:
            self._version += 1
            version = self._version
            items = list(self._subscribers.items())
        for queue, loop in items:
            try:
                loop.call_soon_threadsafe(_enqueue_latest, queue, version)
            except RuntimeError:
                self.unsubscribe(queue)
        return version


def _enqueue_latest(queue: asyncio.Queue[int], version: int) -> None:
    while not queue.empty():
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            break
    queue.put_nowait(version)


hub = DashboardLiveHub()


def notify_dashboard_change() -> None:
    """Wake connected live dashboard streams after a record change."""
    hub.notify()


def collect_live_snapshot(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    cleaned_district = district.strip() if district and district.strip() else None
    all_inventory = read_inventory(db, user)
    inventory = filter_inventory(all_inventory, cleaned_district, species_id)
    healthy, moderate, critical = health_amounts(inventory)
    return {
        "standing_trees": sum(standing_amount(row) for row in inventory.plantings),
        "recorded_trees": len(inventory.trees) + sum(row.quantity for row in inventory.batches),
        "healthy_trees": healthy,
        "moderate_trees": moderate,
        "critical_trees": critical,
        "generated_at": utcnow().isoformat(),
    }


def _snapshot_signature(snapshot: dict[str, Any]) -> tuple[int, int, int, int, int]:
    return (
        int(snapshot["standing_trees"]),
        int(snapshot["recorded_trees"]),
        int(snapshot["healthy_trees"]),
        int(snapshot["moderate_trees"]),
        int(snapshot["critical_trees"]),
    )


def format_sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


async def stream_dashboard_events(
    *,
    user_id: uuid.UUID,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
    is_disconnected,
    once: bool = False,
    poll_interval_seconds: float = 5.0,
    heartbeat_seconds: float = 15.0,
) -> AsyncIterator[str]:
    """Yield SSE events whenever live tree counts change, with periodic heartbeats."""

    def read_current() -> dict[str, Any] | None:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            if user is None or not user.is_active:
                return None
            return collect_live_snapshot(db, user, district=district, species_id=species_id)

    queue = hub.subscribe()
    try:
        initial = await asyncio.to_thread(read_current)
        if initial is None:
            return
        last_signature = _snapshot_signature(initial)
        yield format_sse_event("trees", initial)
        if once:
            return

        loop = asyncio.get_running_loop()
        last_emit = loop.time()
        while not await is_disconnected():
            try:
                await asyncio.wait_for(queue.get(), timeout=poll_interval_seconds)
                while not queue.empty():
                    queue.get_nowait()
            except TimeoutError:
                pass
            if await is_disconnected():
                break

            snapshot = await asyncio.to_thread(read_current)
            if snapshot is None:
                break
            signature = _snapshot_signature(snapshot)
            now = loop.time()
            if signature != last_signature:
                last_signature = signature
                last_emit = now
                yield format_sse_event("trees", snapshot)
            elif now - last_emit >= heartbeat_seconds:
                last_emit = now
                yield ": heartbeat\n\n"
    finally:
        hub.unsubscribe(queue)
