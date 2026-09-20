"""EV calculation endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.models import CalculateBatchEVRequest, CalculateBatchEVResponse, CalculateEVRequest, EVResult
from app.services.ev_calculator import calculate_batch_ev, calculate_ev

router = APIRouter(prefix="/api/v1", tags=["ev"])


@router.post("/calculate-ev", response_model=EVResult)
async def calculate_ev_endpoint(payload: CalculateEVRequest) -> EVResult:
    return calculate_ev(payload)


@router.post("/calculate-batch-ev", response_model=CalculateBatchEVResponse)
async def calculate_batch_ev_endpoint(payload: CalculateBatchEVRequest) -> CalculateBatchEVResponse:
    return calculate_batch_ev(payload)
