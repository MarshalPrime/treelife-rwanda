"""Allow fertilizer, weeding, and environmental care on a tree."""

from collections.abc import Sequence

from alembic import op

revision: str = "0021_tree_care_types"
down_revision: str | None = "0020_remove_message_visit_date"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CARE_TYPES = (
    "pruning",
    "watering",
    "mulching",
    "pest_control",
    "staking",
    "fertilizer",
    "weeding",
    "environmental",
    "other",
)
PREVIOUS_TYPES = ("pruning", "watering", "mulching", "pest_control", "staking", "other")


def _check(values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"activity_type IN ({quoted})"


def upgrade() -> None:
    op.drop_constraint("ck_maintenance_type", "maintenance_activities", type_="check")
    op.create_check_constraint("ck_maintenance_type", "maintenance_activities", _check(CARE_TYPES))


def downgrade() -> None:
    op.drop_constraint("ck_maintenance_type", "maintenance_activities", type_="check")
    op.create_check_constraint(
        "ck_maintenance_type", "maintenance_activities", _check(PREVIOUS_TYPES)
    )
