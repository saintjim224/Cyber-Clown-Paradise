import json
from hashlib import sha256

from openai import AsyncOpenAI

from app.config import Settings
from app.safety import clamp_joker_line


def _clamp01(value: object, fallback: float = 0.5) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    return max(0.0, min(1.0, number))


def _trim_list(values: object, fallback: list[str], limit: int = 5) -> list[str]:
    if not isinstance(values, list):
        values = fallback
    clean: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        text = clamp_joker_line(value)[:80]
        if text:
            clean.append(text)
    return (clean or fallback)[:limit]


class JokerAIAdapter:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = (
            AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds)
            if settings.openai_enable_remote and settings.openai_api_key
            else None
        )

    async def generate_identity(self, mbti: str, constellation: str, social_energy: str) -> dict:
        fallback = self._fallback_identity(mbti, constellation, social_energy)
        if not self.client:
            return fallback

        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "persona": {"type": "string"},
                "verdict": {"type": "string"},
                "style_tokens": {"type": "object"},
            },
            "required": ["persona", "verdict", "style_tokens"],
        }
        prompt = (
            "生成一个赛博小丑乐园用户身份。语气毒舌但温柔，中文，避免AI腔。"
            f"MBTI={mbti}, 星座={constellation}, I/E={social_energy}。"
        )
        try:
            response = await self.client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {
                        "role": "system",
                        "content": "你只输出符合 schema 的 JSON。verdict 最多两句。",
                    },
                    {"role": "user", "content": prompt},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "joker_identity",
                        "schema": schema,
                    }
                },
            )
            parsed = json.loads(response.output_text)
            parsed["verdict"] = clamp_joker_line(parsed.get("verdict", fallback["verdict"]))
            parsed.setdefault("style_tokens", fallback["style_tokens"])
            return parsed
        except Exception:
            return fallback

    async def generate_soul_draft(
        self,
        mbti: str,
        constellation: str,
        social_energy: str,
        soul_seed: str,
        face_descriptor: dict | None = None,
    ) -> dict:
        fallback = self._fallback_soul_draft(mbti, constellation, social_energy, soul_seed, face_descriptor)
        if not self.client:
            return fallback

        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "soul_profile": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "core_personality": {"type": "string"},
                        "behavior_rules": {"type": "array", "items": {"type": "string"}},
                        "sample_lines": {"type": "array", "items": {"type": "string"}},
                        "social_boundaries": {"type": "array", "items": {"type": "string"}},
                        "catchphrase": {"type": "string"},
                    },
                    "required": [
                        "core_personality",
                        "behavior_rules",
                        "sample_lines",
                        "social_boundaries",
                        "catchphrase",
                    ],
                },
                "persona": {"type": "string"},
                "verdict": {"type": "string"},
                "style_tokens": {"type": "object"},
                "avatar_recipe": {"type": "object"},
            },
            "required": ["soul_profile", "persona", "verdict", "style_tokens", "avatar_recipe"],
        }
        prompt = (
            "为用户生成一只 Q 版赛博小丑宠物的灵魂草案。"
            "中文，毒舌但温柔，不能有 AI 腔，不能心理诊断，短句为主。"
            f"MBTI={mbti}, 星座={constellation}, I/E={social_energy}, "
            f"用户自述={soul_seed[:700]}, 人脸低维特征={json.dumps(face_descriptor or {}, ensure_ascii=False)}。"
            "avatar_recipe 必须只使用 native-clown-v1 的软胶 Q 版参数。"
        )
        try:
            response = await self.client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {
                        "role": "system",
                        "content": "你只输出符合 schema 的 JSON。sample_lines 每句最多 40 字，verdict 最多两句。",
                    },
                    {"role": "user", "content": prompt},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "joker_soul_draft",
                        "schema": schema,
                    }
                },
            )
            return self._normalize_soul_draft(json.loads(response.output_text), fallback)
        except Exception:
            return fallback

    async def generate_event(self, actor_name: str, target_summary: str, action_type: str) -> dict:
        fallback = self._fallback_event(actor_name, target_summary, action_type)
        if not self.client:
            return fallback
        try:
            response = await self.client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {
                        "role": "system",
                        "content": "你是赛博小丑乐园导演。只输出一段短 JSON，dialogue 最多两句。",
                    },
                    {
                        "role": "user",
                        "content": f"actor={actor_name}, target={target_summary}, action={action_type}",
                    },
                ],
            )
            parsed = json.loads(response.output_text)
            parsed["dialogue"] = clamp_joker_line(parsed.get("dialogue", fallback["dialogue"]))
            return parsed
        except Exception:
            return fallback

    def _fallback_identity(self, mbti: str, constellation: str, social_energy: str) -> dict:
        palette = self._palette_for(mbti, constellation, social_energy)
        mode = "守夜气球管理员" if social_energy == "I" else "快乐突袭队长"
        verdict = f"{mbti} {constellation}小丑已入编：表面很稳，内心弹幕已经开到最大。今天的烦恼先别删，交给乐园帮你整活。"
        return {
            "persona": f"{mode}，擅长把尴尬变成彩带，把内耗压成弹簧。",
            "verdict": clamp_joker_line(verdict),
            "style_tokens": {
                "palette": palette,
                "material": "soft-vinyl",
                "motion": "spring-bounce" if social_energy == "E" else "gentle-float",
                "aura": f"{constellation}-{mbti}-neon",
            },
        }

    def _fallback_soul_draft(
        self,
        mbti: str,
        constellation: str,
        social_energy: str,
        soul_seed: str,
        face_descriptor: dict | None = None,
    ) -> dict:
        palette = self._palette_for(mbti, constellation, social_energy)
        seed = soul_seed.strip() or "不太会介绍自己，但希望小丑替我把气氛接住"
        energy = "躲进气球后台观察全场" if social_energy == "I" else "冲到舞台中间替人破冰"
        catchphrase = "先别急，我把尴尬打个蝴蝶结。"
        soul_profile = {
            "core_personality": f"{mbti} {constellation}软胶小丑，外表会整活，内核很护短；会把“{seed[:28]}”翻译成轻巧的社交动作。",
            "behavior_rules": [
                f"社交电量低时先{energy}。",
                "遇到冷场就抛一颗彩色气球，不追问隐私。",
                "替主人说话只说一两句，轻轻落地。",
            ],
            "sample_lines": [
                catchphrase,
                "今天先赢一厘米，剩下的交给彩带处理。",
            ],
            "social_boundaries": [
                "不做心理诊断，不给危险建议。",
                "不攻击别人，不把玩笑开到伤口上。",
            ],
            "catchphrase": catchphrase,
        }
        persona = f"{soul_profile['core_personality']} 习惯动作：{soul_profile['behavior_rules'][0]}"
        verdict = clamp_joker_line(f"{mbti} {constellation}小丑已长出灵魂：嘴上像在整活，心里在给你留座。{catchphrase}")
        return {
            "soul_profile": soul_profile,
            "persona": persona,
            "verdict": verdict,
            "style_tokens": {
                "palette": palette,
                "material": "soft-vinyl",
                "motion": "spring-bounce" if social_energy == "E" else "gentle-float",
                "aura": f"{constellation}-{mbti}-neon",
            },
            "avatar_recipe": self._avatar_recipe(palette, social_energy, face_descriptor),
        }

    def _palette_for(self, mbti: str, constellation: str, social_energy: str) -> dict:
        digest = sha256(f"{mbti}:{constellation}:{social_energy}".encode()).hexdigest()
        palettes = [
            {"primary": "#27f5d4", "secondary": "#ff5f8f", "accent": "#ffe45e"},
            {"primary": "#8b5cf6", "secondary": "#27f5d4", "accent": "#ff9f1c"},
            {"primary": "#ff5f8f", "secondary": "#ffe45e", "accent": "#42e8f5"},
        ]
        return palettes[int(digest[0], 16) % len(palettes)]

    def _avatar_recipe(self, palette: dict, social_energy: str, face_descriptor: dict | None) -> dict:
        descriptor = face_descriptor or {}
        roundness = _clamp01(descriptor.get("face_roundness"), 0.5)
        smile = _clamp01(descriptor.get("smile_curve"), 0.5)
        brow = _clamp01(descriptor.get("brow_lift"), 0.5)
        head_tilt = _clamp01(descriptor.get("head_tilt"), 0.5)
        return {
            "art_version": "native-clown-v1",
            "palette": palette,
            "head_scale": round(0.92 + roundness * 0.24, 3),
            "body_scale": 1.04 if social_energy == "E" else 0.96,
            "eye_spacing": _clamp01(descriptor.get("eye_spacing"), 0.5),
            "eye_size": _clamp01(descriptor.get("eye_size"), 0.5),
            "nose_scale": _clamp01(descriptor.get("nose_scale"), 0.5),
            "cheek_scale": _clamp01(descriptor.get("cheek_fullness"), 0.5),
            "mouth_width": _clamp01(descriptor.get("mouth_width"), smile),
            "hat_height": round(0.38 + brow * 0.5, 3),
            "hat_tilt": head_tilt,
            "motion_style": "spring-bounce" if social_energy == "E" else "gentle-float",
            "material": "soft-vinyl",
        }

    def _normalize_soul_draft(self, parsed: dict, fallback: dict) -> dict:
        soul = parsed.get("soul_profile") if isinstance(parsed, dict) else {}
        fallback_soul = fallback["soul_profile"]
        normalized_soul = {
            "core_personality": str(soul.get("core_personality") or fallback_soul["core_personality"])[:180],
            "behavior_rules": _trim_list(soul.get("behavior_rules"), fallback_soul["behavior_rules"]),
            "sample_lines": _trim_list(soul.get("sample_lines"), fallback_soul["sample_lines"]),
            "social_boundaries": _trim_list(soul.get("social_boundaries"), fallback_soul["social_boundaries"]),
            "catchphrase": clamp_joker_line(str(soul.get("catchphrase") or fallback_soul["catchphrase"]))[:80],
        }
        avatar_recipe = fallback["avatar_recipe"] | (parsed.get("avatar_recipe") if isinstance(parsed.get("avatar_recipe"), dict) else {})
        avatar_recipe["art_version"] = "native-clown-v1"
        avatar_recipe["palette"] = fallback["style_tokens"]["palette"]
        for key in ["head_scale", "body_scale"]:
            try:
                avatar_recipe[key] = float(avatar_recipe[key])
            except (TypeError, ValueError):
                avatar_recipe[key] = fallback["avatar_recipe"][key]
        for key in ["eye_spacing", "eye_size", "nose_scale", "cheek_scale", "mouth_width", "hat_height", "hat_tilt"]:
            avatar_recipe[key] = _clamp01(avatar_recipe.get(key), fallback["avatar_recipe"][key])
        return {
            "soul_profile": normalized_soul,
            "persona": str(parsed.get("persona") or fallback["persona"])[:300],
            "verdict": clamp_joker_line(str(parsed.get("verdict") or fallback["verdict"])),
            "style_tokens": parsed.get("style_tokens") if isinstance(parsed.get("style_tokens"), dict) else fallback["style_tokens"],
            "avatar_recipe": avatar_recipe,
        }

    def _fallback_event(self, actor_name: str, target_summary: str, action_type: str) -> dict:
        line = f"{actor_name}把“{target_summary[:18]}”揉成彩球，啪地塞进好运发射器。别急，今天先赢一厘米。"
        clip = {"hug": "big-hug", "pet": "head-pat", "dance": "bounce-dance"}.get(action_type, "cheer-pop")
        return {
            "dialogue": clamp_joker_line(line),
            "animation_clip": clip,
            "mood_delta": 12,
            "position_path": [[-1.5, 0, 0], [-0.2, 0.1, 0.4], [1.4, 0, -0.2]],
        }
