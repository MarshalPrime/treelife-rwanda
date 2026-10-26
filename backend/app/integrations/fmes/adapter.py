"""Future FMES boundary.

This module is not used to contact the Forestry Management and Evaluation System.
Registration commits succeed without it. No official endpoint is configured.
"""

from __future__ import annotations


class FmesAdapter:
    """Placeholder adapter. It does not send data anywhere."""

    def export_registration(self, payload: dict) -> dict:
        raise NotImplementedError(
            "FMES integration is not configured. Registration stays inside TreeLife."
        )


def dispatch_registration_hook(entity_type: str, entity_id: str) -> None:
    """Reserved seam after a local commit. Intentionally does not call FMES."""

    return None
