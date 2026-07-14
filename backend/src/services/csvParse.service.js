import { parse } from "csv-parse/sync";

/**
 * CSV text → record objects. Validation is delegated separately.
 */
export function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}
