import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  countTrackedUploads,
  submitCsvUpload,
  watchUploadDoc,
  watchUserUploads,
} from "../api/index.js";

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
    return watchUserUploads(user.uid, setPriorUploads);
  }, [user]);

  useEffect(() => {
    if (!uploadId) return undefined;
    return watchUploadDoc(uploadId, setUploadDoc);
  }, [uploadId]);

  const status = uploadDoc?.status || (busy ? "pending" : null);
  const trackedCount = countTrackedUploads(priorUploads);
  const errors = useMemo(() => uploadDoc?.errors || [], [uploadDoc]);

  async function onUpload(event) {
    event.preventDefault();
    if (!file || !user) return;

    setError("");
    setPrecheckError("");
    setUploadDoc(null);
    setUploadId(null);
    setUploadProgress(0);
    setBusy(true);

    try {
      const { uploadId: id } = await submitCsvUpload({
        user,
        file,
        priorUploads,
        onProgress: setUploadProgress,
      });
      setUploadId(id);
    } catch (err) {
      if (err.code === "precheck") {
        setPrecheckError(err.message);
      } else {
        setError(err.message || "Upload failed");
      }
    } finally {
      setBusy(false);
    }
  }

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
