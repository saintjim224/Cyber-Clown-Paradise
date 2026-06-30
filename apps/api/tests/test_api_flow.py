import os
from contextlib import AsyncExitStack
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient

import app.services as services
from app.db import Base, SessionLocal, create_db_schema, engine
from app.main import app
from app.models import ChatRoom


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
    desired_poi_id: str = "lj-yuxiu-lake",
):
    return {
        "nickname": nickname,
        "mbti": mbti,
        "constellation": constellation,
        "social_energy": social_energy,
        "desired_poi_id": desired_poi_id,
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
        assert match["balloon_summary"] == balloon["safe_summary"]
        assert match["owner"]["id"] == i_joker["id"]

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
        assert action["recipient_id"] == i_joker["id"]
        assert action["energy_delta_healer"] == 1
        assert action["energy_delta_owner"] == 2
        assert action["affinity_delta"] == 3

        second_balloon_resp = await i_client.post(
            "/api/balloons",
            json={"emo_text": "第二颗气球，想看看会不会有人回来看我。"},
        )
        assert second_balloon_resp.status_code == 200, second_balloon_resp.text
        second_balloon = second_balloon_resp.json()

        second_match_resp = await e_client.post("/api/heal/match", json={"action_type": "dance"})
        assert second_match_resp.status_code == 200, second_match_resp.text
        second_match = second_match_resp.json()
        assert second_match["balloon_id"] == second_balloon["id"]

        second_action_resp = await e_client.post(
            "/api/heal/actions",
            json={
                "balloon_id": second_balloon["id"],
                "action_type": "dance",
                "cheer_text": "原地转两圈，坏心情自动退场。",
            },
        )
        assert second_action_resp.status_code == 200, second_action_resp.text

        replay_resp = await i_client.get(f"/api/replay/{i_joker['qr_token']}")
        assert replay_resp.status_code == 200, replay_resp.text
        replay = replay_resp.json()
        assert replay["joker"]["id"] == i_joker["id"]
        assert replay["actions"]
        assert replay["events"]
        assert replay["energy_score"] == 4
        assert replay["joker"]["energy_score"] == 4
        assert len(replay["received_replies"]) == 2
        assert replay["received_replies"][0]["responder"]["id"] == e_joker["id"]
        assert replay["received_replies"][0]["recipient"]["id"] == i_joker["id"]
        assert replay["relationships"][0]["joker"]["id"] == e_joker["id"]
        assert replay["relationships"][0]["affinity_score"] == 6
        assert replay["relationships"][0]["interaction_count"] == 2

        e_replay_resp = await e_client.get(f"/api/replay/{e_joker['qr_token']}")
        assert e_replay_resp.status_code == 200, e_replay_resp.text
        e_replay = e_replay_resp.json()
        assert e_replay["energy_score"] == 2
        assert len(e_replay["sent_replies"]) == 2
        assert e_replay["sent_replies"][0]["recipient"]["id"] == i_joker["id"]


@pytest.mark.asyncio
async def test_targeted_match_only_returns_selected_jokers_pending_balloon():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as target_a_client,
        AsyncClient(transport=transport, base_url="http://test") as target_b_client,
        AsyncClient(transport=transport, base_url="http://test") as empty_target_client,
        AsyncClient(transport=transport, base_url="http://test") as healer_client,
    ):
        target_a_resp = await target_a_client.post(
            "/api/jokers",
            json=joker_payload("Target A", "INFP", "Pisces", "I", "lj-library"),
        )
        target_b_resp = await target_b_client.post(
            "/api/jokers",
            json=joker_payload("Target B", "ISFJ", "Virgo", "I", "lj-yuxiu-lake"),
        )
        empty_target_resp = await empty_target_client.post(
            "/api/jokers",
            json=joker_payload("Empty Target", "INTJ", "Cancer", "I", "lj-north-gate"),
        )
        healer_resp = await healer_client.post(
            "/api/jokers",
            json=joker_payload("Healer C", "ENFP", "Leo", "E", "lj-roman-square"),
        )

        assert target_a_resp.status_code == 200, target_a_resp.text
        assert target_b_resp.status_code == 200, target_b_resp.text
        assert empty_target_resp.status_code == 200, empty_target_resp.text
        assert healer_resp.status_code == 200, healer_resp.text
        target_a = target_a_resp.json()
        target_b = target_b_resp.json()
        empty_target = empty_target_resp.json()
        healer = healer_resp.json()

        target_a_balloon_resp = await target_a_client.post(
            "/api/balloons",
            json={"emo_text": "target A pending balloon"},
        )
        target_b_balloon_resp = await target_b_client.post(
            "/api/balloons",
            json={"emo_text": "target B pending balloon"},
        )
        assert target_a_balloon_resp.status_code == 200, target_a_balloon_resp.text
        assert target_b_balloon_resp.status_code == 200, target_b_balloon_resp.text
        target_a_balloon = target_a_balloon_resp.json()
        target_b_balloon = target_b_balloon_resp.json()

        targeted_match_resp = await healer_client.post(
            "/api/heal/match",
            json={"action_type": "cheer", "target_owner_id": target_a["id"]},
        )
        assert targeted_match_resp.status_code == 200, targeted_match_resp.text
        targeted_match = targeted_match_resp.json()
        assert targeted_match["balloon_id"] == target_a_balloon["id"]
        assert targeted_match["owner_id"] == target_a["id"]
        assert targeted_match["balloon_id"] != target_b_balloon["id"]

        own_target_resp = await healer_client.post(
            "/api/heal/match",
            json={"action_type": "cheer", "target_owner_id": healer["id"]},
        )
        assert own_target_resp.status_code == 403, own_target_resp.text
        assert own_target_resp.json()["detail"] == "cannot_heal_own_balloon"

        no_pending_resp = await target_a_client.post(
            "/api/heal/match",
            json={"action_type": "cheer", "target_owner_id": empty_target["id"]},
        )
        assert no_pending_resp.status_code == 404, no_pending_resp.text
        assert no_pending_resp.json()["detail"] == "no_pending_balloon_for_target"

        missing_target_resp = await healer_client.post(
            "/api/heal/match",
            json={"action_type": "cheer", "target_owner_id": "jkr_missing"},
        )
        assert missing_target_resp.status_code == 404, missing_target_resp.text
        assert missing_target_resp.json()["detail"] == "target_joker_not_found"


