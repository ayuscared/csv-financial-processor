/**
 * Duplicate checks — pure helpers used by the upload service.
 */
const ACTIVE_STATUSES = new Set(["pending", "processing", "success"]);

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

export function countTrackedUploads(uploads) {
  return uploads.filter((u) => ACTIVE_STATUSES.has(u.status)).length;
}
