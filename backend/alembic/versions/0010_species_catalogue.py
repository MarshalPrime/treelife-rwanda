"""Add species profile fields and load the starter catalogue.

Existing species keep their common name and category. Blank profile fields are
filled. Genus names stay unapproved. This is not an official national list.

Revision ID: 0010_species_catalogue
Revises: 0009_planting_details
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0010_species_catalogue"
down_revision: str | None = "0009_planting_details"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("species", sa.Column("other_local_names", JSONB(), nullable=True))
    op.add_column("species", sa.Column("growth_form", sa.String(20), nullable=True))
    op.add_column("species", sa.Column("classifications", JSONB(), nullable=True))
    op.add_column("species", sa.Column("primary_uses", sa.Text(), nullable=True))
    op.add_column("species", sa.Column("rwanda_suitability", sa.Text(), nullable=True))
    op.add_column("species", sa.Column("data_source", sa.Text(), nullable=True))
    op.add_column(
        "species",
        sa.Column(
            "review_status",
            sa.String(20),
            nullable=False,
            server_default="needs_review",
        ),
    )
    op.add_column(
        "species",
        sa.Column("taxon_rank", sa.String(20), nullable=False, server_default="species"),
    )
    op.create_check_constraint(
        "ck_species_growth_form",
        "species",
        "growth_form IS NULL OR growth_form IN ('tree', 'shrub', 'herb', 'vine')",
    )
    op.create_check_constraint(
        "ck_species_review_status",
        "species",
        "review_status IN ('verified', 'needs_review', 'draft', 'rejected')",
    )
    op.create_check_constraint(
        "ck_species_taxon_rank",
        "species",
        "taxon_rank IN ('species', 'genus')",
    )
    from app.data.species_catalogue import apply_species_catalogue

    apply_species_catalogue(op.get_bind())


def downgrade() -> None:
    op.drop_constraint("ck_species_taxon_rank", "species")
    op.drop_constraint("ck_species_review_status", "species")
    op.drop_constraint("ck_species_growth_form", "species")
    op.drop_column("species", "taxon_rank")
    op.drop_column("species", "review_status")
    op.drop_column("species", "data_source")
    op.drop_column("species", "rwanda_suitability")
    op.drop_column("species", "primary_uses")
    op.drop_column("species", "classifications")
    op.drop_column("species", "growth_form")
    op.drop_column("species", "other_local_names")
