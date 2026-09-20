# GradeDecision Pro

**Know before you submit.** A financial decision engine for sports card grading: model expected value, break-even grade, and time-adjusted ROI — then get a clear **Grade / Sell Raw / Hold**.

This is not a price scanner, collection tracker, or AI grader. You enter comps and a probability profile; the app does the math.

## What the MVP does

- Expected value from grade probabilities × comps
- Preset profiles (Modern Mint, Risky Surface, Vintage, Off-Center, Custom)
- Break-even grade (lowest grade that covers raw + fees)
- Time-adjusted ROI on capital locked during turnaround
- Sensitivity: comp price drop and gem-rate shock
- Batch submission modeling (shipping charged once per submission)

## Expo app

```bash
npm install
npx expo start --port 8081
```

- **Browser:** http://localhost:8081
- The calculator runs entirely on-device. No backend required.

## EV math (optional API)

The same engine lives in `data/evCalculator.ts` (app) and `backend/app/services/ev_calculator.py` (API). Keep them in sync.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install pydantic
PYTHONPATH=. python tests/test_ev_calculator.py
```

Or from the repo root after the venv exists: `npm run test:ev`.

To run the API:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Docs: http://localhost:8000/docs
- `POST /api/v1/calculate-ev`
- `POST /api/v1/calculate-batch-ev`
- `POST /api/v1/analyze-batch`
- `POST /api/v1/ebay/comps`

Put keys in `backend/.env` (see `backend/.env.example`). Never commit that file.

## Hosting (Vercel)

This repo deploys as **two Vercel projects** from the same GitHub repo:

1. **API** — root directory `backend`. Framework: FastAPI. Env vars: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENV=production`, `EBAY_MARKETPLACE_ID=EBAY_US`, `EBAY_DELETION_VERIFICATION_TOKEN`, `EBAY_DELETION_ENDPOINT` (the public API URL + `/api/v1/ebay/marketplace-deletion`).
2. **Web** — root directory `.` (repo root). Env var: `EXPO_PUBLIC_API_URL=https://<your-api-project>.vercel.app` (no trailing slash).

Hobby functions time out at 10s; card vision often needs longer. Use a Pro project (60s) for the API, or scans may fail. Vercel also caps request bodies (~4.5MB on Hobby) — keep photos under that.

After the API is live, update the eBay Application Keys deletion endpoint to the hosted URL and Save so production keys stay enabled.

If the **backend** project build log shows `npx expo export -p web`, Vercel is building the repo root (the web app). In that project: Settings → General → Root Directory → `backend` → Save → Redeploy. The web project stays at Root Directory `.`.

## Decision rules

1. **SELL RAW** — expected profit ≤ 0, or even a PSA 10 misses break-even.
2. **GRADE** — expected profit stays positive after 5% opportunity cost, ≥ 40% odds of hitting break-even, and ≥ 15% annualized ROI on locked capital.
3. **HOLD** — profit is positive but odds or capital velocity are too thin. Wait for stronger comps or a cheaper/faster service.

## Stop local servers

```bash
lsof -ti:8081,8000 | xargs kill -9
```
