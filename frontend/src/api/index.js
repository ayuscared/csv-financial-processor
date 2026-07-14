/**
 * Frontend “API” façade — pages import from here instead of raw Firebase.
 * Mirrors backend layering: thin surface that delegates to services.
 */
export {
  submitCsvUpload,
  watchUserUploads,
  watchUploadDoc,
} from "../services/upload.service.js";

export {
  clearUploadHistory,
  clearAllHistory,
} from "../services/history.service.js";

export {
  computeDashboardSummary,
  computeDashboardSummaryFromUploads,
  watchUploadsNewestFirst,
} from "../services/dashboard.service.js";

export {
  findDuplicateUpload,
  formatDuplicateError,
  countTrackedUploads,
} from "../services/duplicate.service.js";
