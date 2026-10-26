"""Rules shared by the API and unit tests.

Coordinates are decimal degrees in WGS 84 (SRID 4326).
Latitude is the north-south value. Longitude is the east-west value.
"""

import math
import re
from datetime import date, timedelta

REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,80}")
MIN_RECORD_DATE = date(1950, 1, 1)
MAX_QUANTITY = 100_000
MAX_AREA_HECTARES = 100_000

# Approximate national extent, used only as a non-blocking UI hint.
# The API accepts any globally valid coordinate so a boundary error cannot
# reject a legitimate border record before domain experts confirm the rule.
RWANDA_LATITUDE = (-2.92, -1.03)
RWANDA_LONGITUDE = (28.85, 30.90)


def check_coordinate_pair(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("Provide both latitude and longitude, or leave both empty.")
    if latitude is None or longitude is None:
        return
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("Coordinates must be finite numbers.")
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90.")
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180.")


def outside_rwanda(latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return False
    lat_min, lat_max = RWANDA_LATITUDE
    lon_min, lon_max = RWANDA_LONGITUDE
    return not (lat_min <= latitude <= lat_max and lon_min <= longitude <= lon_max)


def check_positive_number(value: float, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a number greater than 0.")
    if value <= 0 or value > 1_000_000:
        raise ValueError(f"{label} must be greater than 0 and at most 1000000.")


def check_measure(quantity: float, unit: str) -> None:
    check_positive_number(quantity, "Quantity")
    if unit == "count" and abs(quantity - round(quantity)) > 1e-6:
        raise ValueError("Fruit count must be a whole number.")


def check_quantity(quantity: int) -> None:
    if not isinstance(quantity, int) or isinstance(quantity, bool):
        raise ValueError("Quantity must be a whole number from 1 to 100000.")
    if quantity < 1 or quantity > MAX_QUANTITY:
        raise ValueError("Quantity must be a whole number from 1 to 100000.")


def check_historical_date(value: date, label: str) -> None:
    if value < MIN_RECORD_DATE:
        raise ValueError(f"{label} must be on or after 1950-01-01.")
    if value > date.today() + timedelta(days=1):
        raise ValueError(f"{label} cannot be in the future.")


def check_area(area: float | None) -> None:
    if area is None:
        return
    if not math.isfinite(area) or area < 0 or area > MAX_AREA_HECTARES:
        raise ValueError("Area must be between 0 and 100000 hectares.")


def check_request_id(value: str | None) -> None:
    if value is None:
        return
    if REQUEST_ID_PATTERN.fullmatch(value) is None:
        raise ValueError(
            "Request id must be 8–80 characters and use only letters, numbers, hyphens, or underscores."
        )


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
