import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * On Cloud Run, Application Default Credentials are provided automatically.
 * Locally, set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path,
 * or run: gcloud auth application-default login
 */
export function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
    storage: getStorage(),
  };
}
