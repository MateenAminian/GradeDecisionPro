"""Sold-auction comps route backed by CardSight with eBay asking fallback."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models import CompPrices
from app.schemas import CardMetadata, CompSnapshot, LookupCompsRequest
from app.services.cardsight import CardSightError, cardsight_configured, lookup_sold_comps
from app.services.ebay import lookup_live_comps, search_query

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


def _bucket_price(snapshot: CompSnapshot, bucket: str) -> float | None:
    if bucket == "raw":
        return snapshot.raw
    return getattr(snapshot.prices, bucket)


def _set_bucket_price(snapshot: CompSnapshot, bucket: str, value: float | None) -> None:
    if value is None:
        return
    if bucket == "raw":
        snapshot.raw = value
    else:
        setattr(snapshot.prices, bucket, value)


def _fallback_text(buckets: list[str], reason: str) -> str:
    labels = [BUCKET_LABELS.get(bucket, bucket) for bucket in buckets]
    suffix = f" for {', '.join(labels)}" if labels else ""
    return f"{reason}; using eBay asking fallback{suffix}."


async def _asking_snapshot(meta: CardMetadata, fallback: CompPrices, *, refresh: bool, reason: str, buckets: list[str] | None = None) -> CompSnapshot:
    live = await lookup_live_comps(meta, refresh=refresh)
    if live:
        snapshot = live.to_snapshot(fallback)
    else:
        snapshot = CompSnapshot(source="placeholder", query=search_query(meta), listingCount=0, prices=fallback)
    snapshot.source = f"{snapshot.source}-fallback" if snapshot.source != "placeholder" else "placeholder-fallback"
    snapshot.basis = "asking" if snapshot.source.startswith("ebay") else "manual"
    snapshot.fallbackSource = "ebay"
    snapshot.fallbackBuckets = buckets or ["raw", "psa10", "psa9", "psa8", "below8"]
    snapshot.fallbackReason = _fallback_text(snapshot.fallbackBuckets, reason)
    return snapshot


async def _fill_thin_buckets(snapshot: CompSnapshot, meta: CardMetadata, fallback: CompPrices, *, refresh: bool) -> CompSnapshot:
    thin = list(snapshot.fallback_buckets)
    if not thin:
        return snapshot
    try:
        asking = await lookup_live_comps(meta, refresh=refresh)
    except Exception:
        logger.exception("eBay asking fallback failed after thin CardSight comps")
        asking = None
    if not asking:
        snapshot.fallbackSource = "provided"
        return snapshot

    asking_snapshot = asking.to_snapshot(fallback)
    for bucket in thin:
        _set_bucket_price(snapshot, bucket, _bucket_price(asking_snapshot, bucket))

    snapshot.fallbackSource = "ebay"
    snapshot.fallbackReason = _fallback_text(thin, "CardSight sold-auction sample is thin")
    snapshot.listings = (snapshot.listings + (asking_snapshot.listings or []))[:40]
    return snapshot


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
        return await _asking_snapshot(
            meta,
            fallback,
            refresh=body.refresh,
            reason="CardSight API key is not configured on the backend",
        )

    try:
        sold = await lookup_sold_comps(meta)
    except CardSightError as exc:
        logger.warning("CardSight comps lookup failed: %s", exc)
        return await _asking_snapshot(meta, fallback, refresh=body.refresh, reason="CardSight sold comps failed")
    except Exception as exc:
        logger.exception("Unexpected CardSight comps lookup failure")
        return await _asking_snapshot(meta, fallback, refresh=body.refresh, reason="CardSight sold comps failed")

    if sold is None:
        return await _asking_snapshot(meta, fallback, refresh=body.refresh, reason="CardSight returned no searchable identity")

    snapshot = sold.to_snapshot(fallback)
    return await _fill_thin_buckets(snapshot, meta, fallback, refresh=body.refresh)
