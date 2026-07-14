import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "../lib/firebase.js";
import { precheckCsv } from "../lib/csvPrecheck.js";
import { hashFile } from "../lib/fileHash.js";
import {
  findDuplicateUpload,
  formatDuplicateError,
} from "./duplicate.service.js";

/**
 * Upload orchestration service.
 * Page UI delegates here; this function delegates to precheck → hash →
 * duplicate check → Firestore create → Storage upload.
 */
export async function submitCsvUpload({
  user,
  file,
  priorUploads,
  onProgress,
}) {
  if (!user?.uid) throw new Error("Not signed in");
  if (!file) throw new Error("No file selected");

  const check = await precheckCsv(file);
  if (!check.ok) {
    const error = new Error(check.message);
    error.code = "precheck";
    throw error;
  }

  const contentHash = await hashFile(file);
  const duplicate = findDuplicateUpload(priorUploads, {
    filename: file.name,
    contentHash,
  });
  if (duplicate) {
    const error = new Error(formatDuplicateError(duplicate));
    error.code = "duplicate";
    throw error;
  }

  const uploadRef = await addDoc(collection(db, "uploads"), {
    uid: user.uid,
    filename: file.name,
    contentHash,
    byteSize: file.size,
    status: "pending",
    errors: [],
    rowCount: 0,
    createdAt: serverTimestamp(),
    processedAt: null,
  });

  const objectPath = `uploads/${user.uid}/${uploadRef.id}_${file.name}`;
  const storageRef = ref(storage, objectPath);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || "text/csv",
    customMetadata: {
      uploadId: uploadRef.id,
      uid: user.uid,
      originalFilename: file.name,
      contentHash,
    },
  });

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(Math.round(pct));
      },
      reject,
      resolve
    );
  });

  await getDownloadURL(storageRef);
  return { uploadId: uploadRef.id };
}

export function watchUserUploads(uid, onChange) {
  const q = query(collection(db, "uploads"), where("uid", "==", uid));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function watchUploadDoc(uploadId, onChange) {
  return onSnapshot(doc(db, "uploads", uploadId), (snap) => {
    if (snap.exists()) onChange({ id: snap.id, ...snap.data() });
  });
}
