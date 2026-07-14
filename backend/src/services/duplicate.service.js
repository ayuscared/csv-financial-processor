const ACTIVE_STATUSES = new Set(["pending", "processing", "success"]);

/**
 * Duplicate detection delegated from the upload processor.
 */
export async function findDuplicateUpload(
  uploadRepository,
  { uid, uploadId, filename, contentHash }
) {
  const uploads = await uploadRepository.listByUid(uid);
  const name = (filename || "").trim().toLowerCase();
  const hash = (contentHash || "").toLowerCase();

  for (const upload of uploads) {
    if (upload.id === uploadId) continue;
    if (!ACTIVE_STATUSES.has(upload.status)) continue;

    const sameName =
      name && (upload.filename || "").trim().toLowerCase() === name;
    const sameHash =
      hash && (upload.contentHash || "").toLowerCase() === hash;

    if (sameName || sameHash) {
      return { ...upload, sameName, sameHash };
    }
  }

  return null;
}

export function formatDuplicateFailure(duplicate) {
  const via = [
    duplicate.sameName ? "filename" : null,
    duplicate.sameHash ? "file contents" : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return `Duplicate upload blocked (${via}): already tracked as “${duplicate.filename}” [${duplicate.status}]`;
}
