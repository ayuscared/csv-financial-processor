import { Router } from "express";

/**
 * Process routes — Eventarc target and explicit API path both delegate
 * to the same controller method.
 */
export function createProcessRouter({ processController }) {
  const router = Router();
  router.post("/", (req, res) => processController.processFinalize(req, res));
  router.post("/process", (req, res) =>
    processController.processFinalize(req, res)
  );
  return router;
}
