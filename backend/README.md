# GradeDecision Pro API

Optional FastAPI mirror of the on-device EV engine (`data/evCalculator.ts`). The Expo app does not require this server.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/calculate-ev` | Time-adjusted EV + GRADE / SELL_RAW / HOLD |
| POST | `/api/v1/calculate-batch-ev` | Batch EV (shipping allocated once across included cards) |
| POST | `/api/v1/analyze-batch` | Multipart card photos → OpenRouter vision + EV report |

Vision analysis needs `OPENROUTER_API_KEY` in `backend/.env`. Copy `.env.example`. The Expo app posts to `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`).

## Tests

```bash
PYTHONPATH=backend python3 backend/tests/test_ev_calculator.py
PYTHONPATH=backend python3 backend/tests/test_openrouter_parse.py
```
