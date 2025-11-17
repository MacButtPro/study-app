// pages/api/ingest-file.js

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// -------------------- Supabase setup --------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// -------------------- OpenAI setup --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -------------------- Simple text chunker --------------------
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

// -------------------- API handler --------------------
export default async function handler(req, res) {
  console.log("INGEST ROUTE HIT, METHOD:", req.method);

  // Always return JSON so the front-end can safely call res.json()
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      stage: "method-check",
      message: "This route expects POST",
      receivedMethod: req.method,
    });
  }

  const { courseId, fileId } = req.body || {};
  console.log("Incoming body:", req.body);

  if (!courseId || !fileId) {
    return res.status(400).json({
      ok: false,
      stage: "input-validation",
      error: "Missing courseId or fileId in request body",
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
    // 1) Look up the file row
    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    console.log("File lookup result:", { fileRow, fileError });

    if (fileError || !fileRow) {
      return res.status(404).json({
        ok: false,
        stage: "file-lookup",
        error: "File not found in course_files table",
        details: fileError?.message ?? null,
      });
    }

    // IMPORTANT: trim the path in case a newline or spaces snuck in
    const rawPath = fileRow.file_path;
    const cleanPath = (rawPath || "").trim();

    console.log("Raw file_path from DB:", JSON.stringify(rawPath));
    console.log("Cleaned file_path used for storage:", JSON.stringify(cleanPath));

    // 2) Get public URL for this object
    const { data: publicUrlData, error: publicUrlError } = supabase.storage
      .from("course-files")
      .getPublicUrl(cleanPath);

    if (publicUrlError) {
      console.error("getPublicUrl error:", publicUrlError);
      return res.status(500).json({
        ok: false,
        stage: "public-url",
        error: "Error calling getPublicUrl",
        details: publicUrlError.message,
      });
    }

    const fileUrl = publicUrlData?.publicUrl;
    console.log("Generated public URL:", fileUrl);

    if (!fileUrl) {
      return res.status(500).json({
        ok: false,
        stage: "public-url",
        error: "Could not generate public URL for file",
      });
    }

    // 3) Download file contents
    const response = await fetch(fileUrl);
    console.log("Download HTTP status:", response.status);

    if (!response.ok) {
      return res.status(500).json({
        ok: false,
        stage: "download",
        error: "Could not download file from storage",
        httpStatus: response.status,
        fileUrl,
      });
    }

    const text = await response.text();
    console.log("Downloaded text length:", text?.length ?? 0);

    if (!text || !text.trim()) {
      return res.status(400).json({
        ok: false,
        stage: "text-check",
        error: "File appears to be empty or not readable as text",
      });
    }

    // 4) Chunk the text
    const chunks = chunkText(text, 1200);
    console.log("Number of chunks:", chunks.length);

    if (chunks.length === 0) {
      return res.status(400).json({
        ok: false,
        stage: "chunking",
        error: "No chunks produced from file contents",
      });
    }

    // 5) Create embeddings
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
    });

    // 6) Prepare rows for insertion
    const rowsToInsert = chunks.map((content, index) => ({
      course_id: courseId,
      file_id: fileId,
      chunk_index: index,
      content,
      embedding: embeddingResponse.data[index].embedding,
    }));

    // 7) Insert into course_chunks
    const { error: insertError } = await supabase
      .from("course_chunks")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        stage: "insert",
        error: "Failed to insert chunks into course_chunks",
        details: insertError.message,
      });
    }

    // ✅ All good
    return res.status(200).json({
      ok: true,
      stage: "done",
      message: "Ingestion complete",
      chunksInserted: rowsToInsert.length,
    });
  } catch (err) {
    console.error("Unexpected error in /api/ingest-file:", err);
    return res.status(500).json({
      ok: false,
      stage: "unexpected",
      error: "Unexpected server error",
      details: String(err),
    });
  }
}
