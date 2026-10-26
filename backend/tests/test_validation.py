from datetime import date, timedelta

import pytest

from app.domain.validation import (
    check_coordinate_pair,
    check_historical_date,
    check_quantity,
    check_request_id,
    outside_rwanda,
)
from app.integrations.fmes.adapter import FmesAdapter, dispatch_registration_hook
from app.services.common import make_public_code


def test_coordinate_pair_rejects_out_of_range_latitude():
    with pytest.raises(ValueError, match="Latitude"):
        check_coordinate_pair(91, 30)


def test_coordinate_pair_rejects_out_of_range_longitude():
    with pytest.raises(ValueError, match="Longitude"):
        check_coordinate_pair(-1.9, 200)


def test_coordinate_pair_requires_both_values():
    with pytest.raises(ValueError, match="both"):
        check_coordinate_pair(-1.9, None)


def test_coordinate_pair_accepts_empty_and_global_points():
    check_coordinate_pair(None, None)
    check_coordinate_pair(0.31, 32.58)
    assert outside_rwanda(0.31, 32.58) is True
    assert outside_rwanda(-1.94, 30.06) is False


def test_quantity_bounds():
    check_quantity(1)
    check_quantity(100000)
    with pytest.raises(ValueError, match="Quantity"):
        check_quantity(0)
    with pytest.raises(ValueError, match="Quantity"):
        check_quantity(-4)
    with pytest.raises(ValueError, match="Quantity"):
        check_quantity(100001)


def test_historical_date_bounds():
    check_historical_date(date(2026, 1, 1), "Planting date")
    with pytest.raises(ValueError, match="1950"):
        check_historical_date(date(1940, 1, 1), "Planting date")
    with pytest.raises(ValueError, match="future"):
        check_historical_date(date.today() + timedelta(days=10), "Planting date")


def test_request_id_shape():
    check_request_id(None)
    check_request_id("synthetic-demo-site-urban-01")
    with pytest.raises(ValueError, match="Request id"):
        check_request_id("short")


def test_public_code_format():
    code = make_public_code("TREE")
    prefix, year, suffix = code.split("-")
    assert prefix == "TREE"
    assert len(year) == 4
    assert len(suffix) == 6


def test_fmes_adapter_is_not_configured():
    with pytest.raises(NotImplementedError, match="not configured"):
        FmesAdapter().export_registration({"example": "synthetic"})
    assert (
        dispatch_registration_hook("individual_tree", "00000000-0000-0000-0000-000000000000")
        is None
    )
