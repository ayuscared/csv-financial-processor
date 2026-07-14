export function health(_req, res) {
  res.json({
    ok: true,
    service: "csv-financial-processor",
    version: "1.0.0",
  });
}