@pytest.mark.asyncio
async def test_park_balloons_lists_only_pending_balloons():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as owner_client,
        AsyncClient(transport=transport, base_url="http://test") as healer_client,
    ):
        empty_resp = await owner_client.get("/api/park/balloons")
        assert empty_resp.status_code == 200, empty_resp.text
        assert empty_resp.json() == []

        owner_resp = await owner_client.post("/api/jokers", json=joker_payload("气球主人"))
        healer_resp = await healer_client.post(
            "/api/jokers",
            json=joker_payload("接球小丑", "ENFP", "狮子座", "E", "lj-roman-square"),
        )
        assert owner_resp.status_code == 200, owner_resp.text
        assert healer_resp.status_code == 200, healer_resp.text

        balloon_resp = await owner_client.post("/api/balloons", json={"emo_text": "刷新后也要看得见的气球"})
        assert balloon_resp.status_code == 200, balloon_resp.text
        balloon = balloon_resp.json()

        pending_resp = await owner_client.get("/api/park/balloons")
        assert pending_resp.status_code == 200, pending_resp.text
        pending_balloons = pending_resp.json()
        assert [item["id"] for item in pending_balloons] == [balloon["id"]]
        assert pending_balloons[0]["status"] == "pending"
        assert pending_balloons[0]["safe_summary"] == balloon["safe_summary"]

        match_resp = await healer_client.post("/api/heal/match", json={"action_type": "cheer"})
        assert match_resp.status_code == 200, match_resp.text
        action_resp = await healer_client.post(
            "/api/heal/actions",
            json={
                "balloon_id": balloon["id"],
                "action_type": "cheer",
                "cheer_text": "我接住了，刷新以后这颗就该离开等待池。",
            },
        )
        assert action_resp.status_code == 200, action_resp.text

        healed_resp = await owner_client.get("/api/park/balloons")
        assert healed_resp.status_code == 200, healed_resp.text
        assert all(item["id"] != balloon["id"] for item in healed_resp.json())


