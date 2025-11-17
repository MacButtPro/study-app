// pages/api/ingest-debug.js

export default async function handler(req, res) {
  console.log("INGEST-DEBUG HIT, METHOD:", req.method);

  // Just echo back what we got so we can see it clearly
  return res.status(200).json({
    ok: true,
    message: "Debug route is working",
    method: req.method,
    body: req.body ?? null,
  });
}
