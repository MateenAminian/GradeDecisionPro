"""CardSight sold-auction comps for Decide.

CardSight is called only from the backend with CARDSIGHTAI_API_KEY. The Expo
client receives normalized comp snapshots and never sees the vendor key.
"""

from __future__ import annotations

import asyncio
import copy
import os
import re
import statistics
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.models import CompPrices
from app.schemas import CardMetadata, CompListing, CompSamples, CompSnapshot, CompSnapshotPrices
from app.services.ebay import search_query

BASE_URL = "https://api.cardsight.ai"
DEFAULT_PERIOD = "90d"
DEFAULT_LIMIT = 50
MIN_BUCKET_SAMPLES = 3
MAX_SAVED_LISTINGS = 40
DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60

AUTO_RE = re.compile(r"\bauto(?:graph)?\b", re.I)
PARALLEL_RE = re.compile(
    r"\b("
    r"silver|gold|hyper|refractor|parallel|mojo|cracked\s+ice|"
    r"checkerboard|wave|scope|pulsar|laser|holo|holographic|"
    r"purple|blue|red|green|orange|pink|black|white|bronze|ruby|sapphire|"
    r"zebra|tiger|elephant|disco|shimmer|sparkle|speckle|velocity|choice"
    r")\b",
    re.I,
)

_rate_lock = asyncio.Lock()
_cache_lock = asyncio.Lock()
_last_request_at = 0.0
_sold_cache: dict[tuple[str, str, str, str, str, str, str], tuple[float, SoldComps]] = {}


class CardSightError(RuntimeError):
    """Raised for CardSight transport or HTTP failures."""


def cardsight_configured() -> bool:
    return bool(os.getenv("CARDSIGHTAI_API_KEY", "").strip())


def _cache_ttl_seconds() -> float:
    raw = os.getenv("CARDSIGHT_CACHE_TTL_SECONDS", "").strip()
    if not raw:
        return DEFAULT_CACHE_TTL_SECONDS
    try:
        ttl = float(raw)
    except ValueError:
        return DEFAULT_CACHE_TTL_SECONDS
    return max(0.0, ttl)


def _clean(text: object) -> str:
    return str(text or "").strip()


def _num(value: object) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _grade_bucket(row: dict[str, Any]) -> tuple[str | None, str]:
    grade = row.get("grade") if isinstance(row.get("grade"), dict) else {}
    company = _clean(grade.get("company_name")).lower()
    value = _clean(grade.get("grade_value"))
    label = " ".join(part for part in (_clean(grade.get("company_name")), value) if part).strip()
    if company != "psa":
        return ("raw", "") if not company and not value else (None, label)
    try:
        numeric = float(value)
    except ValueError:
        return None, label
    if numeric >= 10:
        return "psa10", label
    if numeric >= 9:
        return "psa9", label
    if numeric >= 8:
        return "psa8", label
    return "below8", label


def _selected_parallel(meta: CardMetadata) -> str:
    return (meta.parallel or "").strip().lower()


def _row_parallel(row: dict[str, Any]) -> str:
    return _clean(row.get("parallel_name") or row.get("parallel_id")).lower()


def _has_unselected_parallel(row: dict[str, Any], title: str, selected: str) -> bool:
    row_parallel = _row_parallel(row)
    if selected:
        return bool(row_parallel and selected not in row_parallel and row_parallel not in selected)
    if row_parallel:
        return True
    return bool(PARALLEL_RE.search(title))


def _median(values: list[float]) -> float | None:
    cleaned = sorted(v for v in values if v > 0)
    if len(cleaned) < MIN_BUCKET_SAMPLES:
        return None
    if len(cleaned) >= 4:
        mid = cleaned[len(cleaned) // 2]
        cleaned = [v for v in cleaned if 0.25 * mid <= v <= 4 * mid] or cleaned
    return round(float(statistics.median(cleaned)), 2)


def _extract_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("results", "data", "items", "listings"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


@dataclass
class SoldComps:
    query: str
    period: str = DEFAULT_PERIOD
    listing_count: int = 0
    raw: float | None = None
    psa10: float | None = None
    psa9: float | None = None
    psa8: float | None = None
    below8: float | None = None
    samples: dict[str, int] = field(default_factory=lambda: {"raw": 0, "psa10": 0, "psa9": 0, "psa8": 0, "below8": 0})
    thin_buckets: list[str] = field(default_factory=list)
    fetched_at: float = field(default_factory=time.time)
    listings: list[CompListing] = field(default_factory=list)

    def to_snapshot(self, fallback: CompPrices) -> CompSnapshot:
        used_sold = any(v is not None for v in (self.raw, self.psa10, self.psa9, self.psa8, self.below8))
        source = "cardsight-sold" if used_sold and not self.thin_buckets else "cardsight-sold-partial"
        if not used_sold:
            source = "cardsight-sold-thin"
        return CompSnapshot(
            source=source,
            basis="sold",
            query=self.query,
            listingCount=self.listing_count,
            prices=CompSnapshotPrices(
                psa10=self.psa10,
                psa9=self.psa9,
                psa8=self.psa8,
                below8=self.below8,
            ),
            samples=CompSamples(
                raw=self.samples.get("raw", 0),
                psa10=self.samples.get("psa10", 0),
                psa9=self.samples.get("psa9", 0),
                psa8=self.samples.get("psa8", 0),
                below8=self.samples.get("below8", 0),
            ),
            fetchedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.fetched_at)),
            raw=self.raw,
            listings=self.listings[:MAX_SAVED_LISTINGS],
            period=self.period,
            minSamples=MIN_BUCKET_SAMPLES,
            fallbackBuckets=self.thin_buckets,
            fallbackReason=(
                f"CardSight sold-auction buckets with fewer than {MIN_BUCKET_SAMPLES} sales are insufficient; enter comps manually."
                if self.thin_buckets
                else None
            ),
        )


