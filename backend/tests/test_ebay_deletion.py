"""Marketplace deletion challenge hash. No live eBay calls."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ebay_deletion import challenge_response


def test_challenge_hash_order_and_hex() -> None:
    digest = challenge_response(
        "abc123",
        "token_value_here",
        "https://example.com/api/v1/ebay/marketplace-deletion",
    )
    assert digest == challenge_response(
        "abc123",
        "token_value_here",
        "https://example.com/api/v1/ebay/marketplace-deletion",
    )
    assert len(digest) == 64
    assert digest == digest.lower()
    # Different endpoint URL must change the hash (common portal mismatch).
    other = challenge_response(
        "abc123",
        "token_value_here",
        "https://example.com/api/v1/ebay/marketplace-deletion/",
    )
    assert other != digest


if __name__ == "__main__":
    test_challenge_hash_order_and_hex()
    print("test_ebay_deletion: ok")
