"""Time-adjusted expected value calculator.

Keep in sync with data/evCalculator.ts
"""

from __future__ import annotations

from app.models import (
    BatchCardResult,
    BatchSummary,
    CalculateBatchEVRequest,
    CalculateBatchEVResponse,
    CalculateEVRequest,
    CompPrices,
    EVResult,
    GradeProbabilities,
)

DEFAULT_CAPITAL_RATE = 0.05
GRADE_HURDLE_PROBABILITY = 40
GRADE_HURDLE_ANNUALIZED_ROI = 15


def _round2(n: float) -> float:
    return round(n + 0.0, 2)


def _normalize(p: GradeProbabilities) -> tuple[GradeProbabilities, bool]:
    total = p.psa10 + p.psa9 + p.psa8 + p.below8
    if total <= 0:
        return GradeProbabilities(psa10=0, psa9=0, psa8=0, below8=0), False
    return (
        GradeProbabilities(
            psa10=p.psa10 / total,
            psa9=p.psa9 / total,
            psa8=p.psa8 / total,
            below8=p.below8 / total,
        ),
        abs(total - 100) > 0.5,
    )


def _break_even_grade(comps: CompPrices, threshold: float) -> str:
    if comps.below8 >= threshold:
        return "PSA 7 or below"
    if comps.psa8 >= threshold:
        return "PSA 8"
    if comps.psa9 >= threshold:
        return "PSA 9"
    if comps.psa10 >= threshold:
        return "PSA 10"
    return "None"


def _break_even_probability(grade: str, w: GradeProbabilities) -> float:
    if grade == "None":
        return 0.0
    if grade == "PSA 10":
        return w.psa10 * 100
    if grade == "PSA 9":
        return (w.psa10 + w.psa9) * 100
    if grade == "PSA 8":
        return (w.psa10 + w.psa9 + w.psa8) * 100
    return 100.0


def _recommend(profit: float, net_profit: float, be_grade: str, be_prob: float, annualized_roi: float) -> str:
    if profit <= 0 or be_grade == "None":
        return "SELL_RAW"
    if net_profit > 0 and be_prob >= GRADE_HURDLE_PROBABILITY and annualized_roi >= GRADE_HURDLE_ANNUALIZED_ROI:
        return "GRADE"
    return "HOLD"


def _reasoning(
    *,
    recommendation: str,
    expected_value: float,
    raw_value: float,
    profit: float,
    cost: float,
    be_grade: str,
    be_prob: float,
    roi: float,
    annualized_roi: float,
    days: float,
    capital: float,
    opportunity_cost: float,
) -> list[str]:
    if recommendation == "GRADE":
        lift = ((expected_value - raw_value) / raw_value) * 100 if raw_value else 0
        return [
            f"Expected graded sale of ${expected_value:.0f} beats raw ${raw_value:.0f} by {lift:.0f}% before costs.",
            (
                f"Break-even is {be_grade} (need ≥ ${raw_value + cost:.0f} after ${cost:.0f} in fees). "
                f"Probability of getting there: {be_prob:.0f}%."
            ),
            (
                f"Time-adjusted annualized return on ${capital:.0f} locked for {days:.0f} days is "
                f"{annualized_roi:.0f}% (ROI on fees {roi:.0f}%)."
            ),
        ]
    if recommendation == "HOLD":
        be_line = (
            "Even a PSA 10 does not cover raw value plus grading costs at current comps."
            if be_grade == "None"
            else f"Break-even is {be_grade} at {be_prob:.0f}% odds — not a high-confidence submit."
        )
        return [
            f"Expected profit of ${profit:.0f} is positive, but the case is thin after time and risk.",
            be_line,
            (
                f"${capital:.0f} would be locked for {days:.0f} days "
                f"(≈${opportunity_cost:.2f} opportunity cost). Wait for stronger comps or a cheaper/faster service."
            ),
        ]
    be_line = (
        "Even a PSA 10 comp is below break-even. Selling raw preserves capital."
        if be_grade == "None"
        else f"You would need {be_grade} or better ({be_prob:.0f}% odds) just to break even."
    )
    return [
        (
            f"Expected graded sale of ${expected_value:.0f} does not cover raw ${raw_value:.0f} "
            f"plus ${cost:.0f} in grading costs (expected {'+' if profit >= 0 else ''}${profit:.0f})."
        ),
        be_line,
        f"Selling raw avoids a {days:.0f}-day lockup of ${capital:.0f}.",
    ]


