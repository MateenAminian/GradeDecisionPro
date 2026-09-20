"""Pydantic models for the GradeDecision Pro EV API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    """Serialize/validate using camelCase aliases to match the Expo client."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class GradeProbabilities(CamelModel):
    psa10: float = Field(..., ge=0, le=100)
    psa9: float = Field(..., ge=0, le=100)
    psa8: float = Field(..., ge=0, le=100)
    below8: float = Field(..., ge=0, le=100)


class CompPrices(CamelModel):
    psa10: float = Field(..., ge=0)
    psa9: float = Field(..., ge=0)
    psa8: float = Field(..., ge=0)
    below8: float = Field(..., ge=0)


class CalculateEVRequest(CamelModel):
    raw_value: float = Field(..., ge=0, alias="rawValue")
    grading_fee: float = Field(..., ge=0, alias="gradingFee")
    shipping_cost: float = Field(..., ge=0, alias="shippingCost")
    turnaround_days: float = Field(..., gt=0, alias="turnaroundDays")
    probabilities: GradeProbabilities
    comp_prices: CompPrices = Field(..., alias="compPrices")
    capital_rate: float | None = Field(None, ge=0, le=1, alias="capitalRate")


class EVResult(CamelModel):
    expected_value: float = Field(..., alias="expectedValue")
    expected_profit: float = Field(..., alias="expectedProfit")
    net_profit: float = Field(..., alias="netProfit")
    break_even_grade: str = Field(..., alias="breakEvenGrade")
    break_even_probability: float = Field(..., alias="breakEvenProbability")
    submission_cost: float = Field(..., alias="submissionCost")
    capital_deployed: float = Field(..., alias="capitalDeployed")
    opportunity_cost: float = Field(..., alias="opportunityCost")
    roi: float
    capital_roi: float = Field(..., alias="capitalRoi")
    annualized_roi: float = Field(..., alias="annualizedRoi")
    recommendation: Literal["GRADE", "SELL_RAW", "HOLD"]
    reasoning: list[str]
    probabilities_normalized: bool = Field(..., alias="probabilitiesNormalized")


class BatchCardInput(CamelModel):
    id: str
    name: str
    raw_value: float = Field(..., alias="rawValue")
    probabilities: GradeProbabilities
    profile_id: str = Field("custom", alias="profileId")
    comp_prices: CompPrices = Field(..., alias="compPrices")
    included: bool = True


class CalculateBatchEVRequest(CamelModel):
    cards: list[BatchCardInput]
    grading_fee: float = Field(..., ge=0, alias="gradingFee")
    shipping_cost: float = Field(..., ge=0, alias="shippingCost")
    turnaround_days: float = Field(..., gt=0, alias="turnaroundDays")
    capital_rate: float | None = Field(None, ge=0, le=1, alias="capitalRate")


class BatchCardResult(BatchCardInput):
    ev_result: EVResult | None = Field(None, alias="evResult")


class BatchSummary(CamelModel):
    total_cards: int = Field(..., alias="totalCards")
    included_cards: int = Field(..., alias="includedCards")
    total_raw_value: float = Field(..., alias="totalRawValue")
    total_grading_cost: float = Field(..., alias="totalGradingCost")
    total_shipping_cost: float = Field(..., alias="totalShippingCost")
    total_expected_value: float = Field(..., alias="totalExpectedValue")
    total_expected_profit: float = Field(..., alias="totalExpectedProfit")
    overall_roi: float = Field(..., alias="overallROI")
    annualized_roi: float = Field(..., alias="annualizedRoi")
    worth_grading: int = Field(..., alias="worthGrading")
    not_worth_grading: int = Field(..., alias="notWorthGrading")


class CalculateBatchEVResponse(CamelModel):
    cards: list[BatchCardResult]
    summary: BatchSummary
