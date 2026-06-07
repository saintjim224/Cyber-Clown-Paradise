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


def joker_payload(
    nickname: str = "阿眠",
    mbti: str = "INFP",
    constellation: str = "双鱼座",
    social_energy: str = "I",
):
    return {
        "nickname": nickname,
        "mbti": mbti,
        "constellation": constellation,
        "social_energy": social_energy,
        "consent_media": False,
    }


@pytest.fixture(autouse=True)
async def ensure_schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await create_db_schema()


@pytest.mark.asyncio
async def test_full_i_e_replay_flow_uses_session_owned_jokers():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as i_client,
        AsyncClient(transport=transport, base_url="http://test") as e_client,
    ):
        i_resp = await i_client.post("/api/jokers", json=joker_payload())
        assert i_resp.status_code == 200, i_resp.text
        i_joker = i_resp.json()

        e_resp = await e_client.post(
            "/api/jokers",
            json=joker_payload("小火箭", "ENFP", "狮子座", "E"),
        )
        assert e_resp.status_code == 200, e_resp.text
        e_joker = e_resp.json()
        assert e_joker["id"] != i_joker["id"]

        balloon_resp = await i_client.post(
            "/api/balloons",
            json={
                "joker_id": e_joker["id"],
                "emo_text": "今天写 Bug 写到凌晨，感觉自己在和键盘互殴。",
            },
        )
        assert balloon_resp.status_code == 200, balloon_resp.text
        balloon = balloon_resp.json()
        assert balloon["owner_id"] == i_joker["id"]
        assert balloon["status"] == "pending"

        match_resp = await e_client.post(
            "/api/heal/match",
            json={"healer_id": i_joker["id"], "action_type": "hug"},
        )
        assert match_resp.status_code == 200, match_resp.text
        match = match_resp.json()
        assert match["balloon_id"] == balloon["id"]
        assert match["owner_id"] == i_joker["id"]

        action_resp = await e_client.post(
            "/api/heal/actions",
            json={
                "healer_id": i_joker["id"],
                "balloon_id": balloon["id"],
                "action_type": "hug",
                "cheer_text": "键盘先扣押，快乐立刻保释。",
            },
        )
        assert action_resp.status_code == 200, action_resp.text
        action = action_resp.json()
        assert action["healer_id"] == e_joker["id"]

        replay_resp = await i_client.get(f"/api/replay/{i_joker['qr_token']}")
        assert replay_resp.status_code == 200, replay_resp.text
        replay = replay_resp.json()
        assert replay["joker"]["id"] == i_joker["id"]
        assert replay["actions"]
        assert replay["events"]


@pytest.mark.asyncio
async def test_same_session_updates_one_joker_in_place():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first_resp = await client.post("/api/jokers", json=joker_payload("初版小丑"))
        assert first_resp.status_code == 200, first_resp.text
        first = first_resp.json()

        second_resp = await client.post(
            "/api/jokers",
            json=joker_payload("新版小丑", "ENFP", "狮子座", "E"),
        )
        assert second_resp.status_code == 200, second_resp.text
        second = second_resp.json()

        assert second["id"] == first["id"]
        assert second["qr_token"] == first["qr_token"]
        assert second["nickname"] == "新版小丑"
        assert second["social_energy"] == "E"


@pytest.mark.asyncio
async def test_separate_sessions_get_separate_jokers():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as first_client,
        AsyncClient(transport=transport, base_url="http://test") as second_client,
    ):
        first_resp = await first_client.post("/api/jokers", json=joker_payload("一号"))
        second_resp = await second_client.post("/api/jokers", json=joker_payload("二号"))

        assert first_resp.status_code == 200, first_resp.text
        assert second_resp.status_code == 200, second_resp.text
        assert first_resp.json()["id"] != second_resp.json()["id"]


@pytest.mark.asyncio
async def test_no_active_joker_operations_return_conflict():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        balloon_resp = await client.post("/api/balloons", json={"emo_text": "先来一颗气球"})
        match_resp = await client.post("/api/heal/match", json={"action_type": "hug"})
        action_resp = await client.post(
            "/api/heal/actions",
            json={"balloon_id": "bal_missing", "action_type": "hug", "cheer_text": "接住"},
        )

        assert balloon_resp.status_code == 409, balloon_resp.text
        assert balloon_resp.json()["detail"] == "no_active_joker"
        assert match_resp.status_code == 409, match_resp.text
        assert match_resp.json()["detail"] == "no_active_joker"
        assert action_resp.status_code == 409, action_resp.text
        assert action_resp.json()["detail"] == "no_active_joker"


