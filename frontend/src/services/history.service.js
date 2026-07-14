import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "../lib/firebase.js";

const BATCH_LIMIT = 400;
const DELETE_CONCURRENCY = 6;

async function deleteTransactionsForUpload(uid, uploadId) {
  let deleted = 0;
  for (;;) {
    const snap = await getDocs(
      query(
        collection(db, "transactions"),
        where("uid", "==", uid),
        where("uploadId", "==", uploadId),
        limit(BATCH_LIMIT * DELETE_CONCURRENCY)
      )
    );
    if (snap.empty) break;

    const docs = snap.docs;
    const chunks = [];
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      chunks.push(docs.slice(i, i + BATCH_LIMIT));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const batch = writeBatch(db);
        for (const d of chunk) batch.delete(d.ref);
        await batch.commit();
      })
    );

    deleted += docs.length;
    if (docs.length < BATCH_LIMIT * DELETE_CONCURRENCY) break;
  }
  return deleted;
}

async function deleteStorageForUpload(uid, uploadId, filename) {
  if (!filename) return;
  const objectPath = `uploads/${uid}/${uploadId}_${filename}`;
  try {
    await deleteObject(ref(storage, objectPath));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") {
      console.warn("Storage delete failed:", objectPath, err);
    }
  }
}

/** Clear one upload and its related transactions / Storage object. */
export async function clearUploadHistory(user, upload) {
  if (!user?.uid || !upload?.id) throw new Error("Missing user or upload");
  if (upload.uid && upload.uid !== user.uid) {
    throw new Error("Not allowed to delete this upload");
  }

  const transactionsDeleted = await deleteTransactionsForUpload(
    user.uid,
    upload.id
  );
  await deleteStorageForUpload(user.uid, upload.id, upload.filename);
  await deleteDoc(doc(db, "uploads", upload.id));
  return { uploadId: upload.id, transactionsDeleted };
}

/** Clear every upload for the signed-in user (delegates per-file). */
export async function clearAllHistory(user, uploads) {
  if (!user?.uid) throw new Error("Not signed in");
  let uploadsDeleted = 0;
  let transactionsDeleted = 0;

  // Clear sequentially per upload so Storage/rules stay simple; batches inside are parallel.
  for (const upload of uploads) {
    const result = await clearUploadHistory(user, upload);
    uploadsDeleted += 1;
    transactionsDeleted += result.transactionsDeleted;
  }

  return { uploadsDeleted, transactionsDeleted };
}
