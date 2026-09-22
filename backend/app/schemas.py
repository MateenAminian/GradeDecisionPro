"""Vision + combined analysis API schemas (camelCase to match the Expo client)."""

from __future__ import annotations

from pydantic import Field, field_validator, model_validator

from app.models import CamelModel, CompPrices, EVResult


class CompSamples(CamelModel):
    raw: int = 0
    psa10: int = 0
    psa9: int = 0
    psa8: int = 0
    below8: int = 0


class CompSnapshotPrices(CamelModel):
    psa10: float | None = Field(None, ge=0)
    psa9: float | None = Field(None, ge=0)
    psa8: float | None = Field(None, ge=0)
    below8: float | None = Field(None, ge=0)

    @model_validator(mode="before")
    @classmethod
    def _accept_comp_prices(cls, v: object) -> object:
        if isinstance(v, CompPrices):
            return v.model_dump()
        return v


class CompListing(CamelModel):
    title: str
    price: float | None = None
    bucket: str = ""
    url: str = ""
    item_id: str = Field("", alias="itemId")
    source: str = ""
    listing_type: str = Field("", alias="listingType")
    sold_at: str | None = Field(None, alias="soldAt")
    grade: str = ""


class CompSnapshot(CamelModel):
    source: str = "placeholder"
    query: str = ""
    listing_count: int = Field(0, alias="listingCount")
    prices: CompSnapshotPrices
    samples: CompSamples = Field(default_factory=CompSamples)
    fetched_at: str | None = Field(None, alias="fetchedAt")
    raw: float | None = None
    listings: list[CompListing] = Field(default_factory=list)
    basis: str | None = None
    period: str | None = None
    min_samples: int | None = Field(None, alias="minSamples")
    fallback_source: str | None = Field(None, alias="fallbackSource")
    fallback_reason: str | None = Field(None, alias="fallbackReason")
    fallback_buckets: list[str] = Field(default_factory=list, alias="fallbackBuckets")


class LookupCompsRequest(CamelModel):
    year: str = ""
    player: str = ""
    set: str = ""
    card_number: str = Field("", alias="cardNumber")
    parallel: str = ""
    refresh: bool = False
    fallback: CompPrices | None = None


class CardMetadata(CamelModel):
    year: str = ""
    player: str = ""
    set: str = ""
    card_number: str = Field("", alias="cardNumber")
    parallel: str = ""


class ConditionReport(CamelModel):
    centering: str = ""
    corners: str = ""
    surface_notes: str = Field("", alias="surfaceNotes")


class VisionGradeProbabilities(CamelModel):
    """OpenRouter output: PSA 10/9/8 percents that should sum to ~100."""

    psa10_percent: float = Field(..., ge=0, le=100, alias="psa10Percent")
    psa9_percent: float = Field(..., ge=0, le=100, alias="psa9Percent")
    psa8_percent: float = Field(..., ge=0, le=100, alias="psa8Percent")

    @model_validator(mode="after")
    def _nonzero(self) -> VisionGradeProbabilities:
        total = self.psa10_percent + self.psa9_percent + self.psa8_percent
        if total <= 0:
            raise ValueError("grade probabilities must be greater than 0")
        return self


class VisionAnalysisOutput(CamelModel):
    metadata: CardMetadata
    condition_report: ConditionReport = Field(..., alias="conditionReport")
    grade_probabilities: VisionGradeProbabilities = Field(..., alias="gradeProbabilities")
    estimated_raw_value: float | None = Field(None, ge=0, alias="estimatedRawValue")

    @field_validator("estimated_raw_value", mode="before")
    @classmethod
    def _empty_raw(cls, v: object) -> object:
        if v == "" or v is False:
            return None
        return v


class CardAnalysisResult(CamelModel):
    filename: str
    ok: bool = True
    error: str | None = None
    metadata: CardMetadata | None = None
    condition_report: ConditionReport | None = Field(None, alias="conditionReport")
    grade_probabilities: VisionGradeProbabilities | None = Field(None, alias="gradeProbabilities")
    estimated_raw_value: float | None = Field(None, alias="estimatedRawValue")
    expected_value: float | None = Field(None, alias="expectedValue")
    expected_profit: float | None = Field(None, alias="expectedProfit")
    likely_grade: str | None = Field(None, alias="likelyGrade")
    grade_range: str | None = Field(None, alias="gradeRange")
    recommendation: str | None = None
    reasoning: list[str] = Field(default_factory=list)
    ev_result: EVResult | None = Field(None, alias="evResult")
    comps: CompSnapshot | None = None


class AnalyzeBatchResponse(CamelModel):
    results: list[CardAnalysisResult]
    analyzed: int
    failed: int
