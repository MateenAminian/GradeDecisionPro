"""CardSight sold-auction aggregation. No live API calls."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CompPrices
from app.schemas import CardMetadata
from app.services.cardsight import aggregate_sold_comps


def row(
    title: str,
    price: float,
    *,
    grade: str | None = None,
    company: str = "PSA",
    matched: bool = True,
    listing_type: str = "auction",
    parallel_name: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": title,
        "price": price,
        "date": "2026-09-01",
        "url": "https://example.test/listing",
        "source": "ebay",
        "listing_type": listing_type,
        "matched_card": {"id": "card_123"} if matched else None,
    }
    if grade is not None:
        payload["grade"] = {"company_name": company, "grade_value": grade}
    if parallel_name is not None:
        payload["parallel_name"] = parallel_name
    return payload


def test_aggregate_clean_medians_excludes_autos_and_unselected_parallels() -> None:
    meta = CardMetadata(year="2018", player="Luka Doncic", set="Prizm", cardNumber="280", parallel="")
    rows = [
        row("2018 Prizm Luka Doncic #280 PSA 10", 202, grade="10"),
        row("2018 Prizm Luka Doncic #280 PSA 10", 204, grade="10"),
        row("2018 Prizm Luka Doncic #280 PSA 10", 200, grade="10"),
        row("2018 Prizm Luka Doncic #280 PSA 10 AUTO", 999, grade="10"),
        row("2018 Prizm Luka Doncic #280 Gold PSA 10", 1500, grade="10", parallel_name="Gold"),
        row("2018 Prizm Luka Doncic #280 PSA 9", 70, grade="9"),
        row("2018 Prizm Luka Doncic #280 PSA 9", 72, grade="9"),
        row("2018 Prizm Luka Doncic #280 PSA 8", 60, grade="8"),
        row("2018 Prizm Luka Doncic #280 PSA 8", 62, grade="8"),
        row("2018 Prizm Luka Doncic #280 PSA 8", 64, grade="8"),
        row("2018 Prizm Luka Doncic #280", 45, grade=None),
        row("2018 Prizm Luka Doncic #280", 48, grade=None),
        row("2018 Prizm Luka Doncic #280", 51, grade=None),
        row("2018 Prizm Luka Doncic #280 PSA 7", 40, grade="7"),
        row("2018 Prizm Luka Doncic #280 PSA 6", 35, grade="6"),
        row("2018 Prizm Luka Doncic #280 PSA 5", 30, grade="5"),
        row("2018 Prizm Luka Doncic #280 PSA 10 BIN", 1, grade="10", listing_type="fixed_price"),
    ]

    sold = aggregate_sold_comps(rows, meta, query="2018 Luka Doncic Prizm 280")
    snapshot = sold.to_snapshot(CompPrices(psa10=1, psa9=71, psa8=1, below8=1))

    assert sold.psa10 == 202
    assert sold.psa9 is None
    assert sold.psa8 == 62
    assert sold.raw == 48
    assert sold.below8 == 35
    assert "psa9" in sold.thin_buckets
    assert snapshot.prices.psa9 == 71
    assert snapshot.period == "90d"
    assert snapshot.min_samples == 3
    assert all("AUTO" not in listing.title for listing in snapshot.listings)
    assert all("Gold" not in listing.title for listing in snapshot.listings)


def test_prefers_matched_card_rows_for_psa_buckets_when_available() -> None:
    meta = CardMetadata(year="2023", player="Test Player", set="Test Set", cardNumber="1", parallel="")
    rows = [
        row("Test Player #1 PSA 10", 100, grade="10", matched=True),
        row("Test Player #1 PSA 10", 110, grade="10", matched=True),
        row("Test Player #1 PSA 10", 120, grade="10", matched=True),
        row("Wrong card PSA 10", 900, grade="10", matched=False),
        row("Another wrong card PSA 10", 950, grade="10", matched=False),
        row("Third wrong card PSA 10", 1000, grade="10", matched=False),
    ]

    sold = aggregate_sold_comps(rows, meta, query="2023 Test Player Test Set 1")

    assert sold.psa10 == 110
    assert sold.samples["psa10"] == 3


def test_selected_parallel_allows_matching_parallel_rows() -> None:
    meta = CardMetadata(year="2023", player="Test Player", set="Prizm", cardNumber="7", parallel="Silver")
    rows = [
        row("Test Player Silver Prizm PSA 9", 20, grade="9", parallel_name="Silver"),
        row("Test Player Silver Prizm PSA 9", 24, grade="9", parallel_name="Silver"),
        row("Test Player Silver Prizm PSA 9", 22, grade="9", parallel_name="Silver"),
        row("Test Player Gold Prizm PSA 9", 200, grade="9", parallel_name="Gold"),
    ]

    sold = aggregate_sold_comps(rows, meta, query="2023 Test Player Prizm Silver 7")

    assert sold.psa9 == 22
    assert sold.samples["psa9"] == 3


if __name__ == "__main__":
    test_aggregate_clean_medians_excludes_autos_and_unselected_parallels()
    test_prefers_matched_card_rows_for_psa_buckets_when_available()
    test_selected_parallel_allows_matching_parallel_rows()
    print("test_cardsight_comps: ok")
