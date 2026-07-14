import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  clearAllHistory,
  clearUploadHistory,
  computeDashboardSummaryFromUploads,
  watchUploadsNewestFirst,
} from "../api/index.js";

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function formatWhen(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleString();
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearingId, setClearingId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    return watchUploadsNewestFirst(
      user.uid,
      (data) => {
        setUploads(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  const summary = useMemo(
    () => computeDashboardSummaryFromUploads(uploads),
    [uploads]
  );

  const busy = clearingAll || Boolean(clearingId);

  async function onDeleteUpload(upload) {
    if (!user || busy) return;
    const ok = window.confirm(
      `Delete “${upload.filename}” and all transactions from this file? This cannot be undone.`
    );
    if (!ok) return;

    setActionError("");
    setActionMessage("");
    setClearingId(upload.id);
    try {
      const result = await clearUploadHistory(user, upload);
      setActionMessage(
        `Deleted “${upload.filename}” (${result.transactionsDeleted} transactions).`
      );
    } catch (err) {
      setActionError(err.message || "Failed to delete upload");
    } finally {
      setClearingId(null);
    }
  }

  async function onClearAll() {
    if (!user || busy || uploads.length === 0) return;
    const ok = window.confirm(
      `Clear all history (${uploads.length} files and all related transactions)? This cannot be undone.`
    );
    if (!ok) return;

    setActionError("");
    setActionMessage("");
    setClearingAll(true);
    try {
      const result = await clearAllHistory(user, uploads);
      setActionMessage(
        `Cleared ${result.uploadsDeleted} files and ${result.transactionsDeleted} transactions.`
      );
    } catch (err) {
      setActionError(err.message || "Failed to clear history");
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">
        Totals from your cleaned transactions.{" "}
        <Link to="/upload">Upload a CSV</Link> to add more.
      </p>

      {loading ? <p className="muted">Loading…</p> : null}
      {summary.missingSummaries > 0 ? (
        <p className="muted">
          {summary.missingSummaries} older successful upload
          {summary.missingSummaries === 1 ? "" : "s"} lack a stored summary.
          Delete and re-upload those files to restore full metrics.
        </p>
      ) : null}

      <div className="metrics metrics-wide" style={{ marginTop: "1.25rem" }}>
        <div className="panel metric">
          <h3>Total revenue</h3>
          <strong>{formatMoney(summary.revenue)}</strong>
        </div>
        <div className="panel metric">
          <h3>Total expenses</h3>
          <strong>{formatMoney(summary.expenses)}</strong>
        </div>
        <div className="panel metric">
          <h3>Profit</h3>
          <strong>{formatMoney(summary.profit)}</strong>
        </div>
        <div className="panel metric">
          <h3>Profit margin</h3>
          <strong>{formatPct(summary.margin)}</strong>
        </div>
        <div className="panel metric">
          <h3>Transactions</h3>
          <strong>{summary.transactionCount.toLocaleString()}</strong>
        </div>
        <div className="panel metric">
          <h3>Avg revenue / txn</h3>
          <strong>{formatMoney(summary.avgRevenue)}</strong>
        </div>
        <div className="panel metric">
          <h3>Avg expense / txn</h3>
          <strong>{formatMoney(summary.avgExpense)}</strong>
        </div>
        <div className="panel metric">
          <h3>Successful uploads</h3>
          <strong>{summary.successfulUploads}</strong>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Revenue & expenses by month</h2>
        {summary.monthChart.length === 0 ? (
          <p className="muted">No transaction data yet.</p>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={summary.monthChart}>
                <CartesianGrid stroke="rgba(232,242,238,0.08)" vertical={false} />
                <XAxis dataKey="month" stroke="#9bb5ab" />
                <YAxis stroke="#9bb5ab" tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value) => formatMoney(value)}
                  contentStyle={{
                    background: "#182622",
                    border: "1px solid rgba(232,242,238,0.12)",
                  }}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#3dcc91" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="#e6c07b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Top categories</h2>
        {summary.topCategories.length === 0 ? (
          <p className="muted">No categories yet.</p>
        ) : (
          <table className="error-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.topCategories.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
              Uploaded files
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Tracker of every CSV you have submitted ({uploads.length} total
              {summary.failedUploads
                ? `, ${summary.failedUploads} failed`
                : ""}
              ). Deleting a file also removes its transactions.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy || uploads.length === 0}
            onClick={onClearAll}
          >
            {clearingAll ? "Clearing…" : "Clear all history"}
          </button>
        </div>

        {actionError ? <div className="error">{actionError}</div> : null}
        {actionMessage ? (
          <p style={{ color: "var(--accent)" }}>{actionMessage}</p>
        ) : null}

        {uploads.length === 0 ? (
          <p className="muted">No uploads yet.</p>
        ) : (
          <table className="error-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div>{u.filename}</div>
                    {u.contentHash ? (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        sha256:{u.contentHash.slice(0, 12)}…
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`status ${u.status || "pending"}`}>
                      {u.status || "unknown"}
                    </span>
                  </td>
                  <td>{u.rowCount ?? "—"}</td>
                  <td>{formatBytes(u.byteSize)}</td>
                  <td>{formatWhen(u.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy}
                      onClick={() => onDeleteUpload(u)}
                    >
                      {clearingId === u.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
