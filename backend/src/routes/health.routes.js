import { Router } from "express";
import { health } from "../controllers/health.controller.js";

export function createHealthRouter() {
  const router = Router();
  router.get("/", health);
  router.get("/health", health);
  return router;
}
