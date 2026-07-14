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
import { db, storage } from "./firebase.js";

const BATCH_LIMIT = 400;

async function deleteTransactionsForUpload(uid, uploadId) {
  let deleted = 0;
  for (;;) {
    const snap = await getDocs(
      query(
        collection(db, "transactions"),
        where("uid", "==", uid),
        where("uploadId", "==", uploadId),
        limit(BATCH_LIMIT)
      )
    );
    if (snap.empty) break;

    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    deleted += snap.docs.length;

    if (snap.docs.length < BATCH_LIMIT) break;
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

/**
 * Remove one upload: related transactions, Storage object, and upload doc.
 */
export async function clearUploadHistory(user, upload) {
  if (!user?.uid || !upload?.id) {
    throw new Error("Missing user or upload");
  }
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

/**
 * Remove every upload (and their transactions/files) for the signed-in user.
 */
export async function clearAllHistory(user, uploads) {
  if (!user?.uid) throw new Error("Not signed in");
  let uploadsDeleted = 0;
  let transactionsDeleted = 0;

  for (const upload of uploads) {
    const result = await clearUploadHistory(user, upload);
    uploadsDeleted += 1;
    transactionsDeleted += result.transactionsDeleted;
  }

  return { uploadsDeleted, transactionsDeleted };
}
