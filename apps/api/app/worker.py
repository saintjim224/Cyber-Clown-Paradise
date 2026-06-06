import asyncio
import logging

from app.config import get_settings
from app.db import SessionLocal, create_db_schema
from app.services import AvatarService, generate_autonomous_event

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cyberjoker-worker")


async def run_forever() -> None:
    settings = get_settings()
    await create_db_schema()
    while True:
        async with SessionLocal() as session:
            avatar = await AvatarService(session).process_one()
            if avatar:
                logger.info("avatar job %s moved to %s", avatar.id, avatar.status)
            event = await generate_autonomous_event(session, settings)
            if event:
                logger.info("autonomous event %s generated", event.id)
        await asyncio.sleep(max(5, min(settings.autonomy_tick_seconds, 90)))


if __name__ == "__main__":
    asyncio.run(run_forever())
