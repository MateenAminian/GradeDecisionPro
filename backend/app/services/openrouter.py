"""OpenRouter vision client for sports-card photo analysis."""

from __future__ import annotations

import base64
import json
import os
import re
from typing import Any

import httpx

from app.models import CompPrices, GradeProbabilities
from app.schemas import VisionAnalysisOutput

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-2.5-flash-lite"

SYSTEM_PROMPT = (
    "You are an expert sports card grader. Analyze the provided card image. "
    "Extract the player, set, year, card number, and parallel. "
    "Assess visible centering and corners. "
    "Assign a probability percentage for PSA 10, PSA 9, and PSA 8 based on visible condition. "
    "Return ONLY valid JSON."
)

USER_PROMPT = """Return a JSON object with exactly this shape:
{
  "metadata": {
    "year": "string",
    "player": "string",
    "set": "string",
    "cardNumber": "string",
    "parallel": "string"
  },
  "conditionReport": {
    "centering": "string",
    "corners": "string",
    "surfaceNotes": "string"
  },
  "gradeProbabilities": {
    "psa10Percent": number,
    "psa9Percent": number,
    "psa8Percent": number
  },
  "estimatedRawValue": number
}

Rules:
- gradeProbabilities.psa10Percent + psa9Percent + psa8Percent should sum to about 100.
- If you cannot read a field, use an empty string or 0.
- estimatedRawValue is a USD estimate of the raw (ungraded) card; use 0 if unknown.
- No markdown, no commentary, JSON only.
"""


def vision_probs_to_engine(p10: float, p9: float, p8: float) -> GradeProbabilities:
    """Map vision PSA 10/9/8 percents onto the EV engine's four-bucket matrix."""
    total = max(0.0, p10) + max(0.0, p9) + max(0.0, p8)
    if total <= 0:
        return GradeProbabilities(psa10=0, psa9=0, psa8=0, below8=100)
    if total > 100.5:
        scale = 100.0 / total
        return GradeProbabilities(
            psa10=p10 * scale,
            psa9=p9 * scale,
            psa8=p8 * scale,
            below8=0,
        )
    return GradeProbabilities(
        psa10=p10,
        psa9=p9,
        psa8=p8,
        below8=max(0.0, 100.0 - total),
    )


def likely_grade_range(p10: float, p9: float, p8: float) -> tuple[str, str]:
    """Headline likely grade plus a compact range covering ~75% of mass."""
    scored = [("PSA 10", p10), ("PSA 9", p9), ("PSA 8", p8)]
    scored.sort(key=lambda item: item[1], reverse=True)
    if scored[0][1] <= 0:
        return "Unknown", "Unknown"
    likely = scored[0][0]
    covered = 0.0
    picked: set[str] = set()
    for name, pct in scored:
        if pct <= 0:
            continue
        picked.add(name)
        covered += pct
        if covered >= 75:
            break
    order = [grade for grade in ("PSA 10", "PSA 9", "PSA 8") if grade in picked]
    if len(order) <= 1:
        return likely, order[0] if order else likely
    low = order[-1].replace("PSA ", "", 1).strip()
    high = order[0].replace("PSA ", "", 1).strip()
    return likely, f"PSA {low}–{high}"


def guess_mime(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG"):
        return "image/png"
    if image_bytes.startswith(b"RIFF") and b"WEBP" in image_bytes[:16]:
        return "image/webp"
    if image_bytes.startswith(b"GIF8"):
        return "image/gif"
    return "image/jpeg"


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        parsed = json.loads(cleaned[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("OpenRouter did not return valid JSON")


def parse_vision_output(payload: dict[str, Any]) -> VisionAnalysisOutput:
    return VisionAnalysisOutput.model_validate(payload)


async def analyze_single_card_image(image_bytes: bytes) -> VisionAnalysisOutput:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    mime = guess_mime(image_bytes)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://gradedecision.pro"),
        "X-Title": "GradeDecision Pro",
    }
    body = {
        "model": model,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }

    timeout = httpx.Timeout(90.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(OPENROUTER_URL, headers=headers, json=body)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:400]
            raise RuntimeError(f"OpenRouter HTTP {exc.response.status_code}: {detail}") from exc

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("OpenRouter response was missing message content") from exc

    if isinstance(content, list):
        text = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    else:
        text = str(content or "")

    parsed = extract_json_object(text)
    return parse_vision_output(parsed)


def default_comps() -> CompPrices:
    return CompPrices(psa10=800, psa9=280, psa8=180, below8=120)
