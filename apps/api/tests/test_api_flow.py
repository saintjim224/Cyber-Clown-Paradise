import pytest
from httpx import ASGITransport, AsyncClient

from app.db import Base, create_db_schema, engine
from app.main import app


FACE_DESCRIPTOR = {
    "face_roundness": 0.72,
    "eye_spacing": 0.61,
    "eye_size": 0.58,
    "brow_lift": 0.66,
    "smile_curve": 0.74,
    "mouth_width": 0.68,
    "cheek_fullness": 0.71,
    "nose_scale": 0.46,
    "head_tilt": 0.55,
    "confidence": 0.92,
    "capture_quality": "good",
}


@pytest.fixture(autouse=True)
async def ensure_schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await create_db_schema()


@pytest.mark.asyncio
async def test_full_i_e_replay_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        i_resp = await client.post(
            "/api/jokers",
            json={
                "nickname": "阿眠",
                "mbti": "INFP",
                "constellation": "双鱼座",
                "social_energy": "I",
                "consent_media": False,
            },
        )
        assert i_resp.status_code == 200, i_resp.text
        i_joker = i_resp.json()

        e_resp = await client.post(
            "/api/jokers",
            json={
                "nickname": "小火箭",
                "mbti": "ENFP",
                "constellation": "狮子座",
                "social_energy": "E",
                "consent_media": True,
            },
        )
        assert e_resp.status_code == 200, e_resp.text
        e_joker = e_resp.json()

        balloon_resp = await client.post(
            "/api/balloons",
            json={"joker_id": i_joker["id"], "emo_text": "今天写 Bug 写到凌晨，感觉自己在和键盘互殴。"},
        )
        assert balloon_resp.status_code == 200, balloon_resp.text
        balloon = balloon_resp.json()
        assert balloon["status"] == "pending"

        match_resp = await client.post(
            "/api/heal/match",
            json={"healer_id": e_joker["id"], "action_type": "hug"},
        )
        assert match_resp.status_code == 200, match_resp.text
        assert match_resp.json()["balloon_id"] == balloon["id"]

        action_resp = await client.post(
            "/api/heal/actions",
            json={
                "healer_id": e_joker["id"],
                "balloon_id": balloon["id"],
                "action_type": "hug",
                "cheer_text": "键盘先扣押，快乐立刻保释。",
            },
        )
        assert action_resp.status_code == 200, action_resp.text

        replay_resp = await client.get(f"/api/replay/{i_joker['qr_token']}")
        assert replay_resp.status_code == 200, replay_resp.text
        replay = replay_resp.json()
        assert replay["joker"]["id"] == i_joker["id"]
        assert replay["actions"]
        assert replay["events"]


@pytest.mark.asyncio
async def test_joker_draft_and_edited_soul_creation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        draft_resp = await client.post(
            "/api/joker-drafts",
            json={
                "mbti": "INFP",
                "constellation": "双鱼座",
                "social_energy": "I",
                "soul_seed": "慢热、嘴硬心软、怕尴尬但爱讲冷笑话，不喜欢被逼着热场。",
                "face_descriptor": FACE_DESCRIPTOR,
            },
        )
        assert draft_resp.status_code == 200, draft_resp.text
        draft = draft_resp.json()
        assert draft["avatar_recipe"]["art_version"] == "native-clown-v1"
        assert draft["avatar_recipe"]["head_scale"] > 1.0
        assert draft["soul_profile"]["catchphrase"]
        assert draft["soul_profile"]["behavior_rules"]

        edited_soul = draft["soul_profile"] | {
            "catchphrase": "我先把尴尬藏进帽子里。",
            "sample_lines": ["我先把尴尬藏进帽子里。", "别急，今天先赢一厘米。"],
        }
        joker_resp = await client.post(
            "/api/jokers",
            json={
                "nickname": "慢热视频人",
                "mbti": "INFP",
                "constellation": "双鱼座",
                "social_energy": "I",
                "consent_media": False,
                "soul_seed": "慢热、嘴硬心软、怕尴尬但爱讲冷笑话，不喜欢被逼着热场。",
                "face_descriptor": FACE_DESCRIPTOR,
                "soul_profile": edited_soul,
                "avatar_recipe": draft["avatar_recipe"],
                "style_tokens": draft["style_tokens"],
                "verdict": "这只小丑替你热场，但不会替你越界。",
            },
        )
        assert joker_resp.status_code == 200, joker_resp.text
        joker = joker_resp.json()
        assert joker["soul_profile"]["catchphrase"] == "我先把尴尬藏进帽子里。"
        assert joker["avatar_recipe"] == draft["avatar_recipe"]
        assert joker["avatar_status"] == "recipe_ready"
        assert "face_descriptor" not in joker


@pytest.mark.asyncio
async def test_avatar_job_fallback_creation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        joker_resp = await client.post(
            "/api/jokers",
            json={
                "nickname": "图图",
                "mbti": "ENTP",
                "constellation": "水瓶座",
                "social_energy": "E",
                "consent_media": True,
            },
        )
        joker = joker_resp.json()
        job_resp = await client.post(
            "/api/avatar-jobs",
            json={"joker_id": joker["id"], "image_url": "https://example.com/clown.png"},
        )
        assert job_resp.status_code == 200, job_resp.text
        job = job_resp.json()
        assert job["status"] == "queued"
        assert job["provider"] == "recipe-render"
        assert job["progress"] == 0
        assert job["result_recipe"]["art_version"] == "native-clown-v1"
