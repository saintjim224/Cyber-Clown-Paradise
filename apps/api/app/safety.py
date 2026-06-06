from dataclasses import dataclass


BLOCKED_TERMS = {
    "自杀",
    "杀人",
    "暴力教程",
    "色情",
    "仇恨",
}

AI_TONE_MARKERS = {
    "作为ai",
    "作为 AI",
    "作为一个人工智能",
    "我无法",
    "心理诊断",
}


@dataclass(frozen=True)
class ModerationResult:
    flagged: bool
    categories: dict[str, bool]
    action_taken: str
    cleaned_text: str


def moderate_text(text: str) -> ModerationResult:
    normalized = text.strip()
    lowered = normalized.lower()
    categories = {
        "dangerous": any(term.lower() in lowered for term in BLOCKED_TERMS),
        "ai_tone": any(marker.lower() in lowered for marker in AI_TONE_MARKERS),
    }
    flagged = any(categories.values())
    cleaned = normalized
    for marker in AI_TONE_MARKERS:
        cleaned = cleaned.replace(marker, "")
    action = "block" if categories["dangerous"] else "rewrite" if categories["ai_tone"] else "allow"
    return ModerationResult(flagged=flagged, categories=categories, action_taken=action, cleaned_text=cleaned)


def clamp_joker_line(text: str) -> str:
    cleaned = text.strip().replace("\n", " ")
    for marker in AI_TONE_MARKERS:
        cleaned = cleaned.replace(marker, "")
    sentences = [part.strip() for part in cleaned.replace("！", "。").replace("？", "。").split("。") if part.strip()]
    if not sentences:
        return "你的小丑把烦恼揉成纸团，精准投进了快乐回收站。"
    return "。".join(sentences[:2]) + "。"
