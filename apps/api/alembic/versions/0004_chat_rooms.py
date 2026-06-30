"""add chat rooms and messages

Revision ID: 0004_chat_rooms
Revises: 0003_user_sessions
Create Date: 2026-06-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004_chat_rooms"
down_revision = "0003_user_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("chat_rooms"):
        op.create_table(
            "chat_rooms",
            sa.Column("id", sa.String(length=32), primary_key=True),
            sa.Column("room_type", sa.String(length=20), nullable=False),
            sa.Column("joker_a_id", sa.String(length=32), sa.ForeignKey("joker_profiles.id"), nullable=True),
            sa.Column("joker_b_id", sa.String(length=32), sa.ForeignKey("joker_profiles.id"), nullable=True),
            sa.Column("location_id", sa.String(length=50), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("room_type", "joker_a_id", "joker_b_id", name="ux_chat_room_private_pair"),
            sa.UniqueConstraint("room_type", "location_id", name="ux_chat_room_location"),
        )
        op.create_index("ix_chat_rooms_room_type", "chat_rooms", ["room_type"])
        op.create_index("ix_chat_rooms_joker_a_id", "chat_rooms", ["joker_a_id"])
        op.create_index("ix_chat_rooms_joker_b_id", "chat_rooms", ["joker_b_id"])
        op.create_index("ix_chat_rooms_location_id", "chat_rooms", ["location_id"])

    if not inspector.has_table("chat_messages"):
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.String(length=32), primary_key=True),
            sa.Column("room_id", sa.String(length=32), sa.ForeignKey("chat_rooms.id"), nullable=False),
            sa.Column("sender_id", sa.String(length=32), sa.ForeignKey("joker_profiles.id"), nullable=False),
            sa.Column("content", sa.String(length=500), nullable=False),
            sa.Column("content_safe", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_chat_messages_room_id", "chat_messages", ["room_id"])
        op.create_index("ix_chat_messages_sender_id", "chat_messages", ["sender_id"])
        op.create_index("ix_chat_messages_room_id_created_at", "chat_messages", ["room_id", "created_at"])


def downgrade() -> None:
    # Keep this non-destructive for hackathon data.
    pass
