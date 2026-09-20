"""eBay Marketplace Account Deletion/Closure notifications.

Required to enable a production keyset. We do not store eBay user PII, so
POST notifications are acknowledged and no data is deleted.
"""

from __future__ import annotations

import hashlib
import os


def deletion_configured() -> bool:
    return bool(
        os.getenv("EBAY_DELETION_VERIFICATION_TOKEN", "").strip()
        and os.getenv("EBAY_DELETION_ENDPOINT", "").strip()
    )


def challenge_response(challenge_code: str, verification_token: str, endpoint_url: str) -> str:
    payload = f"{challenge_code}{verification_token}{endpoint_url}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def configured_challenge_response(challenge_code: str) -> str:
    token = os.getenv("EBAY_DELETION_VERIFICATION_TOKEN", "").strip()
    endpoint = os.getenv("EBAY_DELETION_ENDPOINT", "").strip()
    if not token or not endpoint:
        raise RuntimeError("EBAY_DELETION_VERIFICATION_TOKEN / EBAY_DELETION_ENDPOINT are missing")
    return challenge_response(challenge_code, token, endpoint)
