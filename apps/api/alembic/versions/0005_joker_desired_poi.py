"""add desired POI for joker profiles

Revision ID: 0005_joker_desired_poi
Revises: 0004_clown_votes
Create Date: 2026-06-07
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "0005_joker_desired_poi"
down_revision = "0004_clown_votes"
branch_labels = None
depends_on = None


def _add_column_if_missing(table_name: str, column_name: str, column_type: str) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name not in existing:
        op.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("joker_profiles"):
        _add_column_if_missing("joker_profiles", "desired_poi_id", "VARCHAR(48)")


def downgrade() -> None:
    # Keep non-destructive for live hackathon data and old local demo DBs.
    pass