@pytest.mark.asyncio
async def test_user_cannot_match_or_heal_own_balloon():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        joker_resp = await client.post("/api/jokers", json=joker_payload("独自投放", social_energy="E"))
        assert joker_resp.status_code == 200, joker_resp.text

        balloon_resp = await client.post("/api/balloons", json={"emo_text": "E 人也可以投放气球"})
        assert balloon_resp.status_code == 200, balloon_resp.text
        balloon = balloon_resp.json()

        match_resp = await client.post("/api/heal/match", json={"action_type": "cheer"})
        assert match_resp.status_code == 404, match_resp.text
        assert match_resp.json()["detail"] == "no_pending_balloon"

        action_resp = await client.post(
            "/api/heal/actions",
            json={"balloon_id": balloon["id"], "action_type": "cheer", "cheer_text": "自己接自己"},
        )
        assert action_resp.status_code == 403, action_resp.text
        assert action_resp.json()["detail"] == "cannot_heal_own_balloon"


@pytest.mark.asyncio
async def test_avatar_job_requires_owned_joker():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as owner_client,
        AsyncClient(transport=transport, base_url="http://test") as other_client,
    ):
        joker_resp = await owner_client.post(
            "/api/jokers",
            json=joker_payload("图图", "ENTP", "水瓶座", "E"),
        )
        assert joker_resp.status_code == 200, joker_resp.text
        joker = joker_resp.json()

        forbidden_resp = await other_client.post(
            "/api/avatar-jobs",
            json={"joker_id": joker["id"], "image_url": "https://example.com/clown.png"},
        )
        assert forbidden_resp.status_code == 403, forbidden_resp.text
        assert forbidden_resp.json()["detail"] == "joker_not_owned"

        job_resp = await owner_client.post(
            "/api/avatar-jobs",
            json={"joker_id": joker["id"], "image_url": "https://example.com/clown.png"},
        )
        assert job_resp.status_code == 200, job_resp.text
        job = job_resp.json()
        assert job["status"] == "queued"
        assert job["provider"] == "recipe-render"
        assert job["progress"] == 0
        assert job["result_recipe"]["art_version"] == "native-clown-v1"


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
async def test_current_joker_and_enter_token_restore_session():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as owner_client,
        AsyncClient(transport=transport, base_url="http://test") as scan_client,
    ):
        missing_resp = await scan_client.get("/api/jokers/me")
        assert missing_resp.status_code == 409, missing_resp.text
        assert missing_resp.json()["detail"] == "no_active_joker"

        first_resp = await owner_client.post(
            "/api/jokers",
            json=joker_payload("Entry Clown", "INFP", "Pisces", "I"),
        )
        assert first_resp.status_code == 200, first_resp.text
        joker = first_resp.json()

        me_resp = await owner_client.get("/api/jokers/me")
        assert me_resp.status_code == 200, me_resp.text
        assert me_resp.json()["id"] == joker["id"]

        enter_resp = await scan_client.post(f"/api/jokers/enter/{joker['qr_token']}")
        assert enter_resp.status_code == 200, enter_resp.text
        assert enter_resp.json()["id"] == joker["id"]

        restored_resp = await scan_client.get("/api/jokers/me")
        assert restored_resp.status_code == 200, restored_resp.text
        assert restored_resp.json()["id"] == joker["id"]

        balloon_resp = await scan_client.post("/api/balloons", json={"emo_text": "scan drop balloon"})
        assert balloon_resp.status_code == 200, balloon_resp.text
        assert balloon_resp.json()["owner_id"] == joker["id"]


@pytest.mark.asyncio
async def test_enter_token_rejects_invalid_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        enter_resp = await client.post("/api/jokers/enter/not-a-token")
        assert enter_resp.status_code == 404, enter_resp.text
        assert enter_resp.json()["detail"] == "token_not_found"