def calculate_ev(payload: CalculateEVRequest) -> EVResult:
    raw_value = max(0.0, payload.raw_value)
    grading_fee = max(0.0, payload.grading_fee)
    shipping_cost = max(0.0, payload.shipping_cost)
    turnaround_days = max(payload.turnaround_days, 1.0)
    capital_rate = payload.capital_rate if payload.capital_rate is not None else DEFAULT_CAPITAL_RATE

    weights, did_normalize = _normalize(payload.probabilities)
    comps = payload.comp_prices

    expected_value = (
        weights.psa10 * comps.psa10
        + weights.psa9 * comps.psa9
        + weights.psa8 * comps.psa8
        + weights.below8 * comps.below8
    )
    submission_cost = grading_fee + shipping_cost
    expected_profit = expected_value - raw_value - submission_cost
    capital_deployed = raw_value + submission_cost
    opportunity_cost = capital_deployed * capital_rate * (turnaround_days / 365)
    net_profit = expected_profit - opportunity_cost

    be_grade = _break_even_grade(comps, raw_value + submission_cost)
    be_prob = _break_even_probability(be_grade, weights)

    roi = (expected_profit / submission_cost) * 100 if submission_cost > 0 else 0.0
    capital_roi = (expected_profit / capital_deployed) * 100 if capital_deployed > 0 else 0.0
    annualized_roi = capital_roi * (365 / turnaround_days)

    recommendation = _recommend(expected_profit, net_profit, be_grade, be_prob, annualized_roi)

    ev = _round2(expected_value)
    profit = _round2(expected_profit)
    cost = _round2(submission_cost)
    be_prob_r = _round2(be_prob)
    roi_r = _round2(roi)
    ann_r = _round2(annualized_roi)
    capital_r = _round2(capital_deployed)
    opp_r = _round2(opportunity_cost)

    return EVResult(
        expectedValue=ev,
        expectedProfit=profit,
        netProfit=_round2(net_profit),
        breakEvenGrade=be_grade,
        breakEvenProbability=be_prob_r,
        submissionCost=cost,
        capitalDeployed=capital_r,
        opportunityCost=opp_r,
        roi=roi_r,
        capitalRoi=_round2(capital_roi),
        annualizedRoi=ann_r,
        recommendation=recommendation,
        reasoning=_reasoning(
            recommendation=recommendation,
            expected_value=ev,
            raw_value=raw_value,
            profit=profit,
            cost=cost,
            be_grade=be_grade,
            be_prob=be_prob_r,
            roi=roi_r,
            annualized_roi=ann_r,
            days=turnaround_days,
            capital=capital_r,
            opportunity_cost=opp_r,
        ),
        probabilitiesNormalized=did_normalize,
    )


def calculate_batch_ev(payload: CalculateBatchEVRequest) -> CalculateBatchEVResponse:
    included = [c for c in payload.cards if c.included]
    n = len(included)
    per_card_shipping = payload.shipping_cost / n if n > 0 else 0.0

    evaluated: list[BatchCardResult] = []
    for card in payload.cards:
        ev = calculate_ev(
            CalculateEVRequest(
                rawValue=card.raw_value,
                gradingFee=payload.grading_fee,
                shippingCost=per_card_shipping if card.included else 0.0,
                turnaroundDays=payload.turnaround_days,
                probabilities=card.probabilities,
                compPrices=card.comp_prices,
                capitalRate=payload.capital_rate,
            )
        )
        evaluated.append(
            BatchCardResult(
                id=card.id,
                name=card.name,
                rawValue=card.raw_value,
                probabilities=card.probabilities,
                profileId=card.profile_id,
                compPrices=card.comp_prices,
                included=card.included,
                evResult=ev,
            )
        )

    included_results = [c for c in evaluated if c.included]
    total_raw = sum(c.raw_value for c in included_results)
    total_grading = n * payload.grading_fee
    total_shipping = payload.shipping_cost if n > 0 else 0.0
    total_ev = sum(c.ev_result.expected_value for c in included_results if c.ev_result)
    total_profit = total_ev - total_raw - total_grading - total_shipping
    total_cost = total_grading + total_shipping
    overall_roi = (total_profit / total_cost) * 100 if total_cost > 0 else 0.0
    capital = total_raw + total_cost
    days = max(payload.turnaround_days, 1.0)
    capital_roi = (total_profit / capital) * 100 if capital > 0 else 0.0
    annualized = capital_roi * (365 / days)
    worth = sum(1 for c in evaluated if c.ev_result and c.ev_result.recommendation == "GRADE")

    return CalculateBatchEVResponse(
        cards=evaluated,
        summary=BatchSummary(
            totalCards=len(evaluated),
            includedCards=n,
            totalRawValue=_round2(total_raw),
            totalGradingCost=_round2(total_grading + total_shipping),
            totalShippingCost=_round2(total_shipping),
            totalExpectedValue=_round2(total_ev),
            totalExpectedProfit=_round2(total_profit),
            overallROI=_round2(overall_roi),
            annualizedRoi=_round2(annualized),
            worthGrading=worth,
            notWorthGrading=len(evaluated) - worth,
        ),
    )


def calculate_ev_from_parts(
    *,
    raw_value: float,
    grading_fee: float,
    shipping_cost: float,
    turnaround_days: float,
    probabilities: GradeProbabilities,
    comp_prices: CompPrices,
) -> EVResult:
    return calculate_ev(
        CalculateEVRequest(
            rawValue=raw_value,
            gradingFee=grading_fee,
            shippingCost=shipping_cost,
            turnaroundDays=turnaround_days,
            probabilities=probabilities,
            compPrices=comp_prices,
        )
    )
