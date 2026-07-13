export const REQUIRED_COLUMNS = [
  "date",
  "description",
  "category",
  "amount",
  "type",
];

export const ALL_COLUMNS = [
  ...REQUIRED_COLUMNS,
  "vendor_customer",
  "invoice_id",
  "payment_method",
  "notes",
  "currency",
];

/**
 * Client-side UX pre-check only — not the source of truth.
 * Checks header presence for required columns.
 */
export async function precheckCsv(file) {
  const text = await file.slice(0, 64 * 1024).text();
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) {
    return { ok: false, message: "File appears empty." };
  }

  const headers = parseCsvLine(firstLine).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length) {
    return {
      ok: false,
      message: `Missing required columns: ${missing.join(", ")}`,
    };
  }

  return { ok: true, headers };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
