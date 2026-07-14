import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sha256Hex } from "../lib/hash.js";
import { validateCsvRecords } from "../validators/csv.validator.js";
import { resolveUploadIdentity } from "./eventParser.service.js";
import {
  findDuplicateUpload,
  formatDuplicateFailure,
} from "./duplicate.service.js";
import { parseCsvBuffer } from "./csvParse.service.js";
import { buildUploadSummary } from "./summary.service.js";

/**
 * Core processing pipeline. Controllers call this; it delegates to
 * repositories + focused services (hash, duplicate check, parse, validate).
 */
export function createUploadProcessor({
  uploadRepository,
  transactionRepository,
  storage,
}) {
  return {
    async processStorageObject({ objectName, bucketName, metadata = {} }) {
      const identity = resolveUploadIdentity(objectName, metadata);
      if (!identity) {
        console.warn(`Ignoring object with unexpected path: ${objectName}`);
        return { skipped: true, reason: "bad_path" };
      }

      const { uid, uploadId } = identity;
      const upload = await uploadRepository.getById(uploadId);

      if (!upload) {
        console.warn(`Upload doc ${uploadId} not found`);
        return { skipped: true, reason: "missing_upload_doc" };
      }

      if (upload.uid !== uid) {
        console.warn(`UID mismatch for upload ${uploadId}`);
        return { skipped: true, reason: "uid_mismatch" };
      }

      if (["success", "failed", "processing"].includes(upload.status)) {
        console.log(`Upload ${uploadId} already ${upload.status}; skipping`);
        return {
          skipped: true,
          reason: "already_handled",
          status: upload.status,
        };
      }

      await uploadRepository.update(uploadId, {
        status: "processing",
        processedAt: FieldValue.serverTimestamp(),
      });

      try {
        return await this._processBuffer({
          upload,
          uploadId,
          uid,
          identity,
          objectName,
          bucketName,
        });
      } catch (err) {
        console.error(`Processing failed for ${uploadId}:`, err);
        await uploadRepository.update(uploadId, {
          status: "failed",
          errors: [
            {
              row: 0,
              column: "server",
              error: err.message || "Unexpected processing error",
            },
          ],
          processedAt: FieldValue.serverTimestamp(),
        });
        throw err;
      }
    },

    async _processBuffer({
      upload,
      uploadId,
      uid,
      identity,
      objectName,
      bucketName,
    }) {
      const bucket = storage.bucket(bucketName);
      const [buffer] = await bucket.file(objectName).download();
      const contentHash = sha256Hex(buffer);
      const filename = upload.filename || identity.originalFilename;

      const duplicate = await findDuplicateUpload(uploadRepository, {
        uid,
        uploadId,
        filename,
        contentHash,
      });

      if (duplicate) {
        await uploadRepository.update(uploadId, {
          status: "failed",
          contentHash,
          byteSize: buffer.length,
          errors: [
            {
              row: 0,
              column: "file",
              error: formatDuplicateFailure(duplicate),
            },
          ],
          rowCount: 0,
          processedAt: FieldValue.serverTimestamp(),
        });
        return { ok: false, reason: "duplicate" };
      }

      await uploadRepository.update(uploadId, {
        contentHash,
        byteSize: buffer.length,
      });

      let records;
      try {
        records = parseCsvBuffer(buffer);
      } catch (err) {
        await uploadRepository.update(uploadId, {
          status: "failed",
          errors: [
            {
              row: 1,
              column: "file",
              error: `CSV parse error: ${err.message}`,
            },
          ],
          rowCount: 0,
          processedAt: FieldValue.serverTimestamp(),
        });
        return { ok: false, reason: "parse_error" };
      }

      const validation = validateCsvRecords(records);
      if (!validation.ok) {
        await uploadRepository.update(uploadId, {
          status: "failed",
          errors: validation.errors.slice(0, 200),
          rowCount: records.length,
          processedAt: FieldValue.serverTimestamp(),
        });
        return { ok: false, errorCount: validation.errors.length };
      }

      const now = FieldValue.serverTimestamp();
      const docs = validation.rows.map((row) => ({
        uid,
        date: Timestamp.fromDate(row.date),
        description: row.description,
        category: row.category,
        amount: row.amount,
        type: row.type,
        vendor_customer: row.vendor_customer,
        invoice_id: row.invoice_id,
        payment_method: row.payment_method,
        notes: row.notes,
        currency: row.currency,
        month: row.month,
        uploadId,
        createdAt: now,
      }));

      await transactionRepository.insertMany(docs);

      const summary = buildUploadSummary(validation.rows);
      await uploadRepository.update(uploadId, {
        status: "success",
        errors: [],
        rowCount: docs.length,
        summary,
        processedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true, rowCount: docs.length };
    },
  };
}
