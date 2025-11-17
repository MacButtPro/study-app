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
  // ✅ Keep GET for quick “is it alive?” checks
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      method: "GET",
      message: "API route is working.",
    });
  }

  // ✅ Only allow POST for ingestion
  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
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
    // 1) Look up the file in course_files
    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      console.error("File lookup error:", fileError);
      return res
        .status(404)
        .json({ error: "File not found in course_files table" });
    }

    const { file_path } = fileRow;

    // 2) Get a public URL for the file in the course-files bucket
    const { data: publicUrlData } = supabase.storage
      .from("course-files")
      .getPublicUrl(file_path);

    const fileUrl = publicUrlData?.publicUrl;

    if (!fileUrl) {
      return res
        .status(500)
        .json({ error: "Could not generate public URL for file" });
    }

    // 3) Download the file contents (assume plain text for now)
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error("Download error status:", response.status);
      return res
        .status(500)
        .json({ error: "Could not download file from storage" });
    }

    const text = await response.text();

    if (!text || !text.trim()) {
      return res
        .status(400)
        .json({ error: "File appears to be empty or not readable as text" });
    }

    // 4) Split into chunks
    const chunks = chunkText(text, 1200);

    if (chunks.length === 0) {
      return res
        .status(400)
        .json({ error: "No chunks produced from file contents" });
    }

    // 5) Create embeddings for all chunks at once
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

    // 6) Insert into course_chunks
    const { error: insertError } = await supabase
      .from("course_chunks")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({
        error: "Failed to insert chunks into course_chunks",
        details: insertError.message,
      });
    }

    return res
      .status(200)
      .json({ success: true, chunksInserted: rowsToInsert.length });
  } catch (err) {
    console.error("Unexpected error in /api/ingest-file:", err);
    return res
      .status(500)
      .json({ error: "Unexpected server error", details: String(err) });
  }
}
