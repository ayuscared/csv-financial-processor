import { Router } from "express";
import { createHealthRouter } from "./health.routes.js";
import { createProcessRouter } from "./process.routes.js";

/**
 * Mount API surface. Keeps Eventarc compatibility on POST /
 * while exposing versioned paths under /api/v1.
 */
export function createApiRouter({ processController }) {
  const router = Router();
  const healthRouter = createHealthRouter();
  const processRouter = createProcessRouter({ processController });

  router.use(healthRouter);
  router.use(processRouter);

  const v1 = Router();
  v1.use(healthRouter);
  v1.use(processRouter);
  router.use("/api/v1", v1);

  return router;
}
