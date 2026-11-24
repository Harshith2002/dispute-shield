# Dispute Shield

Predicts how exposed each ScanPay payment is to a chargeback and how likely the team is to win, advises fight or accept on each dispute, and estimates what product policies would have done to dispute losses over months 1–22.

```
data/        raw CSVs from the brief (not committed)
backend/     Python: features, models, what-if, FastAPI app, train.py, tests, experiments/, artifacts/
frontend/    React (Vite) app served by FastAPI in production
APPROACH.md  approach document
```

## Run locally

Requires Python 3.15 and Node 22 or later.

```bash
# 1. train (about 4 min): writes backend/artifacts/ and backend/experiments/
cd backend
pip install -r requirements.txt
python train.py --data ../data          # --boot 30 bootstrap draws for what-if ranges (default)
python -m pytest tests -q

# 2. frontend
cd ../frontend
npm ci
npm run build                           # or `npm run dev` (proxies /api to :8000)

# 3. serve API + built frontend on one port
cd ../backend
uvicorn api:app --port 8000             # open http://localhost:8000
```

`backend/artifacts/` (frozen models and app data, about 2.4 MB) is committed, so the app runs without the raw data.

## Using the app

1. **Score files**, the period being scored:
   - **Upload**, one step at a time:
     - Step 1: upload `invoices.csv`, `photos.csv` and `payments.csv`. Scoring opens Payments.
     - Step 2: upload `disputes.csv`. Scoring opens Disputes.
     - Download `payment_predictions.csv`, `dispute_predictions.csv` and `whatif_results.csv`.
     - For a test upload, `python make_sample.py` (from `backend/`) cuts July–August 2026 out of `data/` into `data/sample_upload/`. The models were trained on those months, so it tests the app, not the models.
   - **Payments:** risk tier, win chances and expected loss. Click a row to see what to add before and after payment.
   - **Disputes:** win chance, fight or accept, and which evidence to submit.

   Payments and Disputes are greyed out until their step has been scored. A new step 1 replaces the previous upload; periods are never merged.
2. **Months 1–22**, the history the models learned from:
   - **Teams:** one team's record, its biggest paperwork gaps compared with the platform, and its uploaded payments and disputes.
   - **Dispute reasons:** disputes, win rate and dollars lost by dispute reason.
   - **Policy what-if:** each policy's estimated effect, with a range and a confidence level.

Uploads are scored with the frozen months 1–22 models and never used for training. They are held in memory for each browser tab. Step 2 re-sends the step 1 files, so scoring still works if the server restarted between steps.

## Deploy

The repo root contains a `Dockerfile` that builds one container: it compiles the frontend, then runs FastAPI with `uvicorn` on `$PORT`.

- **Render:** create a Web Service from the repo with runtime Docker. The Starter plan never sleeps.
- **Hugging Face Spaces:** create a Docker Space and add `app_port: 8000` to the Space's README front matter (Spaces default to port 7860). Free Spaces sleep after about 48 hours without visits.

## Extending

- **New dispute reason:** add a `Reason` entry in `backend/reasons.py` (key, label, key evidence, guidance) and run `train.py` again. Features, models, views and exports pick it up automatically.
- **New policy:** add a `Policy` entry in `backend/policies.py` with three functions: which payments it affects, how their features change, and what share of jobs is lost. The what-if engine, CSV and app pick it up automatically.
- **New evidence type:** add an `EvidenceRule` entry in `backend/evidence.py`.
