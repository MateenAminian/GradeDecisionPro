"""FastAPI application entrypoint."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.routers import analyze, cardsight, ebay, ev
from app.services.ebay_deletion import deletion_configured

_on_vercel = os.getenv("VERCEL") == "1"

app = FastAPI(
    title="GradeDecision Pro API",
    version="1.0.0",
    description="Expected-value API for GradeDecision Pro (grade / sell raw / hold).",
    docs_url=None if _on_vercel else "/docs",
    redoc_url=None if _on_vercel else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ev.router)
app.include_router(analyze.router)
app.include_router(cardsight.router)
app.include_router(ebay.router)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "visionConfigured": bool(os.getenv("OPENROUTER_API_KEY", "").strip()),
        "cardsightConfigured": bool(os.getenv("CARDSIGHTAI_API_KEY", "").strip()),
        "ebayConfigured": bool(os.getenv("EBAY_CLIENT_ID", "").strip() and os.getenv("EBAY_CLIENT_SECRET", "").strip()),
        "ebayEnv": os.getenv("EBAY_ENV", "production").strip().lower() or "production",
        "ebayDeletionConfigured": deletion_configured(),
    }