@pytest.mark.asyncio
async def test_same_session_reuses_first_joker_without_updates():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first_resp = await client.post("/api/jokers", json=joker_payload("初版小丑"))
        assert first_resp.status_code == 200, first_resp.text
        first = first_resp.json()

        second_resp = await client.post(
            "/api/jokers",
            json=joker_payload("新版小丑", "ENFP", "狮子座", "E", "lj-roman-square"),
        )
        assert second_resp.status_code == 200, second_resp.text
        second = second_resp.json()

        assert second["id"] == first["id"]
        assert second["qr_token"] == first["qr_token"]
        assert second["nickname"] == first["nickname"]
        assert second["mbti"] == first["mbti"] == "INFP"
        assert second["social_energy"] == first["social_energy"] == "I"
        assert second["desired_poi_id"] == first["desired_poi_id"] == "lj-yuxiu-lake"


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
async def test_joker_desired_poi_is_required_and_valid():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        missing_payload = joker_payload()
        missing_payload.pop("desired_poi_id")

        missing_resp = await client.post("/api/jokers", json=missing_payload)
        invalid_resp = await client.post(
            "/api/jokers",
            json=joker_payload(desired_poi_id="lj-not-a-real-place"),
        )

        assert missing_resp.status_code == 422, missing_resp.text
        assert invalid_resp.status_code == 422, invalid_resp.text


