import { onSnapshot, orderBy, query, where, collection } from "firebase/firestore";
import { db } from "../lib/firebase.js";

/**
 * Build dashboard metrics from per-upload `summary` fields.
 * Avoids downloading every transaction document (which is very slow at scale).
 */
export function computeDashboardSummaryFromUploads(uploads) {
  let revenue = 0;
  let expenses = 0;
  let revenueCount = 0;
  let expenseCount = 0;
  let transactionCount = 0;
  const byMonth = new Map();
  const categoryTotals = new Map();

  for (const upload of uploads) {
    if (upload.status !== "success" || !upload.summary) continue;
    const s = upload.summary;

    revenue += Number(s.revenue) || 0;
    expenses += Number(s.expenses) || 0;
    revenueCount += Number(s.revenueCount) || 0;
    expenseCount += Number(s.expenseCount) || 0;
    transactionCount += Number(s.rowCount) || 0;

    const months = s.byMonth || {};
    for (const [month, bucket] of Object.entries(months)) {
      if (!byMonth.has(month)) {
        byMonth.set(month, { month, revenue: 0, expenses: 0 });
      }
      const target = byMonth.get(month);
      target.revenue += Number(bucket.revenue) || 0;
      target.expenses += Number(bucket.expenses) || 0;
    }

    const categories = s.categories || {};
    for (const [category, total] of Object.entries(categories)) {
      categoryTotals.set(
        category,
        (categoryTotals.get(category) || 0) + (Number(total) || 0)
      );
    }
  }

  const monthChart = [...byMonth.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  const topCategories = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : NaN;
  const missingSummaries = uploads.filter(
    (u) => u.status === "success" && !u.summary
  ).length;

  return {
    revenue,
    expenses,
    profit,
    margin,
    transactionCount,
    revenueCount,
    expenseCount,
    avgRevenue: revenueCount ? revenue / revenueCount : 0,
    avgExpense: expenseCount ? expenses / expenseCount : 0,
    monthChart,
    topCategories,
    successfulUploads: uploads.filter((u) => u.status === "success").length,
    failedUploads: uploads.filter((u) => u.status === "failed").length,
    missingSummaries,
  };
}

/** @deprecated Prefer computeDashboardSummaryFromUploads for performance. */
export function computeDashboardSummary(rows, uploads) {
  return computeDashboardSummaryFromUploads(uploads);
}

export function watchUploadsNewestFirst(uid, onChange, onError) {
  const q = query(
    collection(db, "uploads"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}
