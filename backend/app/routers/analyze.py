"""Multipart batch vision analysis endpoint."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models import CalculateEVRequest, CompPrices
from app.schemas import AnalyzeBatchResponse, CardAnalysisResult, CompSnapshot, VisionAnalysisOutput
from app.services.ebay import lookup_live_comps, merge_comps
from app.services.ev_calculator import calculate_ev
from app.services.openrouter import (
    analyze_single_card_image,
    default_comps,
    likely_grade_range,
    vision_probs_to_engine,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["vision"])

MAX_FILES = 12
MAX_BYTES = 8 * 1024 * 1024


async def _combine(vision: VisionAnalysisOutput, *, filename: str, raw_value: float, grading_fee: float, shipping_cost: float, turnaround_days: float, comps: CompPrices) -> CardAnalysisResult:
    gp = vision.grade_probabilities
    engine_probs = vision_probs_to_engine(gp.psa10_percent, gp.psa9_percent, gp.psa8_percent)
    used_comps = comps
    snapshot: CompSnapshot | None = None
    try:
        live = await lookup_live_comps(vision.metadata)
    except Exception:
        logger.exception("eBay live comps failed for %s", filename)
        live = None
    if live:
        used_comps = merge_comps(live, comps)
        snapshot = live.to_snapshot(comps)
        raw = live.raw if live.raw and live.raw > 0 else (
            vision.estimated_raw_value if vision.estimated_raw_value and vision.estimated_raw_value > 0 else raw_value
        )
    else:
        raw = vision.estimated_raw_value if vision.estimated_raw_value and vision.estimated_raw_value > 0 else raw_value
        snapshot = CompSnapshot(source="placeholder", query="", listingCount=0, prices=used_comps)

    likely, grade_range = likely_grade_range(gp.psa10_percent, gp.psa9_percent, gp.psa8_percent)
    ev = calculate_ev(
        CalculateEVRequest(
            rawValue=raw,
            gradingFee=grading_fee,
            shippingCost=shipping_cost,
            turnaroundDays=turnaround_days,
            probabilities=engine_probs,
            compPrices=used_comps,
        )
    )
    notes: list[str] = []
    if snapshot and snapshot.source.startswith("ebay"):
        notes.append(
            f"Prices are median live eBay asking prices ({snapshot.listing_count} listings). Not sold comps."
        )
        missing = [
            label
            for label, count in (
                ("PSA 10", snapshot.samples.psa10),
                ("PSA 9", snapshot.samples.psa9),
                ("PSA 8", snapshot.samples.psa8),
                ("below 8", snapshot.samples.below8),
            )
            if count <= 0
        ]
        if missing:
            notes.append("Fallback Decide comps used for: " + ", ".join(missing) + ".")
    return CardAnalysisResult(
        filename=filename,
        ok=True,
        metadata=vision.metadata,
        conditionReport=vision.condition_report,
        gradeProbabilities=gp,
        estimatedRawValue=raw,
        expectedValue=ev.expected_value,
        expectedProfit=ev.expected_profit,
        likelyGrade=likely,
        gradeRange=grade_range,
        recommendation=ev.recommendation,
        reasoning=notes + ev.reasoning,
        evResult=ev,
        comps=snapshot,
    )


async def _analyze_one(
    upload: UploadFile,
    *,
    fallback_raw: float,
    grading_fee: float,
    shipping_cost: float,
    turnaround_days: float,
    comps: CompPrices,
) -> CardAnalysisResult:
    filename = upload.filename or "card.jpg"
    try:
        data = await upload.read()
        if not data:
            raise ValueError("empty file")
        if len(data) > MAX_BYTES:
            raise ValueError(f"file exceeds {MAX_BYTES // (1024 * 1024)}MB limit")
        vision = await analyze_single_card_image(data)
        return await _combine(
            vision,
            filename=filename,
            raw_value=fallback_raw,
            grading_fee=grading_fee,
            shipping_cost=shipping_cost,
            turnaround_days=turnaround_days,
            comps=comps,
        )
    except Exception as exc:
        logger.exception("Vision analysis failed for %s", filename)
        return CardAnalysisResult(
            filename=filename,
            ok=False,
            error=str(exc),
        )


@router.post("/analyze-batch", response_model=AnalyzeBatchResponse)
async def analyze_batch(
    files: list[UploadFile] = File(...),
    grading_fee: float = Form(50, alias="gradingFee"),
    shipping_cost: float = Form(15, alias="shippingCost"),
    turnaround_days: float = Form(45, alias="turnaroundDays"),
    raw_value: float = Form(200, alias="rawValue"),
    psa10_comp: float = Form(800, alias="psa10Comp"),
    psa9_comp: float = Form(280, alias="psa9Comp"),
    psa8_comp: float = Form(180, alias="psa8Comp"),
    below8_comp: float = Form(120, alias="below8Comp"),
) -> AnalyzeBatchResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one card image")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} images per batch")

    comps = CompPrices(
        psa10=max(0.0, psa10_comp),
        psa9=max(0.0, psa9_comp),
        psa8=max(0.0, psa8_comp),
        below8=max(0.0, below8_comp),
    ) if any(v > 0 for v in (psa10_comp, psa9_comp, psa8_comp, below8_comp)) else default_comps()

    n = len(files)
    per_card_shipping = shipping_cost / n if n > 0 else 0.0

    tasks = [
        _analyze_one(
            upload,
            fallback_raw=raw_value,
            grading_fee=grading_fee,
            shipping_cost=per_card_shipping,
            turnaround_days=max(turnaround_days, 1.0),
            comps=comps,
        )
        for upload in files
    ]
    results = await asyncio.gather(*tasks)

    analyzed = sum(1 for r in results if r.ok)
    failed = len(results) - analyzed
    return AnalyzeBatchResponse(results=list(results), analyzed=analyzed, failed=failed)
