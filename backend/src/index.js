import express from "express";
import { initFirebase } from "./firebase.js";
import { extractStorageEvent, processStorageObject } from "./process.js";

const app = express();
const port = process.env.PORT || 8080;

const { db, storage } = initFirebase();

app.use(express.json({ type: ["application/json", "application/cloudevents+json"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Eventarc Storage finalize target + manual local testing:
 * POST / { "bucket": "...", "name": "uploads/uid/uploadId_file.csv" }
 */
app.post("/", async (req, res) => {
  try {
    const event = extractStorageEvent(req.body, req.headers);
    if (!event) {
      console.warn("Unrecognized event payload", JSON.stringify(req.body).slice(0, 500));
      return res.status(400).json({ error: "Unrecognized storage event payload" });
    }

    console.log(`Processing gs://${event.bucket}/${event.name}`);
    const bucket = storage.bucket(event.bucket);
    const result = await processStorageObject({
      db,
      bucket,
      objectName: event.name,
      metadata: event.metadata,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Processing failed" });
  }
});

app.listen(port, () => {
  console.log(`CSV processor listening on ${port}`);
});