@pytest.mark.asyncio
async def test_clown_vote_summary_and_one_vote_toggle():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as first_client,
        AsyncClient(transport=transport, base_url="http://test") as second_client,
    ):
        first_summary = await first_client.post(
            "/api/park/clown-votes/summary",
            json={"clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )
        assert first_summary.status_code == 200, first_summary.text
        assert first_summary.json() == {
            "items": [
                {"clown_id": "guest-clown-a", "votes": 0},
                {"clown_id": "guest-clown-b", "votes": 0},
            ],
            "voted_clown_id": None,
        }

        first_vote = await first_client.post(
            "/api/park/clown-votes/toggle",
            json={"clown_id": "guest-clown-a", "current_clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )
        assert first_vote.status_code == 200, first_vote.text
        first_vote_json = first_vote.json()
        assert first_vote_json["voted_clown_id"] == "guest-clown-a"
        assert first_vote_json["items"][0] == {"clown_id": "guest-clown-a", "votes": 1}

        cancelled = await first_client.post(
            "/api/park/clown-votes/toggle",
            json={"clown_id": "guest-clown-a", "current_clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["voted_clown_id"] is None
        assert cancelled.json()["items"][0] == {"clown_id": "guest-clown-a", "votes": 0}

        await first_client.post(
            "/api/park/clown-votes/toggle",
            json={"clown_id": "guest-clown-a", "current_clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )
        await second_client.post(
            "/api/park/clown-votes/toggle",
            json={"clown_id": "guest-clown-a", "current_clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )

        switched = await first_client.post(
            "/api/park/clown-votes/toggle",
            json={"clown_id": "guest-clown-b", "current_clown_ids": ["guest-clown-a", "guest-clown-b"]},
        )
        assert switched.status_code == 200, switched.text
        assert switched.json()["voted_clown_id"] == "guest-clown-b"
        assert switched.json()["items"] == [
            {"clown_id": "guest-clown-a", "votes": 1},
            {"clown_id": "guest-clown-b", "votes": 1},
        ]

        scoped = await first_client.post(
            "/api/park/clown-votes/summary",
            json={"clown_ids": ["guest-clown-b"]},
        )
        assert scoped.status_code == 200, scoped.text
        assert scoped.json()["items"] == [{"clown_id": "guest-clown-b", "votes": 1}]
        assert scoped.json()["voted_clown_id"] == "guest-clown-b"


@pytest.mark.asyncio
async def test_park_jokers_lists_jokers_from_other_sessions():
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as first_client,
        AsyncClient(transport=transport, base_url="http://test") as second_client,
        AsyncClient(transport=transport, base_url="http://test") as viewer_client,
    ):
        first_resp = await first_client.post(
            "/api/jokers",
            json=joker_payload("远处小丑", "INFP", "双鱼座", "I", "lj-school-hospital"),
        )
        second_resp = await second_client.post(
            "/api/jokers",
            json=joker_payload("隔壁小丑", "ENFP", "狮子座", "E", "lj-library"),
        )

        assert first_resp.status_code == 200, first_resp.text
        assert second_resp.status_code == 200, second_resp.text
        first_joker = first_resp.json()
        second_joker = second_resp.json()

        park_resp = await viewer_client.get("/api/park/jokers")
        assert park_resp.status_code == 200, park_resp.text
        park_jokers = park_resp.json()
        park_ids = {joker["id"] for joker in park_jokers}
        park_poi_ids = {joker["id"]: joker["desired_poi_id"] for joker in park_jokers}

        assert first_joker["id"] in park_ids
        assert second_joker["id"] in park_ids
        assert first_joker["desired_poi_id"] == "lj-school-hospital"
        assert second_joker["desired_poi_id"] == "lj-library"
        assert park_poi_ids[first_joker["id"]] == "lj-school-hospital"
        assert park_poi_ids[second_joker["id"]] == "lj-library"


@pytest.mark.asyncio
async def test_park_jokers_and_vote_summary_include_more_than_legacy_limit():
    transport = ASGITransport(app=app)
    async with AsyncExitStack() as stack:
        created_ids: list[str] = []
        for index in range(40):
            client = await stack.enter_async_context(AsyncClient(transport=transport, base_url="http://test"))
            resp = await client.post(
                "/api/jokers",
                json=joker_payload(
                    f"批量小丑{index:02d}",
                    "ENFP" if index % 2 else "INFP",
                    "狮子座" if index % 2 else "双鱼座",
                    "E" if index % 2 else "I",
                    "lj-library" if index % 2 else "lj-yuxiu-lake",
                ),
            )
            assert resp.status_code == 200, resp.text
            created_ids.append(resp.json()["id"])

        viewer_client = await stack.enter_async_context(AsyncClient(transport=transport, base_url="http://test"))
        park_resp = await viewer_client.get("/api/park/jokers")
        assert park_resp.status_code == 200, park_resp.text
        park_ids = [joker["id"] for joker in park_resp.json()]
        assert len(park_ids) == len(created_ids)
        assert set(created_ids) == set(park_ids)

        summary_resp = await viewer_client.post(
            "/api/park/clown-votes/summary",
            json={"clown_ids": created_ids},
        )
        assert summary_resp.status_code == 200, summary_resp.text
        summary = summary_resp.json()
        assert len(summary["items"]) == len(created_ids)
        assert [item["clown_id"] for item in summary["items"]] == created_ids


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
                "desired_poi_id": "lj-library",
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
        assert joker["desired_poi_id"] == "lj-library"
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


@pytest.mark.asyncio
async def test_admin_login_stats_and_super_admin_delete_joker():
    admin_transport = ASGITransport(app=app, client=("127.0.0.1", 12345))
    user_transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=admin_transport, base_url="http://test") as admin_client,
        AsyncClient(transport=user_transport, base_url="http://test") as owner_client,
    ):
        blocked_resp = await admin_client.get("/api/admin/jokers")
        assert blocked_resp.status_code == 401, blocked_resp.text

        bad_login_resp = await admin_client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "wrong"},
        )
        assert bad_login_resp.status_code == 401, bad_login_resp.text

        login_resp = await admin_client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "test-admin-password"},
        )
        assert login_resp.status_code == 200, login_resp.text
        session = login_resp.json()
        assert session["role"] == "super_admin"
        assert session["is_super_admin"] is True

        joker_resp = await owner_client.post("/api/jokers", json=joker_payload("Admin Delete Me"))
        assert joker_resp.status_code == 200, joker_resp.text
        joker = joker_resp.json()

        balloon_resp = await owner_client.post("/api/balloons", json={"emo_text": "admin cleanup target"})
        assert balloon_resp.status_code == 200, balloon_resp.text

        stats_resp = await admin_client.get("/api/admin/stats")
        assert stats_resp.status_code == 200, stats_resp.text
        stats = stats_resp.json()
        assert stats["joker_count"] == 1
        assert stats["balloon_count"] == 1

        list_resp = await admin_client.get("/api/admin/jokers")
        assert list_resp.status_code == 200, list_resp.text
        jokers = list_resp.json()
        assert jokers[0]["id"] == joker["id"]
        assert jokers[0]["balloon_count"] == 1

        delete_resp = await admin_client.delete(f"/api/admin/jokers/{joker['id']}")
        assert delete_resp.status_code == 200, delete_resp.text
        deleted = delete_resp.json()
        assert deleted["joker_id"] == joker["id"]
        assert deleted["deleted_counts"]["jokers"] == 1
        assert deleted["deleted_counts"]["balloons"] == 1

        roster_resp = await admin_client.get("/api/park/jokers")
        assert roster_resp.status_code == 200, roster_resp.text
        assert roster_resp.json() == []


@pytest.mark.asyncio
async def test_remote_admin_login_is_not_super_admin():
    transport = ASGITransport(app=app, client=("192.0.2.24", 43210))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "test-admin-password"},
        )
        assert login_resp.status_code == 200, login_resp.text
        session = login_resp.json()
        assert session["role"] == "admin"
        assert session["is_super_admin"] is False

        forbidden_resp = await client.delete("/api/admin/jokers/jkr_missing")
        assert forbidden_resp.status_code == 403, forbidden_resp.text
        assert forbidden_resp.json()["detail"] == "super_admin_required"


@pytest.mark.asyncio
async def test_admin_password_reload_without_api_restart():
    original_password = os.environ["ADMIN_PASSWORD"]
    rotated_password = "rotated-admin-password"
    transport = ASGITransport(app=app, client=("127.0.0.1", 12345))
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            login_resp = await client.post(
                "/api/admin/login",
                json={"username": "admin", "password": original_password},
            )
            assert login_resp.status_code == 200, login_resp.text

            os.environ["ADMIN_PASSWORD"] = rotated_password

            old_session_resp = await client.get("/api/admin/me")
            assert old_session_resp.status_code == 401, old_session_resp.text

            old_password_resp = await client.post(
                "/api/admin/login",
                json={"username": "admin", "password": original_password},
            )
            assert old_password_resp.status_code == 401, old_password_resp.text

            rotated_login_resp = await client.post(
                "/api/admin/login",
                json={"username": "admin", "password": rotated_password},
            )
            assert rotated_login_resp.status_code == 200, rotated_login_resp.text
            assert rotated_login_resp.json()["is_super_admin"] is True
    finally:
        os.environ["ADMIN_PASSWORD"] = original_password


@pytest.mark.asyncio
async def test_private_chat_unlocks_after_three_relationship_interactions(monkeypatch: pytest.MonkeyPatch):
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as i_client,
        AsyncClient(transport=transport, base_url="http://test") as e_client,
    ):
        i_resp = await i_client.post("/api/jokers", json=joker_payload("Chat I", "INFP", "Pisces", "I"))
        e_resp = await e_client.post("/api/jokers", json=joker_payload("Chat E", "ENFP", "Leo", "E"))
        assert i_resp.status_code == 200, i_resp.text
        assert e_resp.status_code == 200, e_resp.text
        i_joker = i_resp.json()
        e_joker = e_resp.json()

        locked_resp = await i_client.post(f"/api/chat/private/{e_joker['id']}")
        assert locked_resp.status_code == 409, locked_resp.text
        assert locked_resp.json()["detail"] == "chat_locked"

        for index in range(3):
            balloon_resp = await i_client.post(
                "/api/balloons",
                json={"emo_text": f"chat unlock balloon {index}"},
            )
            assert balloon_resp.status_code == 200, balloon_resp.text
            balloon = balloon_resp.json()
            action_resp = await e_client.post(
                "/api/heal/actions",
                json={
                    "balloon_id": balloon["id"],
                    "action_type": "cheer",
                    "cheer_text": f"chat unlock cheer {index}",
                },
            )
            assert action_resp.status_code == 200, action_resp.text

        replay_resp = await i_client.get(f"/api/replay/{i_joker['qr_token']}")
        assert replay_resp.status_code == 200, replay_resp.text
        relationship = replay_resp.json()["relationships"][0]
        assert relationship["joker"]["id"] == e_joker["id"]
        assert relationship["affinity_score"] == 9
        assert relationship["interaction_count"] == 3
        assert relationship["chat_unlocked"] is True
        assert relationship["chat_room_id"] is not None

        room_resp = await i_client.post(f"/api/chat/private/{e_joker['id']}")
        assert room_resp.status_code == 200, room_resp.text
        room = room_resp.json()
        assert room["id"] == relationship["chat_room_id"]
        assert room["room_type"] == "private"
        assert room["peer"]["id"] == e_joker["id"]

        same_room_resp = await e_client.post(f"/api/chat/private/{i_joker['id']}")
        assert same_room_resp.status_code == 200, same_room_resp.text
        assert same_room_resp.json()["id"] == room["id"]

        message_resp = await i_client.post(
            f"/api/chat/rooms/{room['id']}/messages",
            json={"content": "hello from unlocked chat"},
        )
        assert message_resp.status_code == 200, message_resp.text
        assert message_resp.json()["content_safe"] == "hello from unlocked chat"

        rate_limited_resp = await i_client.post(
            f"/api/chat/rooms/{room['id']}/messages",
            json={"content": "too fast"},
        )
        assert rate_limited_resp.status_code == 429, rate_limited_resp.text
        assert rate_limited_resp.json()["detail"] == "chat_rate_limited"

        messages_resp = await e_client.get(f"/api/chat/rooms/{room['id']}/messages")
        assert messages_resp.status_code == 200, messages_resp.text
        messages = messages_resp.json()
        assert len(messages) == 1
        assert messages[0]["sender_id"] == i_joker["id"]

        monkeypatch.setattr(services, "CHAT_MESSAGE_MIN_INTERVAL_SECONDS", 0.0)
        for index in range(205):
            overflow_resp = await i_client.post(
                f"/api/chat/rooms/{room['id']}/messages",
                json={"content": f"overflow {index}"},
            )
            assert overflow_resp.status_code == 200, overflow_resp.text

        trimmed_resp = await e_client.get(f"/api/chat/rooms/{room['id']}/messages")
        assert trimmed_resp.status_code == 200, trimmed_resp.text
        assert len(trimmed_resp.json()) == 200


