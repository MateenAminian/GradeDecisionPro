"""Tests for vision JSON parsing and probability mapping. No live OpenRouter calls."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CalculateEVRequest, CompPrices
from app.services.ev_calculator import calculate_ev
from app.services.openrouter import (
    extract_json_object,
    likely_grade_range,
    parse_vision_output,
    vision_probs_to_engine,
)


def test_extract_json_from_fenced_markdown() -> None:
    raw = """```json
{"metadata":{"year":"2023","player":"Luka Doncic","set":"Prizm","cardNumber":"1","parallel":"Silver"},"conditionReport":{"centering":"60/40","corners":"sharp","surfaceNotes":"light print lines"},"gradeProbabilities":{"psa10Percent":55,"psa9Percent":30,"psa8Percent":15},"estimatedRawValue":180}
```"""
    parsed = extract_json_object(raw)
    vision = parse_vision_output(parsed)
    assert vision.metadata.player == "Luka Doncic"
    assert vision.grade_probabilities.psa10_percent == 55
    assert vision.estimated_raw_value == 180


def test_vision_probs_map_remainder_to_below8() -> None:
    probs = vision_probs_to_engine(50, 30, 10)
    assert probs.psa10 == 50
    assert probs.below8 == 10


def test_vision_probs_normalize_when_over_100() -> None:
    probs = vision_probs_to_engine(80, 30, 20)
    total = probs.psa10 + probs.psa9 + probs.psa8 + probs.below8
    assert abs(total - 100) < 0.01
    assert probs.below8 == 0


def test_likely_grade_range_covers_majority() -> None:
    likely, span = likely_grade_range(85, 10, 5)
    assert likely == "PSA 10"
    assert span == "PSA 10"
    likely, span = likely_grade_range(40, 35, 25)
    assert likely == "PSA 10"
    assert span == "PSA 9–10"


def test_mapped_probs_run_through_ev_engine() -> None:
    engine_probs = vision_probs_to_engine(65, 25, 8)
    result = calculate_ev(
        CalculateEVRequest(
            rawValue=200,
            gradingFee=50,
            shippingCost=15,
            turnaroundDays=45,
            probabilities=engine_probs,
            compPrices=CompPrices(psa10=800, psa9=280, psa8=180, below8=120),
        )
    )
    assert result.recommendation == "GRADE"
    assert result.expected_value > 0


if __name__ == "__main__":
    test_extract_json_from_fenced_markdown()
    test_vision_probs_map_remainder_to_below8()
    test_vision_probs_normalize_when_over_100()
    test_likely_grade_range_covers_majority()
    test_mapped_probs_run_through_ev_engine()
    print("test_openrouter_parse: ok")
