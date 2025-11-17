// pages/api/ingest-file.js

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Very simple chunking: split long text into ~1200-character pieces
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

    // Try to break on a newline or period near the end of the window
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
  console.log("[INGEST] Route hit. Method:", req.method);

  if (req.method !== "POST") {
    // Always return JSON so the client can parse it
    return res.status(200).json({
      ok: false,
      stage: "method-check",
      message: "This route expects POST",
      receivedMethod: req.method,
    });
  }

  const { courseId, fileId } = req.body || {};

  if (!courseId || !fileId) {
    return res.status(400).json({
      ok: false,
      stage: "input-validation",
      error: "Missing courseId or fileId in request body",
      body: req.body || null,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      stage: "env-check",
      error: "OPENAI_API_KEY is not set on the server",
    });
  }

  try {
    // 1) Look up the file in course_files
    console.log("[INGEST] Looking up file row:", fileId);

    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      console.error("[INGEST] File lookup error:", fileError);
      return res.status(404).json({
        ok: false,
        stage: "file-lookup",
        error: "File not found in course_files table",
        details: fileError?.message ?? null,
      });
    }

    const { file_path } = fileRow;
    console.log("[INGEST] file_path from DB:", file_path);

    // 2) Download file contents using Supabase SDK (NOT the public URL)
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("course-files")
      .download(file_path);

    if (downloadError || !fileData) {
      console.error("[INGEST] downloadError:", downloadError);
      return res.status(500).json({
        ok: false,
        stage: "download",
        error: "Could not download file from storage via SDK",
        details: downloadError?.message ?? null,
      });
    }

    // fileData is a Blob; convert to text
    const text = await fileData.text();

    if (!text || !text.trim()) {
      return res.status(400).json({
        ok: false,
        stage: "text-check",
        error: "File appears to be empty or not readable as text",
      });
    }

    console.log("[INGEST] Downloaded text length:", text.length);

    // 3) Split into chunks
    const chunks = chunkText(text, 1200);

    if (chunks.length === 0) {
      return res.status(400).json({
        ok: false,
        stage: "chunking",
        error: "No chunks produced from file contents",
      });
    }

    console.log("[INGEST] Number of chunks:", chunks.length);

    // 4) Create embeddings for all chunks at once
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

    // 5) Insert into course_chunks
    const { error: insertError } = await supabase
      .from("course_chunks")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("[INGEST] Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        stage: "insert",
        error: "Failed to insert chunks into course_chunks",
        details: insertError.message,
      });
    }

    console.log("[INGEST] Success. Inserted rows:", rowsToInsert.length);

    return res.status(200).json({
      ok: true,
      stage: "done",
      message: "Ingestion complete",
      chunksInserted: rowsToInsert.length,
    });
  } catch (err) {
    console.error("[INGEST] Unexpected error in /api/ingest-file:", err);
    return res.status(500).json({
      ok: false,
      stage: "unexpected",
      error: "Unexpected server error",
      details: String(err),
    });
  }
}
