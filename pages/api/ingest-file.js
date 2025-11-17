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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const { data: fileRow, error: fileError } = await supabase
      .from("course_files")
      .select("id, file_path")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      return res
        .status(404)
        .json({ error: "File not found in course_files table" });
    }

    const { file_path } = fileRow;

    const { data: publicUrlData } = supabase.storage
      .from("course-files")
      .getPublicUrl(file_path);

    const fileUrl = publicUrlData?.publicUrl;

    if (!fileUrl) {
      return res.status(500).json({ error: "Could not get public file URL" });
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      return res
        .status(500)
        .json({ error: "Could not download file from storage" });
    }

    const text = await response.text();
    if (!text.trim()) {
      return res.status(400).json({ error: "File is empty or unreadable" });
    }

    const chunks = chunkText(text, 1200);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "No chunks produced" });
    }

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

    const { error: insertError } = await supabase
      .from("course_chunks")
      .insert(rowsToInsert);

    if (insertError) {
      return res.status(500).json({
        error: "Failed to insert chunks",
        details: insertError.message,
      });
    }

    return res
      .status(200)
      .json({ success: true, chunksInserted: rowsToInsert.length });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Unexpected server error", details: String(err) });
  }
}
