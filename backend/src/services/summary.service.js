/**
 * Aggregate financial metrics for a set of validated rows (one upload).
 */
export function buildUploadSummary(rows) {
  let revenue = 0;
  let expenses = 0;
  let revenueCount = 0;
  let expenseCount = 0;
  const byMonth = {};
  const categories = {};

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const month = row.month || "unknown";
    if (!byMonth[month]) {
      byMonth[month] = { revenue: 0, expenses: 0 };
    }

    if (row.type === "revenue") {
      revenue += amount;
      revenueCount += 1;
      byMonth[month].revenue += amount;
    } else if (row.type === "expense") {
      expenses += amount;
      expenseCount += 1;
      byMonth[month].expenses += amount;
    }

    const cat = row.category || "uncategorized";
    categories[cat] = (categories[cat] || 0) + amount;
  }

  return {
    revenue,
    expenses,
    revenueCount,
    expenseCount,
    rowCount: rows.length,
    byMonth,
    categories,
  };
}
