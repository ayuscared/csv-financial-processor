import express from "express";
import { initFirebase } from "./lib/firebase.js";
import { createUploadRepository } from "./repositories/upload.repository.js";
import { createTransactionRepository } from "./repositories/transaction.repository.js";
import { createUploadProcessor } from "./services/uploadProcessor.service.js";
import { createProcessController } from "./controllers/process.controller.js";
import { createApiRouter } from "./routes/index.js";

/**
 * Composition root: wire dependencies, then hand off to the router layer.
 *
 * Request flow:
 *   Route → Controller → Service → Repository / Validator
 */
export function createApp() {
  const { db, storage } = initFirebase();

  const uploadRepository = createUploadRepository(db);
  const transactionRepository = createTransactionRepository(db);
  const uploadProcessor = createUploadProcessor({
    uploadRepository,
    transactionRepository,
    storage,
  });
  const processController = createProcessController({ uploadProcessor });

  const app = express();
  app.use(
    express.json({
      type: ["application/json", "application/cloudevents+json"],
    })
  );
  app.use(createApiRouter({ processController }));

  return app;
}
