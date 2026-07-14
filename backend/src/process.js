import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { validateCsvRecords } from "./validate.js";

const BATCH_LIMIT = 400;
const ACTIVE_STATUSES = new Set(["pending", "processing", "success"]);

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function findServerDuplicate(db, { uid, uploadId, filename, contentHash }) {
  const snap = await db.collection("uploads").where("uid", "==", uid).get();
  const name = (filename || "").trim().toLowerCase();
  const hash = (contentHash || "").toLowerCase();

  for (const doc of snap.docs) {
    if (doc.id === uploadId) continue;
    const data = doc.data();
    if (!ACTIVE_STATUSES.has(data.status)) continue;
    const sameName =
      name && (data.filename || "").trim().toLowerCase() === name;
    const sameHash =
      hash && (data.contentHash || "").toLowerCase() === hash;
    if (sameName || sameHash) {
      return { id: doc.id, ...data, sameName, sameHash };
    }
  }
  return null;
}

function parseObjectPath(objectName) {
  // Expected: uploads/{uid}/{uploadId}_{filename}.csv
  const parts = objectName.split("/");
  if (parts.length < 3 || parts[0] !== "uploads") {
    return null;
  }
  const uid = parts[1];
  const fileName = parts.slice(2).join("/");
  const underscore = fileName.indexOf("_");
  if (underscore <= 0) return null;
  const uploadId = fileName.slice(0, underscore);
  const originalFilename = fileName.slice(underscore + 1);
  return { uid, uploadId, originalFilename };
}

async function commitTransactionBatches(db, docs) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const slice = docs.slice(i, i + BATCH_LIMIT);
    for (const data of slice) {
      batch.set(db.collection("transactions").doc(), data);
    }
    await batch.commit();
  }
}

/**
 * Process a finalized Storage object.
 * Idempotent: skips if upload is already success/failed/processing.
 */
export async function processStorageObject({ db, bucket, objectName, metadata = {} }) {
  const parsed =
    parseObjectPath(objectName) ||
    (metadata.uploadId && metadata.uid
      ? {
          uid: metadata.uid,
          uploadId: metadata.uploadId,
          originalFilename: metadata.originalFilename || objectName,
        }
      : null);

  if (!parsed) {
    console.warn(`Ignoring object with unexpected path: ${objectName}`);
    return { skipped: true, reason: "bad_path" };
  }

  const { uid, uploadId } = parsed;
  const uploadRef = db.collection("uploads").doc(uploadId);
  const uploadSnap = await uploadRef.get();

  if (!uploadSnap.exists) {
    console.warn(`Upload doc ${uploadId} not found`);
    return { skipped: true, reason: "missing_upload_doc" };
  }

  const upload = uploadSnap.data();
  if (upload.uid !== uid) {
    console.warn(`UID mismatch for upload ${uploadId}`);
    return { skipped: true, reason: "uid_mismatch" };
  }

  if (["success", "failed", "processing"].includes(upload.status)) {
    console.log(`Upload ${uploadId} already ${upload.status}; skipping`);
    return { skipped: true, reason: "already_handled", status: upload.status };
  }

  await uploadRef.update({
    status: "processing",
    processedAt: FieldValue.serverTimestamp(),
  });

  try {
    const [buffer] = await bucket.file(objectName).download();
    const contentHash = sha256Hex(buffer);
    const filename = upload.filename || parsed.originalFilename;

    const duplicate = await findServerDuplicate(db, {
      uid,
      uploadId,
      filename,
      contentHash,
    });
    if (duplicate) {
      const via = [
        duplicate.sameName ? "filename" : null,
        duplicate.sameHash ? "file contents" : null,
      ]
        .filter(Boolean)
        .join(" and ");
      await uploadRef.update({
        status: "failed",
        contentHash,
        byteSize: buffer.length,
        errors: [
          {
            row: 0,
            column: "file",
            error: `Duplicate upload blocked (${via}): already tracked as “${duplicate.filename}” [${duplicate.status}]`,
          },
        ],
        rowCount: 0,
        processedAt: FieldValue.serverTimestamp(),
      });
      return { ok: false, reason: "duplicate" };
    }

    await uploadRef.update({
      contentHash,
      byteSize: buffer.length,
    });

    const text = buffer.toString("utf8");
    let records;
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      await uploadRef.update({
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

    const result = validateCsvRecords(records);
    if (!result.ok) {
      await uploadRef.update({
        status: "failed",
        errors: result.errors.slice(0, 200),
        rowCount: records.length,
        processedAt: FieldValue.serverTimestamp(),
      });
      return { ok: false, errorCount: result.errors.length };
    }

    const now = FieldValue.serverTimestamp();
    const docs = result.rows.map((row) => ({
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

    await commitTransactionBatches(db, docs);
    await uploadRef.update({
      status: "success",
      errors: [],
      rowCount: docs.length,
      processedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, rowCount: docs.length };
  } catch (err) {
    console.error(`Processing failed for ${uploadId}:`, err);
    await uploadRef.update({
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
}

export function extractStorageEvent(body, headers = {}) {
  // Eventarc CloudEvents (binary or structured) + Pub/Sub wrap + manual test body
  if (body?.bucket && body?.name) {
    return {
      bucket: body.bucket,
      name: body.name,
      metadata: body.metadata || {},
    };
  }

  if (body?.data?.bucket && body?.data?.name) {
    return {
      bucket: body.data.bucket,
      name: body.data.name,
      metadata: body.data.metadata || {},
    };
  }

  // Pub/Sub push wrapping GCS notification
  if (body?.message?.data) {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString("utf8")
    );
    if (decoded.bucket && decoded.name) {
      return {
        bucket: decoded.bucket,
        name: decoded.name,
        metadata: decoded.metadata || {},
      };
    }
  }

  const ceBucket = headers["ce-bucket"] || headers["ce-subject"];
  if (body?.name && (body?.bucket || ceBucket)) {
    return {
      bucket: body.bucket || String(ceBucket).replace(/^.*buckets\//, ""),
      name: body.name,
      metadata: body.metadata || {},
    };
  }

  return null;
}