def aggregate_sold_comps(rows: list[dict[str, Any]], meta: CardMetadata, *, query: str, period: str = DEFAULT_PERIOD) -> SoldComps:
    """Filter CardSight rows and compute clean sold-auction medians by grade bucket."""
    selected = _selected_parallel(meta)
    buckets: dict[str, list[float]] = {"raw": [], "psa10": [], "psa9": [], "psa8": [], "below8": []}
    trusted: dict[str, list[float]] = {"psa10": [], "psa9": [], "psa8": [], "below8": []}
    listings: list[CompListing] = []

    for row in rows:
        title = _clean(row.get("title"))
        if not title or AUTO_RE.search(title):
            continue
        if _clean(row.get("listing_type")).lower() != "auction":
            continue
        if _has_unselected_parallel(row, title, selected):
            continue
        price = _num(row.get("price"))
        if price is None:
            continue
        bucket, grade_label = _grade_bucket(row)
        if bucket is None:
            continue
        matched = bool(row.get("matched_card"))
        buckets[bucket].append(price)
        if bucket != "raw" and matched:
            trusted[bucket].append(price)
        listings.append(
            CompListing(
                title=title[:160],
                price=price,
                bucket=bucket,
                url=_clean(row.get("url")),
                itemId=_clean(row.get("id") or row.get("item_id") or row.get("listing_id")),
                source=_clean(row.get("source")),
                listingType=_clean(row.get("listing_type")),
                soldAt=_clean(row.get("date")) or None,
                grade=grade_label,
            )
        )

    values: dict[str, float | None] = {}
    samples: dict[str, int] = {}
    thin: list[str] = []
    for bucket, prices in buckets.items():
        median_input = prices
        if bucket != "raw" and len(trusted[bucket]) >= MIN_BUCKET_SAMPLES:
            median_input = trusted[bucket]
        median = _median(median_input)
        values[bucket] = median
        samples[bucket] = len(median_input)
        if median is None:
            thin.append(bucket)

    return SoldComps(
        query=query,
        period=period,
        listing_count=sum(samples.values()),
        raw=values["raw"],
        psa10=values["psa10"],
        psa9=values["psa9"],
        psa8=values["psa8"],
        below8=values["below8"],
        samples=samples,
        thin_buckets=thin,
        listings=listings[:MAX_SAVED_LISTINGS],
    )


async def _throttle() -> None:
    global _last_request_at
    async with _rate_lock:
        now = time.monotonic()
        wait = 0.26 - (now - _last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_at = time.monotonic()


def _cache_key(meta: CardMetadata, *, period: str, listing_type: str) -> tuple[str, str, str, str, str, str, str]:
    return (
        _clean(meta.year).lower(),
        _clean(meta.player).lower(),
        _clean(meta.set).lower(),
        _clean(meta.card_number).lower(),
        _clean(meta.parallel).lower(),
        period,
        listing_type,
    )


async def _cached_sold(key: tuple[str, str, str, str, str, str, str]) -> SoldComps | None:
    ttl = _cache_ttl_seconds()
    if ttl <= 0:
        return None
    async with _cache_lock:
        cached = _sold_cache.get(key)
        if not cached:
            return None
        saved_at, sold = cached
        if time.time() - saved_at > ttl:
            _sold_cache.pop(key, None)
            return None
        return copy.deepcopy(sold)


async def _store_sold(key: tuple[str, str, str, str, str, str, str], sold: SoldComps) -> None:
    if _cache_ttl_seconds() <= 0:
        return
    async with _cache_lock:
        _sold_cache[key] = (time.time(), copy.deepcopy(sold))


def clear_cardsight_cache() -> None:
    _sold_cache.clear()


async def lookup_sold_comps(
    meta: CardMetadata,
    *,
    period: str = DEFAULT_PERIOD,
    limit: int = DEFAULT_LIMIT,
    listing_type: str = "auction",
    refresh: bool = False,
) -> SoldComps | None:
    if not cardsight_configured():
        return None
    query = search_query(meta)
    if not query:
        return None
    key = _cache_key(meta, period=period, listing_type=listing_type)

    if not refresh:
        cached = await _cached_sold(key)
        if cached is not None:
            return cached

    await _throttle()
    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, base_url=BASE_URL) as client:
        response = await client.get(
            "/v1/pricing/search",
            params={"q": query, "listing_type": listing_type, "period": period, "limit": limit},
            headers={"X-API-Key": os.getenv("CARDSIGHTAI_API_KEY", "").strip()},
        )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise CardSightError(f"CardSight HTTP {exc.response.status_code}") from exc
    sold = aggregate_sold_comps(_extract_rows(response.json()), meta, query=query, period=period)
    await _store_sold(key, sold)
    return sold
