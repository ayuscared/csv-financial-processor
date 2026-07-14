const ACTIVE_STATUSES = new Set(["pending", "processing", "success"]);

/**
 * Find a prior upload that should block a re-upload.
 * Blocks matching filename or content hash when the prior upload is
 * pending, processing, or success (failed uploads may be retried).
 */
export function findDuplicateUpload(uploads, { filename, contentHash }) {
  const name = (filename || "").trim().toLowerCase();
  const hash = (contentHash || "").toLowerCase();

  for (const upload of uploads) {
    if (!ACTIVE_STATUSES.has(upload.status)) continue;

    const sameName =
      name && (upload.filename || "").trim().toLowerCase() === name;
    const sameHash =
      hash && (upload.contentHash || "").toLowerCase() === hash;

    if (sameName || sameHash) {
      const reasons = [];
      if (sameName) reasons.push("filename");
      if (sameHash) reasons.push("file contents");
      return { upload, reasons };
    }
  }

  return null;
}

export function formatDuplicateError(duplicate) {
  const { upload, reasons } = duplicate;
  const via = reasons.join(" and ");
  const when = upload.createdAt?.toDate
    ? upload.createdAt.toDate().toLocaleString()
    : "earlier";
  return `This file was already uploaded (${via}): “${upload.filename}” on ${when} [${upload.status}].`;
}
