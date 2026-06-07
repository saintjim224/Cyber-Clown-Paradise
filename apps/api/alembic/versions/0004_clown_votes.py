"""add clown votes

Revision ID: 0004_clown_votes
Revises: 0003_user_sessions
Create Date: 2026-06-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004_clown_votes"
down_revision = "0003_user_sessions"
branch_labels = None
depends_on = None


def _create_index_if_missing(table_name: str, index_name: str, column_name: str) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name not in existing:
        op.create_index(index_name, table_name, [column_name])


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("clown_votes"):
        op.create_table(
            "clown_votes",
            sa.Column("voter_session_id", sa.String(length=64), sa.ForeignKey("user_sessions.id"), primary_key=True),
            sa.Column("clown_id", sa.String(length=96), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
    _create_index_if_missing("clown_votes", "ix_clown_votes_clown_id", "clown_id")


def downgrade() -> None:
    # Keep votes around during hackathon demos; dropping them would reset the live board.
    pass
