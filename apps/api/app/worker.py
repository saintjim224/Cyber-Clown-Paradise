import asyncio

from app.config import get_settings
from app.db import SessionLocal, create_db_schema
from app.services import AvatarService, ChatService, generate_autonomous_event


async def run_forever() -> None:
    settings = get_settings()
    await create_db_schema()
    while True:
        async with SessionLocal() as session:
            await AvatarService(session).process_one()
            await generate_autonomous_event(session, settings)
            await ChatService(session).cleanup_stale_location_rooms()
        await asyncio.sleep(max(5, min(settings.autonomy_tick_seconds, 90)))


if __name__ == "__main__":
    asyncio.run(run_forever())
