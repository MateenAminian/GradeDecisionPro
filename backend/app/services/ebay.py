"""eBay Browse API live-listing comps for the scan POC.

Asking prices only — sold history is not available on the public Browse API.
"""

from __future__ import annotations

import json
import logging
import os
import re
import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from app.models import CompPrices
from app.schemas import CardMetadata, CompListing, CompSamples, CompSnapshot

logger = logging.getLogger(__name__)

SCOPE = "https://api.ebay.com/oauth/api_scope"
SPORTS_SINGLES_CATEGORY = "261328"
CACHE_PATH = Path(__file__).resolve().parents[2] / ".cache" / "ebay-comps.json"

LOT_RE = re.compile(
    r"\blot\s+of\b|\brepack\b|\bbreak\b|\b(hobby|retail)\s+box\b|\bcase\b|"
    r"\b\d{2,}\s*cards\b|\bx\s*\d{2,}\b",
    re.I,
)
PSA10_RE = re.compile(r"\bpsa\s*10\b", re.I)
PSA9_RE = re.compile(r"\bpsa\s*9\b", re.I)
PSA8_RE = re.compile(r"\bpsa\s*8\b", re.I)
OTHER_GRADED_RE = re.compile(r"\bpsa\s*[1-7]\b|\bbgs\b|\bsgc\b|\bcgc\b|\bcsg\b|\bgraded\b", re.I)

_token: str | None = None
_token_expires = 0.0
_mem_cache: dict[str, dict[str, Any]] = {}


def ebay_configured() -> bool:
    return bool(os.getenv("EBAY_CLIENT_ID", "").strip() and os.getenv("EBAY_CLIENT_SECRET", "").strip())


def ebay_base_url() -> str:
    env = os.getenv("EBAY_ENV", "production").strip().lower()
    if env in {"sandbox", "sandox"}:
        return "https://api.sandbox.ebay.com"
    return "https://api.ebay.com"


def _cache_key(query: str) -> str:
    env = os.getenv("EBAY_ENV", "production").strip().lower() or "production"
    return f"{env}:{query.strip().lower()}"


def cache_ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("COMP_CACHE_TTL_SECONDS", "86400")))
    except ValueError:
        return 86400


def search_query(meta: CardMetadata) -> str:
    number = (meta.card_number or "").strip().lstrip("#").strip()
    parts = [meta.year, meta.player, meta.set, meta.parallel, number]
    return " ".join(part.strip() for part in parts if part and part.strip())


def classify_title(title: str) -> str | None:
    """Bucket a live listing into raw / psa10 / psa9 / psa8 / below8, or skip junk."""
    if not title or LOT_RE.search(title):
        return None
    if PSA10_RE.search(title):
        return "psa10"
    if PSA9_RE.search(title):
        return "psa9"
    if PSA8_RE.search(title):
        return "psa8"
    if OTHER_GRADED_RE.search(title):
        return "below8"
    return "raw"


def median_price(values: list[float]) -> float | None:
    cleaned = [v for v in values if v > 0]
    if len(cleaned) < 1:
        return None
    cleaned.sort()
    if len(cleaned) >= 4:
        mid = cleaned[len(cleaned) // 2]
        cleaned = [v for v in cleaned if 0.25 * mid <= v <= 4 * mid] or cleaned
    return round(float(statistics.median(cleaned)), 2)


MAX_SAVED_LISTINGS = 40


@dataclass
class LiveComps:
    query: str
    listing_count: int = 0
    raw: float | None = None
    psa10: float | None = None
    psa9: float | None = None
    psa8: float | None = None
    below8: float | None = None
    samples: dict[str, int] = field(default_factory=lambda: {"raw": 0, "psa10": 0, "psa9": 0, "psa8": 0, "below8": 0})
    fetched_at: float = field(default_factory=time.time)
    listings: list[CompListing] = field(default_factory=list)

    def to_snapshot(self, fallback: CompPrices) -> CompSnapshot:
        used_live = any(v is not None for v in (self.raw, self.psa10, self.psa9, self.psa8, self.below8))
        source = "placeholder"
        if used_live and None not in (self.psa10, self.psa9, self.psa8, self.below8):
            source = "ebay-live"
        elif used_live:
            source = "ebay-live-partial"
        return CompSnapshot(
            source=source,
            query=self.query,
            listingCount=self.listing_count,
            prices=merge_comps(self, fallback),
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
        )


def merge_comps(live: LiveComps, fallback: CompPrices) -> CompPrices:
    return CompPrices(
        psa10=live.psa10 if live.psa10 is not None else fallback.psa10,
        psa9=live.psa9 if live.psa9 is not None else fallback.psa9,
        psa8=live.psa8 if live.psa8 is not None else fallback.psa8,
        below8=live.below8 if live.below8 is not None else fallback.below8,
    )


def _load_disk_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _save_disk_cache() -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(_mem_cache))


