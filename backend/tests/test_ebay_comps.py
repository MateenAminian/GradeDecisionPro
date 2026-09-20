"""eBay live-listing title classification and median comps. No live API calls."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CompPrices
from app.services.ebay import classify_title, median_price, merge_comps, search_query
from app.schemas import CardMetadata
from app.services.ebay import LiveComps


def test_classify_psa_and_raw() -> None:
    assert classify_title("2018 Panini Prizm Luka Doncic #280 PSA 10") == "psa10"
    assert classify_title("Luka Doncic Prizm PSA10 Gem Mint") == "psa10"
    assert classify_title("2018 Prizm Luka Doncic PSA 9") == "psa9"
    assert classify_title("Luka Doncic Prizm #280 PSA 8") == "psa8"
    assert classify_title("Luka Doncic Prizm PSA 7") == "below8"
    assert classify_title("2018 Panini Prizm Luka Doncic #280 RC") == "raw"
    assert classify_title("Lot of 10 Luka Doncic Prizm cards") is None


def test_median_drops_outliers() -> None:
    assert median_price([]) is None
    assert median_price([100, 110, 90]) == 100
    assert median_price([12, 14, 13, 900]) == 13


def test_search_query_skips_blanks() -> None:
    q = search_query(CardMetadata(year="2018", player="Luka Doncic", set="Prizm", cardNumber="#280", parallel=""))
    assert q == "2018 Luka Doncic Prizm 280"


def test_merge_keeps_fallback_when_live_missing() -> None:
    live = LiveComps(query="x", psa10=1200, psa9=None, psa8=None, below8=None)
    merged = merge_comps(live, CompPrices(psa10=800, psa9=280, psa8=180, below8=120))
    assert merged.psa10 == 1200
    assert merged.psa9 == 280


def test_bucket_sandbox_shaped_browse_payload() -> None:
    from app.services.ebay import _bucket_items

    items = [
        {"title": "Sandbox Test Gold Tone Button 20mm", "price": {"value": "79.99", "currency": "USD"}},
        {"title": "2018 Panini Prizm Luka Doncic #280 PSA 10", "price": {"value": "420.00", "currency": "USD"}},
        {"title": "2018 Prizm Luka Doncic PSA 9", "price": {"value": "140.00", "currency": "USD"}},
        {"title": "Luka Doncic Prizm PSA 8", "price": {"value": "90.00", "currency": "USD"}},
        {"title": "2018 Panini Prizm Luka Doncic #280 RC", "price": {"value": "55.00", "currency": "USD"}},
        {"title": "Lot of 10 Luka Prizm cards", "price": {"value": "12.00", "currency": "USD"}},
    ]
    live = _bucket_items(items)
    assert live.listing_count == 5
    assert live.psa10 == 420
    assert live.psa9 == 140
    assert live.psa8 == 90
    assert live.raw == 67.5
    assert live.samples["psa10"] == 1
    assert live.samples["raw"] == 2
    assert [row.bucket for row in live.listings] == ["raw", "psa10", "psa9", "psa8", "raw"]
    assert live.listings[1].price == 420
    assert live.to_snapshot(CompPrices(psa10=800, psa9=280, psa8=180, below8=120)).listings[1].title.startswith("2018 Panini")


if __name__ == "__main__":
    test_classify_psa_and_raw()
    test_median_drops_outliers()
    test_search_query_skips_blanks()
    test_merge_keeps_fallback_when_live_missing()
    test_bucket_sandbox_shaped_browse_payload()
    print("test_ebay_comps: ok")
