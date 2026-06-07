"""add anonymous user sessions

Revision ID: 0003_user_sessions
Revises: 0002_avatar_soul_fields
Create Date: 2026-06-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "0003_user_sessions"
down_revision = "0002_avatar_soul_fields"
branch_labels = None
depends_on = None


def _add_column_if_missing(table_name: str, column_name: str, column_type: str) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name not in existing:
        op.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def _create_index_if_missing(table_name: str, index_name: str, column_name: str, unique: bool = False) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name in existing:
        return
    uniqueness = "UNIQUE " if unique else ""
    op.execute(text(f"CREATE {uniqueness}INDEX {index_name} ON {table_name} ({column_name})"))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if inspector.has_table("joker_profiles"):
        _add_column_if_missing("joker_profiles", "owner_session_id", "VARCHAR(64)")
        _create_index_if_missing("joker_profiles", "ix_joker_profiles_owner_session_id", "owner_session_id")
        _create_index_if_missing(
            "joker_profiles",
            "ux_joker_profiles_owner_session_id",
            "owner_session_id",
            unique=True,
        )


def downgrade() -> None:
    # Keep this non-destructive so existing hackathon jokers and sessions survive.
    pass