def _from_cache(key: str) -> LiveComps | None:
    global _mem_cache
    if not _mem_cache:
        _mem_cache = _load_disk_cache()
    row = _mem_cache.get(key)
    if not row:
        return None
    if time.time() - float(row.get("fetched_at", 0)) > cache_ttl_seconds():
        return None
    listings: list[CompListing] = []
    for entry in row.get("listings") or []:
        if not isinstance(entry, dict):
            continue
        try:
            listings.append(CompListing.model_validate(entry))
        except Exception:
            continue
    return LiveComps(
        query=row.get("query", key),
        listing_count=int(row.get("listing_count", 0)),
        raw=row.get("raw"),
        psa10=row.get("psa10"),
        psa9=row.get("psa9"),
        psa8=row.get("psa8"),
        below8=row.get("below8"),
        samples=row.get("samples") or {"raw": 0, "psa10": 0, "psa9": 0, "psa8": 0, "below8": 0},
        fetched_at=float(row.get("fetched_at", time.time())),
        listings=listings,
    )


def _to_cache(key: str, live: LiveComps) -> None:
    _mem_cache[key] = {
        "query": live.query,
        "listing_count": live.listing_count,
        "raw": live.raw,
        "psa10": live.psa10,
        "psa9": live.psa9,
        "psa8": live.psa8,
        "below8": live.below8,
        "samples": live.samples,
        "fetched_at": live.fetched_at,
        "listings": [item.model_dump(by_alias=True) for item in live.listings[:MAX_SAVED_LISTINGS]],
    }
    try:
        _save_disk_cache()
    except OSError:
        logger.warning("Could not persist eBay comps cache")


async def _access_token(client: httpx.AsyncClient) -> str:
    global _token, _token_expires
    if _token and time.time() < _token_expires - 60:
        return _token
    client_id = os.getenv("EBAY_CLIENT_ID", "").strip()
    client_secret = os.getenv("EBAY_CLIENT_SECRET", "").strip()
    response = await client.post(
        f"{ebay_base_url()}/identity/v1/oauth2/token",
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials", "scope": SCOPE},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"eBay OAuth HTTP {exc.response.status_code}") from exc
    payload = response.json()
    _token = str(payload["access_token"])
    _token_expires = time.time() + float(payload.get("expires_in", 7200))
    return _token


def _item_price(item: dict[str, Any]) -> float | None:
    for key in ("price", "currentBidPrice"):
        price = item.get(key) or {}
        if not isinstance(price, dict):
            continue
        if str(price.get("currency", "USD")).upper() not in {"USD", ""}:
            continue
        try:
            value = float(price.get("value"))
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


def _listing_url(item: dict[str, Any]) -> str:
    return str(item.get("itemWebUrl") or item.get("itemHref") or "").strip()


async def _search(
    client: httpx.AsyncClient,
    token: str,
    query: str,
    *,
    use_category: bool,
    use_filter: bool = True,
) -> list[dict[str, Any]]:
    params: dict[str, str | int] = {"q": query, "limit": 50}
    if use_filter:
        params["filter"] = "buyingOptions:{FIXED_PRICE|AUCTION}"
    if use_category:
        params["category_ids"] = SPORTS_SINGLES_CATEGORY
    response = await client.get(
        f"{ebay_base_url()}/buy/browse/v1/item_summary/search",
        params=params,
        headers={
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": os.getenv("EBAY_MARKETPLACE_ID", "EBAY_US"),
        },
    )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"eBay search HTTP {exc.response.status_code}") from exc
    payload = response.json()
    items = payload.get("itemSummaries") or []
    return items if isinstance(items, list) else []


