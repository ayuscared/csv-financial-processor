export const REQUIRED_COLUMNS = [
  "date",
  "description",
  "category",
  "amount",
  "type",
];

export const OPTIONAL_COLUMNS = [
  "vendor_customer",
  "invoice_id",
  "payment_method",
  "notes",
  "currency",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPositiveNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function parseIsoDate(value) {
  if (!ISO_DATE.test(String(value || "").trim())) return null;
  const [y, m, d] = String(value).trim().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/**
 * Fail-whole-file validation. Returns { ok, errors, rows }.
 * Row numbers are 1-based data rows (header is row 1 conceptually for users;
 * error.row uses spreadsheet-style numbering where the first data row is 2).
 */
export function validateCsvRecords(records) {
  const errors = [];

  if (!records.length) {
    return {
      ok: false,
      errors: [{ row: 1, column: "file", error: "CSV has no data rows" }],
      rows: [],
    };
  }

  const headers = Object.keys(records[0]);
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const headerMap = new Map();
  headers.forEach((h, i) => headerMap.set(normalized[i], h));

  for (const col of REQUIRED_COLUMNS) {
    if (!normalized.includes(col)) {
      errors.push({
        row: 1,
        column: col,
        error: "required column missing from header",
      });
    }
  }

  if (errors.length) {
    return { ok: false, errors, rows: [] };
  }

  const rows = [];

  records.forEach((record, index) => {
    const rowNum = index + 2; // header is line 1
    const get = (col) => {
      const key = headerMap.get(col);
      const raw = key == null ? "" : record[key];
      return raw == null ? "" : String(raw).trim();
    };

    const dateRaw = get("date");
    const description = get("description");
    const category = get("category");
    const amountRaw = get("amount");
    const type = get("type").toLowerCase();
    const vendorCustomer = get("vendor_customer");
    const invoiceId = get("invoice_id");
    const paymentMethod = get("payment_method");
    const notes = get("notes");
    let currency = get("currency");

    const parsedDate = parseIsoDate(dateRaw);
    if (!parsedDate) {
      errors.push({
        row: rowNum,
        column: "date",
        error: "must be ISO date YYYY-MM-DD",
      });
    }

    if (!description) {
      errors.push({
        row: rowNum,
        column: "description",
        error: "required",
      });
    }

    if (!category) {
      errors.push({
        row: rowNum,
        column: "category",
        error: "required",
      });
    }

    if (!isPositiveNumber(amountRaw)) {
      errors.push({
        row: rowNum,
        column: "amount",
        error: "must be a positive number",
      });
    }

    if (type !== "revenue" && type !== "expense") {
      errors.push({
        row: rowNum,
        column: "type",
        error: 'must be "revenue" or "expense"',
      });
    }

    if (!currency) currency = "USD";

    if (errors.length) return;

    const amount = Number(amountRaw);
    const month = `${parsedDate.getUTCFullYear()}-${String(
      parsedDate.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    rows.push({
      date: parsedDate,
      description,
      category,
      amount,
      type,
      vendor_customer: vendorCustomer || null,
      invoice_id: invoiceId || null,
      payment_method: paymentMethod || null,
      notes: notes || null,
      currency,
      month,
    });
  });

  if (errors.length) {
    return { ok: false, errors, rows: [] };
  }

  return { ok: true, errors: [], rows };
}
