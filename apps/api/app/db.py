from collections.abc import AsyncIterator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_async_engine(settings.sqlalchemy_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def create_db_schema() -> None:
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_compatible_columns)


def _json_column_type(dialect_name: str) -> str:
    return "JSONB" if dialect_name == "postgresql" else "JSON"


def _ensure_compatible_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    dialect_name = sync_conn.dialect.name
    json_type = _json_column_type(dialect_name)
    additions = {
        "joker_profiles": {
            "owner_session_id": "VARCHAR(64)",
            "desired_poi_id": "VARCHAR(48)",
            "soul_seed": "TEXT",
            "soul_profile": json_type,
            "avatar_recipe": json_type,
            "face_descriptor": json_type,
            "avatar_status": "VARCHAR(24) DEFAULT 'recipe_ready'",
            "energy_score": "INTEGER DEFAULT 0",
        },
        "heal_actions": {
            "recipient_id": "VARCHAR(32)",
            "energy_delta_healer": "INTEGER DEFAULT 1",
            "energy_delta_owner": "INTEGER DEFAULT 2",
            "affinity_delta": "INTEGER DEFAULT 3",
        },
        "avatar_jobs": {
            "input_descriptor": json_type,
            "result_recipe": json_type,
            "progress": "INTEGER DEFAULT 0",
        },
    }
    for table_name, column_defs in additions.items():
        if not inspector.has_table(table_name):
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_type in column_defs.items():
            if column_name in existing:
                continue
            sync_conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
    _ensure_index(sync_conn, inspector, "joker_profiles", "ix_joker_profiles_owner_session_id", "owner_session_id")
    _ensure_index(
        sync_conn,
        inspector,
        "joker_profiles",
        "ux_joker_profiles_owner_session_id",
        "owner_session_id",
        unique=True,
    )
    _ensure_index(sync_conn, inspector, "heal_actions", "ix_heal_actions_recipient_id", "recipient_id")


def _ensure_index(sync_conn, inspector, table_name: str, index_name: str, column_name: str, unique: bool = False) -> None:
    if not inspector.has_table(table_name):
        return
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name in existing:
        return
    uniqueness = "UNIQUE " if unique else ""
    sync_conn.execute(text(f"CREATE {uniqueness}INDEX {index_name} ON {table_name} ({column_name})"))
