/**
 * Normalize Eventarc / Pub/Sub / manual payloads into { bucket, name, metadata }.
 */
export function extractStorageEvent(body, headers = {}) {
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

/** Expected path: uploads/{uid}/{uploadId}_{filename}.csv */
export function parseObjectPath(objectName) {
  const parts = objectName.split("/");
  if (parts.length < 3 || parts[0] !== "uploads") {
    return null;
  }
  const uid = parts[1];
  const fileName = parts.slice(2).join("/");
  const underscore = fileName.indexOf("_");
  if (underscore <= 0) return null;
  return {
    uid,
    uploadId: fileName.slice(0, underscore),
    originalFilename: fileName.slice(underscore + 1),
  };
}

export function resolveUploadIdentity(objectName, metadata = {}) {
  return (
    parseObjectPath(objectName) ||
    (metadata.uploadId && metadata.uid
      ? {
          uid: metadata.uid,
          uploadId: metadata.uploadId,
          originalFilename: metadata.originalFilename || objectName,
        }
      : null)
  );
}
