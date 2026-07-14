import test from "node:test";
import assert from "node:assert/strict";
import { validateCsvRecords } from "./validators/csv.validator.js";

test("accepts valid rows", () => {
  const result = validateCsvRecords([
    {
      date: "2026-01-15",
      description: "Sale",
      category: "sales",
      amount: "120.50",
      type: "revenue",
      vendor_customer: "Acme",
      invoice_id: "INV-1",
      payment_method: "card",
      notes: "",
      currency: "",
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].currency, "USD");
  assert.equal(result.rows[0].month, "2026-01");
});

test("fails whole file on bad amount", () => {
  const result = validateCsvRecords([
    {
      date: "2026-01-15",
      description: "Sale",
      category: "sales",
      amount: "-1",
      type: "revenue",
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors[0].column, "amount");
});

test("rejects missing required header", () => {
  const result = validateCsvRecords([{ date: "2026-01-15", description: "x" }]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.error.includes("required column")));
});
