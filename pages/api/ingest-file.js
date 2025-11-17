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
  console.log("INGEST ROUTE HIT, METHOD:", req.method);

  if (req.method !== "POST") {
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
    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      console.error("File lookup error:", fileError);
      return res.status(404).json({
        ok: false,
        stage: "file-lookup",
        error: "File not found in course_files table",
        details: fileError?.message ?? null,
      });
    }

    const { file_path } = fileRow;
    console.log("Ingesting file_path:", file_path);

    let text;

    // 2A) Try: download directly via Supabase SDK
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-files")
      .download(file_path);

    if (!downloadError && fileData) {
      console.log("Download via Supabase SDK succeeded");
      text = await fileData.text();
    } else {
      console.error(
        "Download via SDK failed, falling back to public URL. Error:",
        downloadError
      );

      // 2B) Fallback: use a public URL + fetch
      const { data: publicUrlData, error: urlError } = supabase.storage
        .from("course-files")
        .getPublicUrl(file_path);

      if (urlError || !publicUrlData?.publicUrl) {
        console.error("getPublicUrl error:", urlError);
        return res.status(500).json({
          ok: false,
          stage: "download",
          error: "Could not download file from storage",
          details: {
            downloadError: downloadError?.message ?? null,
            urlError: urlError?.message ?? null,
          },
        });
      }

      const fileUrl = publicUrlData.publicUrl;
      console.log("Fallback public URL:", fileUrl);

      const resp = await fetch(fileUrl);
      if (!resp.ok) {
        console.error("Fetch of public URL failed with status:", resp.status);
        return res.status(500).json({
          ok: false,
          stage: "download",
          error: "Could not download file from storage",
          details: {
            httpStatus: resp.status,
          },
        });
      }

      text = await resp.text();
    }

    if (!text || !text.trim()) {
      return res.status(400).json({
        ok: false,
        stage: "text-check",
        error: "File appears to be empty or not readable as text",
      });
    }

    // 3) Split into chunks
    const chunks = chunkText(text, 1200);

    if (chunks.length === 0) {
      return res.status(400).json({
        ok: false,
        stage: "chunking",
        error: "No chunks produced from file contents",
      });
    }

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
      console.error("Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        stage: "insert",
        error: "Failed to insert chunks into course_chunks",
        details: insertError.message,
      });
    }

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
