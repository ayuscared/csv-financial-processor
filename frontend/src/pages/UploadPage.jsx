import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../auth/AuthProvider.jsx";
import { db, storage } from "../lib/firebase.js";
import { precheckCsv } from "../lib/csvPrecheck.js";
import { hashFile } from "../lib/fileHash.js";
import {
  findDuplicateUpload,
  formatDuplicateError,
} from "../lib/uploadTracker.js";

export default function UploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [precheckError, setPrecheckError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [uploadDoc, setUploadDoc] = useState(null);
  const [error, setError] = useState("");
  const [priorUploads, setPriorUploads] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, "uploads"), where("uid", "==", user.uid));
    return onSnapshot(q, (snap) => {
      setPriorUploads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!uploadId) return undefined;
    return onSnapshot(doc(db, "uploads", uploadId), (snap) => {
      if (snap.exists()) setUploadDoc({ id: snap.id, ...snap.data() });
    });
  }, [uploadId]);

  const status = uploadDoc?.status || (busy ? "pending" : null);

  async function onUpload(event) {
    event.preventDefault();
    if (!file || !user) return;

    setError("");
    setPrecheckError("");
    setUploadDoc(null);
    setUploadId(null);
    setUploadProgress(0);

    const check = await precheckCsv(file);
    if (!check.ok) {
      setPrecheckError(check.message);
      return;
    }

    setBusy(true);
    try {
      const contentHash = await hashFile(file);
      const duplicate = findDuplicateUpload(priorUploads, {
        filename: file.name,
        contentHash,
      });
      if (duplicate) {
        setError(formatDuplicateError(duplicate));
        return;
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

      setUploadId(uploadRef.id);

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
            const pct =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(Math.round(pct));
          },
          reject,
          resolve
        );
      });

      await getDownloadURL(storageRef);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const errors = useMemo(() => uploadDoc?.errors || [], [uploadDoc]);

  const trackedCount = priorUploads.filter((u) =>
    ["success", "pending", "processing"].includes(u.status)
  ).length;

  return (
    <div>
      <h1>Upload CSV</h1>
      <p className="muted">
        Select a transactions file. Duplicate filenames or identical file
        contents are blocked. Full validation runs on the server after upload.
      </p>
      <p className="muted">
        Tracked uploads for your account: <strong>{trackedCount}</strong>
      </p>

      <form className="panel form" onSubmit={onUpload} style={{ marginTop: "1.25rem" }}>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
              setPrecheckError("");
            }}
          />
        </label>
        {precheckError ? <div className="error">{precheckError}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="btn" type="submit" disabled={!file || busy}>
          {busy ? `Uploading ${uploadProgress}%…` : "Upload"}
        </button>
      </form>

      {status ? (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <strong>Status</strong>
            <span className={`status ${status}`}>{status}</span>
          </div>
          {uploadDoc?.filename ? (
            <p className="muted">File: {uploadDoc.filename}</p>
          ) : null}
          {uploadDoc?.rowCount ? (
            <p className="muted">Rows processed: {uploadDoc.rowCount}</p>
          ) : null}
          {status === "pending" || status === "processing" ? (
            <p className="muted">Waiting for Cloud Run to process the file…</p>
          ) : null}
          {status === "failed" && errors.length ? (
            <table className="error-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Column</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, idx) => (
                  <tr key={`${err.row}-${err.column}-${idx}`}>
                    <td>{err.row}</td>
                    <td>{err.column}</td>
                    <td>{err.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {status === "success" ? (
            <p style={{ color: "var(--accent)" }}>
              Upload processed successfully. Check the dashboard for updated
              totals.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