@pytest.mark.asyncio
async def test_location_chat_room_is_shared_and_trimmed(monkeypatch: pytest.MonkeyPatch):
    transport = ASGITransport(app=app)
    admin_transport = ASGITransport(app=app, client=("127.0.0.1", 12345))
    async with (
        AsyncClient(transport=transport, base_url="http://test") as first_client,
        AsyncClient(transport=transport, base_url="http://test") as second_client,
        AsyncClient(transport=admin_transport, base_url="http://test") as admin_client,
    ):
        first_resp = await first_client.post("/api/jokers", json=joker_payload("Library One", "INFP", "Pisces", "I"))
        second_resp = await second_client.post("/api/jokers", json=joker_payload("Library Two", "ENFP", "Leo", "E"))
        assert first_resp.status_code == 200, first_resp.text
        assert second_resp.status_code == 200, second_resp.text
        first_joker = first_resp.json()
        second_joker = second_resp.json()

        locations_resp = await first_client.get("/api/chat/locations")
        assert locations_resp.status_code == 200, locations_resp.text
        locations = locations_resp.json()
        assert "dormitory" in {location["id"] for location in locations}

        room_resp = await first_client.post("/api/chat/location/library")
        assert room_resp.status_code == 200, room_resp.text
        room = room_resp.json()
        assert room["room_type"] == "location"
        assert room["location_id"] == "library"
        assert room["peer"] is None

        same_room_resp = await second_client.post("/api/chat/location/library")
        assert same_room_resp.status_code == 200, same_room_resp.text
        assert same_room_resp.json()["id"] == room["id"]

        invalid_room_resp = await first_client.post("/api/chat/location/not-a-real-zone")
        assert invalid_room_resp.status_code == 404, invalid_room_resp.text
        assert invalid_room_resp.json()["detail"] == "chat_location_not_found"

        first_message_resp = await first_client.post(
            f"/api/chat/rooms/{room['id']}/messages",
            json={"content": "图书馆三楼有人吗"},
        )
        assert first_message_resp.status_code == 200, first_message_resp.text
        first_message = first_message_resp.json()
        assert first_message["sender_id"] == first_joker["id"]
        assert first_message["sender"]["nickname"] == "Library One"

        limited_resp = await first_client.post(
            f"/api/chat/rooms/{room['id']}/messages",
            json={"content": "公共池刷屏"},
        )
        assert limited_resp.status_code == 429, limited_resp.text

        second_message_resp = await second_client.post(
            f"/api/chat/rooms/{room['id']}/messages",
            json={"content": "我刚到"},
        )
        assert second_message_resp.status_code == 200, second_message_resp.text
        assert second_message_resp.json()["sender"]["id"] == second_joker["id"]

        replay_resp = await first_client.get(f"/api/replay/{first_joker['qr_token']}")
        assert replay_resp.status_code == 200, replay_resp.text
        footprints = replay_resp.json()["public_footprints"]
        assert footprints[0]["location_id"] == "library"
        assert footprints[0]["location_label"] == "图书馆"
        assert footprints[0]["content_safe"] == "图书馆三楼有人吗"

        presence_resp = await first_client.get("/api/chat/location/library/presence")
        assert presence_resp.status_code == 200, presence_resp.text
        presence = presence_resp.json()
        assert presence["active_count"] == 2
        assert {joker["id"] for joker in presence["active_jokers"]} == {first_joker["id"], second_joker["id"]}

        messages_resp = await first_client.get(f"/api/chat/rooms/{room['id']}/messages")
        assert messages_resp.status_code == 200, messages_resp.text
        messages = messages_resp.json()
        assert [message["sender"]["nickname"] for message in messages] == ["Library One", "Library Two"]

        limited_messages_resp = await first_client.get(f"/api/chat/rooms/{room['id']}/messages?limit=1")
        assert limited_messages_resp.status_code == 200, limited_messages_resp.text
        assert len(limited_messages_resp.json()) == 1
        assert limited_messages_resp.json()[0]["sender"]["nickname"] == "Library Two"

        monkeypatch.setattr(services, "CHAT_LOCATION_MESSAGE_MIN_INTERVAL_SECONDS", 0.0)
        monkeypatch.setattr(services, "CHAT_LOCATION_MESSAGE_LIMIT", 3)
        for index in range(5):
            overflow_resp = await first_client.post(
                f"/api/chat/rooms/{room['id']}/messages",
                json={"content": f"library overflow {index}"},
            )
            assert overflow_resp.status_code == 200, overflow_resp.text

        trimmed_resp = await second_client.get(f"/api/chat/rooms/{room['id']}/messages")
        assert trimmed_resp.status_code == 200, trimmed_resp.text
        trimmed = trimmed_resp.json()
        assert len(trimmed) == 3
        assert trimmed[-1]["content_safe"] == "library overflow 4"

        admin_login_resp = await admin_client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "test-admin-password"},
        )
        assert admin_login_resp.status_code == 200, admin_login_resp.text

        admin_stats_resp = await admin_client.get("/api/admin/stats")
        assert admin_stats_resp.status_code == 200, admin_stats_resp.text
        assert admin_stats_resp.json()["chat_room_count"] == 1
        assert admin_stats_resp.json()["chat_message_count"] == 3

        admin_rooms_resp = await admin_client.get("/api/admin/chat/rooms")
        assert admin_rooms_resp.status_code == 200, admin_rooms_resp.text
        admin_rooms = admin_rooms_resp.json()
        assert admin_rooms[0]["location_id"] == "library"
        assert admin_rooms[0]["message_count"] == 3
        assert admin_rooms[0]["recent_messages"]

        delete_message_resp = await admin_client.delete(
            f"/api/admin/chat/messages/{admin_rooms[0]['recent_messages'][-1]['id']}"
        )
        assert delete_message_resp.status_code == 200, delete_message_resp.text
        assert delete_message_resp.json()["chat_messages"] == 1

        after_delete_resp = await second_client.get(f"/api/chat/rooms/{room['id']}/messages")
        assert after_delete_resp.status_code == 200, after_delete_resp.text
        assert len(after_delete_resp.json()) == 2

        empty_room_resp = await first_client.post("/api/chat/location/dormitory")
        assert empty_room_resp.status_code == 200, empty_room_resp.text
        empty_room = empty_room_resp.json()
        async with SessionLocal() as session:
            room_model = await session.get(ChatRoom, empty_room["id"])
            assert room_model is not None
            room_model.created_at = services.now_utc() - timedelta(days=8)
            await session.commit()
            deleted_count = await services.ChatService(session).cleanup_stale_location_rooms()
            assert deleted_count == 1
            assert await session.get(ChatRoom, empty_room["id"]) is None
            assert await session.get(ChatRoom, room["id"]) is not None
