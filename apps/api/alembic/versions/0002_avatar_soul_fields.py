"""add avatar and soul profile fields

Revision ID: 0002_avatar_soul_fields
Revises: 0001_initial
Create Date: 2026-06-06
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "0002_avatar_soul_fields"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _json_column_type(dialect_name: str) -> str:
    return "JSONB" if dialect_name == "postgresql" else "JSON"


def _add_column_if_missing(table_name: str, column_name: str, column_type: str) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name not in existing:
        op.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def upgrade() -> None:
    bind = op.get_bind()
    json_type = _json_column_type(bind.dialect.name)

    _add_column_if_missing("joker_profiles", "soul_seed", "TEXT")
    _add_column_if_missing("joker_profiles", "soul_profile", json_type)
    _add_column_if_missing("joker_profiles", "avatar_recipe", json_type)
    _add_column_if_missing("joker_profiles", "face_descriptor", json_type)
    _add_column_if_missing("joker_profiles", "avatar_status", "VARCHAR(24) DEFAULT 'recipe_ready'")

    _add_column_if_missing("avatar_jobs", "input_descriptor", json_type)
    _add_column_if_missing("avatar_jobs", "result_recipe", json_type)
    _add_column_if_missing("avatar_jobs", "progress", "INTEGER DEFAULT 0")


def downgrade() -> None:
    # Keep downgrade non-destructive for hackathon data. Dropping JSON columns would
    # erase user-confirmed avatar recipes and soul settings.
    pass
