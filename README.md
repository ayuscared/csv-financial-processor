# CSV Financial Processor

Authenticated web app that uploads financial transaction CSVs to Firebase Storage, processes them on Cloud Run (via Eventarc), stores clean rows in Firestore, and shows a dashboard (revenue, expenses, profit, revenue by month).

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React (Vite), Firebase Auth / Firestore / Storage SDKs |
| Backend | Node.js (Express) on Cloud Run |
| Trigger | Cloud Storage `object.finalized` → Eventarc → Cloud Run |
| Data | Firestore (`uploads`, `transactions`) + Storage (`uploads/{uid}/…`) |

**Project:** `csv-financial-planner`  
**Cloud Run:** `https://csv-processor-273007822272.us-east1.run.app`  
**Region:** `us-east1` (matches Storage bucket location)

## Architecture

1. User signs in (email/password).
2. Client does a **header-only** pre-check (UX only).
3. Frontend creates `/uploads/{id}` (`pending`) and uploads to  
   `uploads/{uid}/{uploadId}_{filename}.csv`.
4. Eventarc wakes Cloud Run on finalize.
5. Cloud Run validates **every** row (source of truth).  
   - **v1 policy:** any invalid row fails the **whole** file — no `/transactions` writes.  
   - Success: batch-writes rows and sets upload `success`.  
   - Failure: sets upload `failed` with `{ row, column, error }[]`.
6. Dashboard listens to `/transactions` for the signed-in user.

## CSV columns (v1)

Required: `date` (YYYY-MM-DD), `description`, `category`, `amount` (positive number), `type` (`revenue`|`expense`)  

Optional: `vendor_customer`, `invoice_id`, `payment_method`, `notes`, `currency` (default `USD`)

## Repo layout

```
/frontend     React (Vite) app
/backend      Cloud Run service
/scripts      CSV generator + Cloud Run deploy
/samples      Sample CSVs (generated sizes are gitignored; tiny.csv kept)
```

## Backend architecture (API layering)

```
HTTP request
  → routes/          (path binding)
  → controllers/     (req/res, call services)
  → services/        (business logic, delegate to repos/validators)
  → repositories/    (Firestore / Storage I/O)
```

Composition root: [`backend/src/app.js`](backend/src/app.js)

Endpoints:
- `GET /health` and `GET /api/v1/health`
- `POST /` and `POST /api/v1/process` (Eventarc finalize + manual test)

## Frontend architecture

Pages stay thin and call [`frontend/src/api/index.js`](frontend/src/api/index.js), which delegates to services (`upload`, `history`, `dashboard`, `duplicate`).

---

## Prerequisites

- Node 20+
- Python 3 (sample generator)
- Firebase CLI (`~/.npm.global/bin` or `npm i -g firebase-tools`)
- gcloud (installed via Homebrew `gcloud-cli`)
- Firebase **Blaze** plan (Storage + Cloud Run)

## Frontend setup

```bash
cd frontend
cp .env.example .env.local   # already filled for this project if present
npm install
npm run dev
```

Open http://localhost:5173 — sign up / log in, then Upload or Dashboard.

## Backend (local)

Uses Application Default Credentials:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project csv-financial-planner

cd backend
npm install
GOOGLE_CLOUD_PROJECT=csv-financial-planner \
FIREBASE_STORAGE_BUCKET=csv-financial-planner.firebasestorage.app \
npm run dev
```

Manual process (also works against deployed Cloud Run):

```bash
curl -X POST https://csv-processor-273007822272.us-east1.run.app \
  -H 'Content-Type: application/json' \
  -d '{"bucket":"csv-financial-planner.firebasestorage.app","name":"uploads/<uid>/<uploadId>_file.csv"}'
```

Validate unit tests:

```bash
cd backend && npm run test:validate
```

## Sample CSV generator

```bash
python3 scripts/generate_sample_csv.py --size 100kb
python3 scripts/generate_sample_csv.py --size 5mb --out samples/transactions_5mb.csv
python3 scripts/generate_sample_csv.py --size 10mb --invalid
```

`samples/tiny.csv` is a small valid fixture checked into the repo.

## Deploy Firebase rules

```bash
export PATH="$HOME/.npm.global/bin:$PATH"
firebase use csv-financial-planner
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Deploy Cloud Run + Eventarc

```bash
bash scripts/deploy_cloud_run.sh
```

This redeploys `csv-processor` and ensures trigger `csv-upload-finalize`  
(`google.cloud.storage.object.v1.finalized` on `csv-financial-planner.firebasestorage.app`).

## Smoke checklist

1. `curl -sS https://csv-processor-273007822272.us-east1.run.app/health` → `{"ok":true}`
2. `npm run dev` in `frontend`, create an account
3. Upload `samples/tiny.csv` → status should move `pending` → `processing` → `success`
4. Dashboard shows revenue / expenses / profit / revenue-by-month
5. Upload an `--invalid` generated file → status `failed` with row/column errors; no new transactions

If an upload is stuck on `processing` after a crash, reset the Firestore `uploads/{id}.status` back to `pending` and re-upload or POST the manual process payload.

## Security notes

- Storage writes limited to `uploads/{uid}/**` for the signed-in user
- Clients can create `uploads` docs as `pending` only; status updates are Admin SDK (Cloud Run)
- Clients can read their own `transactions`; writes are Admin-only
- Do not commit `.env.local` or service account JSON keys
