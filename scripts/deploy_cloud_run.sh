#!/usr/bin/env bash
# Deploy backend to Cloud Run and wire Eventarc (Storage finalize → Cloud Run).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-csv-financial-planner}"
# Must match the Firebase Storage bucket location (this project: us-east1).
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-csv-processor}"
BUCKET="${BUCKET:-csv-financial-planner.firebasestorage.app}"
TRIGGER_NAME="${TRIGGER_NAME:-csv-upload-finalize}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
export PATH="/usr/local/bin:/usr/local/share/google-cloud-sdk/bin:${PATH}"

echo "==> Project: $PROJECT_ID  Region: $REGION  Bucket: $BUCKET"
gcloud config set project "$PROJECT_ID"

echo "==> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  eventarc.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  --project="$PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
EVENTARC_SA="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
GCS_SA="service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com"
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

echo "==> Ensuring service identities exist"
gcloud beta services identity create --service=storage.googleapis.com --project="$PROJECT_ID" >/dev/null || true
gcloud beta services identity create --service=pubsub.googleapis.com --project="$PROJECT_ID" >/dev/null || true
gcloud beta services identity create --service=eventarc.googleapis.com --project="$PROJECT_ID" >/dev/null || true

echo "==> Granting IAM roles"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/datastore.user" \
  --condition=None >/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/eventarc.eventReceiver" \
  --condition=None >/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GCS_SA}" \
  --role="roles/pubsub.publisher" \
  --condition=None >/dev/null || true

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${EVENTARC_SA}" \
  --role="roles/storage.admin" >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/storage.objectAdmin" >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --member="serviceAccount:${PUBSUB_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID" >/dev/null || true

echo "==> Deploying Cloud Run service from source"
gcloud run deploy "$SERVICE" \
  --source="$ROOT/backend" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GCLOUD_PROJECT=${PROJECT_ID},FIREBASE_STORAGE_BUCKET=${BUCKET}" \
  --memory=1Gi \
  --timeout=300 \
  --max-instances=5 \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
echo "Cloud Run URL: $SERVICE_URL"

echo "==> Creating / updating Eventarc trigger"
if gcloud eventarc triggers describe "$TRIGGER_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Trigger already exists: $TRIGGER_NAME"
else
  gcloud eventarc triggers create "$TRIGGER_NAME" \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --destination-run-service="$SERVICE" \
    --destination-run-region="$REGION" \
    --destination-run-path="/" \
    --event-filters="type=google.cloud.storage.object.v1.finalized" \
    --event-filters="bucket=${BUCKET}" \
    --service-account="$COMPUTE_SA"
fi

echo "==> Done"
echo "Health: curl -sS \"$SERVICE_URL/health\""
echo "Manual process:"
echo "  curl -X POST \"$SERVICE_URL\" -H 'Content-Type: application/json' \\"
echo "    -d '{\"bucket\":\"$BUCKET\",\"name\":\"uploads/<uid>/<uploadId>_file.csv\"}'"