def _bucket_items(items: list[dict[str, Any]]) -> LiveComps:
    buckets: dict[str, list[float]] = {"raw": [], "psa10": [], "psa9": [], "psa8": [], "below8": []}
    listings: list[CompListing] = []
    used = 0
    for item in items:
        title = str(item.get("title") or "").strip()
        bucket = classify_title(title)
        if not bucket:
            continue
        price = _item_price(item)
        listings.append(
            CompListing(
                title=title[:160],
                price=price,
                bucket=bucket,
                url=_listing_url(item),
                itemId=str(item.get("itemId") or ""),
            )
        )
        if price is None:
            continue
        buckets[bucket].append(price)
        used += 1
    return LiveComps(
        query="",
        listing_count=used,
        raw=median_price(buckets["raw"]),
        psa10=median_price(buckets["psa10"]),
        psa9=median_price(buckets["psa9"]),
        psa8=median_price(buckets["psa8"]),
        below8=median_price(buckets["below8"]),
        samples={key: len(vals) for key, vals in buckets.items()},
        listings=listings[:MAX_SAVED_LISTINGS],
    )


async def lookup_live_comps(meta: CardMetadata, *, refresh: bool = False) -> LiveComps | None:
    """Return live asking-price comps, or None if eBay is not configured / identity is empty."""
    if not ebay_configured():
        return None
    query = search_query(meta)
    if not query:
        return None
    if not refresh:
        cached = _from_cache(_cache_key(query))
        if cached:
            return cached

    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await _access_token(client)
        items = await _search(client, token, query, use_category=True)
        if not items:
            items = await _search(client, token, query, use_category=False, use_filter=False)

    live = _bucket_items(items)
    live.query = query
    if live.listing_count > 0:
        _to_cache(_cache_key(query), live)
    return live


async def validate_ebay_connection() -> dict[str, object]:
    """Exercise OAuth, Browse search, price parsing, empty-card fallback, and cache.

    Sandbox has generic test inventory, not sports cards. A 0-hit card search is expected.
    """
    notes: list[str] = []
    env = os.getenv("EBAY_ENV", "production").strip().lower() or "production"
    result: dict[str, object] = {
        "environment": env,
        "configured": ebay_configured(),
        "oauth": False,
        "search": False,
        "parsedListings": 0,
        "sampleTitles": [],
        "cardQueryEmpty": False,
        "cache": False,
        "readyForProductionSwitch": False,
        "notes": notes,
    }
    if not ebay_configured():
        notes.append("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are missing.")
        return result

    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await _access_token(client)
        result["oauth"] = bool(token)
        probe_items = await _search(client, token, "test", use_category=False, use_filter=False)
        live = _bucket_items(probe_items)
        result["search"] = True
        result["parsedListings"] = live.listing_count
        titles = [str(item.get("title") or "")[:80] for item in probe_items[:3]]
        result["sampleTitles"] = [t.strip() for t in titles if t.strip()]
        if live.listing_count <= 0:
            notes.append("Browse search succeeded but returned no parseable prices.")
        card_items = await _search(
            client, token, "2018 Luka Doncic Prizm 280", use_category=True
        )
        if not card_items:
            card_items = await _search(
                client, token, "2018 Luka Doncic Prizm 280", use_category=False, use_filter=False
            )
        result["cardQueryEmpty"] = len(card_items) == 0
        if env == "sandbox" and not result["cardQueryEmpty"]:
            notes.append("Sandbox unexpectedly returned card listings.")
        elif env == "sandbox":
            notes.append("Sandbox has no sports-card inventory; empty card search is expected.")

    probe_query = "__gdp_validate_test__"
    sample = LiveComps(query=probe_query, listing_count=2, raw=25.0, samples={"raw": 2, "psa10": 0, "psa9": 0, "psa8": 0, "below8": 0})
    key = _cache_key(probe_query)
    _to_cache(key, sample)
    cached = _from_cache(key)
    result["cache"] = bool(cached and cached.raw == 25.0 and cached.listing_count == 2)

    ready = bool(result["oauth"] and result["search"] and int(result["parsedListings"]) > 0 and result["cache"])
    if env == "sandbox":
        ready = ready and bool(result["cardQueryEmpty"])
        notes.append("Production keyset is still required for real card asking prices.")
    result["readyForProductionSwitch"] = ready
    return result

