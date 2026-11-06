"""Published Rwanda place names, from province down to village.

The file is the NISR List of Villages (2019-07-03), released CC-BY-4.0.
Isibo and household are not in that list, so those stay as text on the tree.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "locations.json"


@lru_cache
def _provinces() -> tuple[dict, ...]:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return tuple(payload["provinces"])


def _match(items: list[dict] | tuple[dict, ...], name: str | None) -> dict | None:
    if not name or not name.strip():
        return None
    wanted = name.strip().casefold()
    return next((item for item in items if item["name"].casefold() == wanted), None)


def _names(items: list[dict] | tuple[dict, ...]) -> list[str]:
    return [item["name"] for item in items]


def child_places(
    province: str | None = None,
    district: str | None = None,
    sector: str | None = None,
    cell: str | None = None,
) -> tuple[str, list[str]]:
    provinces = _provinces()
    if not province:
        return "province", _names(provinces)
    found_province = _match(provinces, province)
    if found_province is None:
        return "district", []
    if not district:
        return "district", _names(found_province["districts"])
    found_district = _match(found_province["districts"], district)
    if found_district is None:
        return "sector", []
    if not sector:
        return "sector", _names(found_district["sectors"])
    found_sector = _match(found_district["sectors"], sector)
    if found_sector is None:
        return "cell", []
    if not cell:
        return "cell", _names(found_sector["cells"])
    found_cell = _match(found_sector["cells"], cell)
    if found_cell is None:
        return "village", []
    return "village", list(found_cell["villages"])
