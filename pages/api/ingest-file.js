export default function handler(req, res) {
  console.log("🔥 ingest-file test route executed");

  return res.status(200).json({
    ok: true,
    method: req.method,
    message: "API route is working."
  });
}
