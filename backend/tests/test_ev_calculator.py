"""Golden-case tests for the EV engine. Run from repo root:

    PYTHONPATH=backend python3 backend/tests/test_ev_calculator.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CalculateEVRequest, CompPrices, GradeProbabilities
from app.services.ev_calculator import calculate_ev


def _req(**kwargs) -> CalculateEVRequest:
    return CalculateEVRequest(**kwargs)


def assert_close(actual: float, expected: float, tol: float = 0.05, label: str = "") -> None:
    if abs(actual - expected) > tol:
        raise AssertionError(f"{label} expected {expected}, got {actual}")


def test_break_even_is_lowest_profitable_grade() -> None:
    """Previously inverted: reported the highest grade that still exceeded cost."""
    result = calculate_ev(
        _req(
            rawValue=200,
            gradingFee=50,
            shippingCost=15,
            turnaroundDays=45,
            probabilities=GradeProbabilities(psa10=65, psa9=25, psa8=8, below8=2),
            compPrices=CompPrices(psa10=800, psa9=280, psa8=180, below8=120),
        )
    )
    # threshold = 265; PSA 9 (280) is the lowest grade that covers it
    assert result.break_even_grade == "PSA 9", result.break_even_grade
    assert_close(result.break_even_probability, 90, label="P(break-even)")
    assert_close(result.expected_value, 606.8, label="EV")
    assert_close(result.expected_profit, 341.8, label="profit")
    assert result.recommendation == "GRADE", result.recommendation
    assert result.submission_cost == 65


def test_unprofitable_sell_raw() -> None:
    result = calculate_ev(
        _req(
            rawValue=200,
            gradingFee=50,
            shippingCost=15,
            turnaroundDays=45,
            probabilities=GradeProbabilities(psa10=5, psa9=20, psa8=35, below8=40),
            compPrices=CompPrices(psa10=220, psa9=180, psa8=150, below8=100),
        )
    )
    assert result.break_even_grade == "None"
    assert result.recommendation == "SELL_RAW"
    assert result.expected_profit < 0


def test_marginal_hold_requires_gem() -> None:
    result = calculate_ev(
        _req(
            rawValue=150,
            gradingFee=50,
            shippingCost=20,
            turnaroundDays=90,
            probabilities=GradeProbabilities(psa10=20, psa9=40, psa8=30, below8=10),
            compPrices=CompPrices(psa10=500, psa9=180, psa8=140, below8=80),
        )
    )
    assert result.expected_profit > 0
    assert result.break_even_grade == "PSA 10"
    assert_close(result.break_even_probability, 20, label="P(BE)")
    assert result.recommendation == "HOLD", result.recommendation


def test_normalizes_probabilities() -> None:
    result = calculate_ev(
        _req(
            rawValue=100,
            gradingFee=25,
            shippingCost=10,
            turnaroundDays=45,
            probabilities=GradeProbabilities(psa10=50, psa9=50, psa8=0, below8=0),
            compPrices=CompPrices(psa10=400, psa9=150, psa8=80, below8=40),
        )
    )
    # 50/50 already sums to 100, no normalize flag
    assert result.probabilities_normalized is False
    assert_close(result.expected_value, 275, label="EV 50/50")

    skewed = calculate_ev(
        _req(
            rawValue=100,
            gradingFee=25,
            shippingCost=10,
            turnaroundDays=45,
            probabilities=GradeProbabilities(psa10=80, psa9=80, psa8=0, below8=0),
            compPrices=CompPrices(psa10=400, psa9=150, psa8=80, below8=40),
        )
    )
    assert skewed.probabilities_normalized is True
    assert_close(skewed.expected_value, 275, label="EV normalized 80/80")


def test_roi_is_on_fees_annualized_on_capital() -> None:
    result = calculate_ev(
        _req(
            rawValue=200,
            gradingFee=50,
            shippingCost=15,
            turnaroundDays=45,
            probabilities=GradeProbabilities(psa10=65, psa9=25, psa8=8, below8=2),
            compPrices=CompPrices(psa10=800, psa9=280, psa8=180, below8=120),
        )
    )
    # profit 341.8 / 65 fees = 525.85%
    assert_close(result.roi, 525.85, label="fee ROI")
    # capital 265; capital ROI 341.8/265 = 128.98%; * 365/45 = 1046.16%
    assert_close(result.capital_roi, 128.98, label="capital ROI")
    assert_close(result.annualized_roi, 1046.18, label="annualized")
    assert result.capital_deployed == 265


if __name__ == "__main__":
    tests = [
        test_break_even_is_lowest_profitable_grade,
        test_unprofitable_sell_raw,
        test_marginal_hold_requires_gem,
        test_normalizes_probabilities,
        test_roi_is_on_fees_annualized_on_capital,
    ]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed")
