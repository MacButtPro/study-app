import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// --- Supabase setup ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- OpenAI setup ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Very simple chunking ---
function chunkText(text, maxChars = 1200) {
  const chunks = [];
  let start = 0;

  const cleaned = text.replace(/\r\n/g, "\n");

  while (start < cleaned.length) {
    let end = start + maxChars;

    if (end >= cleaned.length) {
      chunks.push(cleaned.slice(start).trim());
      break;
    }

    let breakIndex = cleaned.lastIndexOf("\n", end);
    if (breakIndex < start + maxChars * 0.5) {
      breakIndex = cleaned.lastIndexOf(". ", end);
    }
    if (breakIndex < start + maxChars * 0.5) {
      breakIndex = end;
    }

    chunks.push(cleaned.slice(start, breakIndex).trim());
    start = breakIndex;
  }

  return chunks.filter((c) => c.length > 0);
}

export default async function handler(req, res) {
  console.log("[ingest-file] hit:", {
    method: req.method,
    body: req.body,
  });

  // GET health check
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      method: "GET",
      message: "API route is working.",
    });
  }

  // Must be POST for ingestion
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { courseId, fileId } = req.body || {};

  if (!courseId || !fileId) {
    return res
      .status(400)
      .json({ error: "Missing courseId or fileId in request body" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY is not set on the server" });
  }

  try {
    // 1) Lookup file
    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      console.error("[file lookup error]:", fileError);
      return res.status(404).json({ error: "File not found" });
    }

    const { file_path } = fileRow;

    // 2) Public URL
    const { data: publicUrlData } = supabase.storage
      .from("course-files")
      .getPublicUrl(file_path);

    const fileUrl = publicUrlData?.publicUrl;

    if (!fileUrl) {
      return res.status(500).json({ error: "Failed to get file public URL" });
    }

    // 3) Download raw text
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return res.status(500).json({ error: "Failed to download file" });
    }

    const text = await fileRes.text();

    if (!text.trim()) {
      return res.status(400).json({ error: "File is empty" });
    }

    // 4) Chunk
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.status(400).json({ error: "No chunks produced" });
    }

    // 5) Create embeddings
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
    });

    const rowsToInsert = chunks.map((content, index) => ({
      course_id: courseId,
      file_id: fileId,
      chunk_index: index,
      content,
      embedding: embeddingResponse.data[index].embedding,
    }));

    // 6) Insert into Supabase
    const { error: insertErr } = await supabase
      .from("course_chunks")
      .insert(rowsToInsert);

    if (insertErr) {
      console.error("[insert error]:", insertErr);
      return res.status(500).json({ error: "Failed inserting chunks" });
    }

    return res.status(200).json({
      success: true,
      chunksInserted: rowsToInsert.length,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({
      error: "Unexpected server error",
      details: String(err),
    });
  }
}
