import { extractStorageEvent } from "../services/eventParser.service.js";

/**
 * HTTP adapter: parse request → delegate to uploadProcessor service → respond.
 */
export function createProcessController({ uploadProcessor }) {
  return {
    async processFinalize(req, res) {
      try {
        const event = extractStorageEvent(req.body, req.headers);
        if (!event) {
          console.warn(
            "Unrecognized event payload",
            JSON.stringify(req.body).slice(0, 500)
          );
          return res
            .status(400)
            .json({ error: "Unrecognized storage event payload" });
        }

        console.log(`Processing gs://${event.bucket}/${event.name}`);
        const result = await uploadProcessor.processStorageObject({
          bucketName: event.bucket,
          objectName: event.name,
          metadata: event.metadata,
        });

        return res.status(200).json(result);
      } catch (err) {
        console.error(err);
        return res
          .status(500)
          .json({ error: err.message || "Processing failed" });
      }
    },
  };
}
