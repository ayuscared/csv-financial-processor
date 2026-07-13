import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { db } from "../lib/firebase.js";

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, "transactions"), where("uid", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  const summary = useMemo(() => {
    let revenue = 0;
    let expenses = 0;
    const byMonth = new Map();

    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (row.type === "revenue") {
        revenue += amount;
        const month = row.month || "unknown";
        byMonth.set(month, (byMonth.get(month) || 0) + amount);
      } else if (row.type === "expense") {
        expenses += amount;
      }
    }

    const revenueByMonth = [...byMonth.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      revenue,
      expenses,
      profit: revenue - expenses,
      revenueByMonth,
    };
  }, [rows]);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">
        Totals from your cleaned transactions.{" "}
        <Link to="/upload">Upload a CSV</Link> to refresh.
      </p>

      {loading ? <p className="muted">Loading transactions…</p> : null}

      <div className="metrics" style={{ marginTop: "1.25rem" }}>
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
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Revenue by month</h2>
        {summary.revenueByMonth.length === 0 ? (
          <p className="muted">No revenue data yet.</p>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={summary.revenueByMonth}>
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
                <Bar dataKey="total" fill="#3dcc91" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
