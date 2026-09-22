"""Sold-auction comps route backed by CardSight."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models import CompPrices
from app.schemas import CardMetadata, CompSnapshot, LookupCompsRequest
from app.services.cardsight import CardSightError, DEFAULT_PERIOD, MIN_BUCKET_SAMPLES, cardsight_configured, lookup_sold_comps
from app.services.ebay import search_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["cardsight"])

BUCKET_LABELS = {
    "raw": "raw",
    "psa10": "PSA 10",
    "psa9": "PSA 9",
    "psa8": "PSA 8",
    "below8": "below 8",
}


def _zero_comps() -> CompPrices:
    return CompPrices(psa10=0, psa9=0, psa8=0, below8=0)


def _insufficient_text(buckets: list[str], reason: str) -> str:
    labels = [BUCKET_LABELS.get(bucket, bucket) for bucket in buckets]
    suffix = f" for {', '.join(labels)}" if labels else ""
    return f"{reason}; sold comps are insufficient{suffix}. Enter comps manually."


def _empty_sold_snapshot(meta: CardMetadata, *, reason: str, buckets: list[str] | None = None) -> CompSnapshot:
    snapshot = CompSnapshot(
        source="cardsight-sold-unavailable",
        basis="sold",
        query=search_query(meta),
        listingCount=0,
        prices={"psa10": None, "psa9": None, "psa8": None, "below8": None},
        period=DEFAULT_PERIOD,
        minSamples=MIN_BUCKET_SAMPLES,
    )
    snapshot.fallback_buckets = buckets or ["raw", "psa10", "psa9", "psa8", "below8"]
    snapshot.fallback_reason = _insufficient_text(snapshot.fallback_buckets, reason)
    return snapshot


def _graded_thin_count(snapshot: CompSnapshot) -> int:
    return sum(1 for bucket in ("psa10", "psa9", "psa8", "below8") if bucket in snapshot.fallback_buckets)


@router.post("/cardsight/comps")
async def cardsight_comps(body: LookupCompsRequest) -> CompSnapshot:
    meta = CardMetadata(
        year=body.year,
        player=body.player,
        set=body.set,
        cardNumber=body.card_number,
        parallel=body.parallel,
    )
    if not search_query(meta):
        raise HTTPException(status_code=400, detail="Need a player, set, or card number to search comps")

    fallback = body.fallback or _zero_comps()
    if not cardsight_configured():
        return _empty_sold_snapshot(
            meta,
            reason="CardSight API key is not configured on the backend",
        )

    try:
        sold = await lookup_sold_comps(meta, refresh=body.refresh)
    except CardSightError as exc:
        logger.warning("CardSight comps lookup failed: %s", exc)
        return _empty_sold_snapshot(meta, reason="CardSight sold comps failed")
    except Exception as exc:
        logger.exception("Unexpected CardSight comps lookup failure")
        return _empty_sold_snapshot(meta, reason="CardSight sold comps failed")

    if sold is None:
        return _empty_sold_snapshot(meta, reason="CardSight returned no searchable identity")

    snapshot = sold.to_snapshot(fallback)
    if _graded_thin_count(snapshot) > 0 and sold.period != "1y":
        try:
            deepened = await lookup_sold_comps(meta, period="1y", refresh=body.refresh)
        except Exception:
            logger.exception("CardSight 1y deepen retry failed")
            deepened = None
        if deepened is not None:
            deepened_snapshot = deepened.to_snapshot(fallback)
            if _graded_thin_count(deepened_snapshot) < _graded_thin_count(snapshot):
                snapshot = deepened_snapshot
    return snapshot
