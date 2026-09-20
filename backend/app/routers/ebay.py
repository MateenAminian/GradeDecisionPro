"""eBay connection checks and marketplace account-deletion webhook."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.models import CompPrices
from app.schemas import CardMetadata, LookupCompsRequest
from app.services.ebay import ebay_configured, lookup_live_comps, search_query, validate_ebay_connection
from app.services.ebay_deletion import configured_challenge_response, deletion_configured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["ebay"])


@router.get("/ebay/validate")
async def ebay_validate() -> dict[str, object]:
    if not ebay_configured():
        raise HTTPException(status_code=503, detail="eBay keys are not configured in backend/.env")
    return await validate_ebay_connection()


@router.post("/ebay/comps")
async def ebay_comps(body: LookupCompsRequest):
    if not ebay_configured():
        raise HTTPException(status_code=503, detail="eBay keys are not configured in backend/.env")
    meta = CardMetadata(
        year=body.year,
        player=body.player,
        set=body.set,
        cardNumber=body.card_number,
        parallel=body.parallel,
    )
    if not search_query(meta):
        raise HTTPException(status_code=400, detail="Need a player, set, or card number to search eBay")
    fallback = body.fallback or CompPrices(psa10=800, psa9=280, psa8=180, below8=120)
    try:
        live = await lookup_live_comps(meta, refresh=body.refresh)
    except Exception as exc:
        logger.exception("eBay comps lookup failed")
        raise HTTPException(status_code=502, detail="eBay comps lookup failed") from exc
    if live is None:
        raise HTTPException(status_code=503, detail="eBay is not configured")
    return live.to_snapshot(fallback)


@router.get("/ebay/marketplace-deletion")
async def ebay_deletion_challenge(challenge_code: str) -> JSONResponse:
    """eBay GET challenge when you save the endpoint in Application Keys."""
    if not deletion_configured():
        raise HTTPException(
            status_code=503,
            detail="Set EBAY_DELETION_VERIFICATION_TOKEN and EBAY_DELETION_ENDPOINT in backend/.env",
        )
    try:
        digest = configured_challenge_response(challenge_code)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return JSONResponse({"challengeResponse": digest}, media_type="application/json")


@router.post("/ebay/marketplace-deletion")
async def ebay_deletion_notification(request: Request) -> JSONResponse:
    """Acknowledge account-deletion notifications. No eBay user PII is stored."""
    try:
        payload: Any = await request.json()
    except Exception:
        payload = None
    notification = payload.get("notification") if isinstance(payload, dict) else None
    data = notification.get("data") if isinstance(notification, dict) else None
    user_id = data.get("userId") if isinstance(data, dict) else None
    logger.info("eBay marketplace deletion notice userId=%s (no local eBay user data to remove)", user_id)
    return JSONResponse({"status": "accepted"}, media_type="application/json")
