// pages/api/ask.js

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ---------- Supabase setup ----------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------- OpenAI setup ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- Helper: build prompt from chunks ----------
function buildPromptFromChunks(question, chunks) {
  const contextText = chunks
    .map((c, i) => `Chunk ${i + 1}:\n${c.content}`)
    .join("\n\n---\n\n");

  return `
You are a patient, step-by-step math tutor helping a struggling student.

You are ONLY allowed to use the information in the "Course Materials" section below.
If the answer is not in the materials, say so, and then explain how they might learn it.

When explaining math:
- Go step-by-step.
- Use very clear language.
- Assume the student is anxious and easily confused.
- Check for understanding and suggest the next step they should try.

=== COURSE MATERIALS (FROM THEIR UPLOADED FILES) ===
${contextText}

=== STUDENT QUESTION ===
${question}

Now give a helpful answer. If this is a math question, walk through the reasoning and highlight key steps.
  `.trim();
}

export default async function handler(req, res) {
  console.log("[ASK] Route hit, method:", req.method);

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      stage: "method-check",
      message: "This route expects POST",
      receivedMethod: req.method,
    });
  }

  const { courseId, question, matchCount = 6 } = req.body || {};

  if (!courseId || !question) {
    return res.status(400).json({
      ok: false,
      stage: "input-validation",
      error: "Missing courseId or question in request body",
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
    // 1) Embed the question
    console.log("[ASK] Creating embedding for question…");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2) Call Supabase RPC to find similar chunks for this course
    console.log("[ASK] Calling match_course_chunks RPC…");

    const { data: matches, error: matchError } = await supabase.rpc(
      "match_course_chunks",
      {
        query_embedding: queryEmbedding,
        match_count: matchCount,
        match_course_id: courseId,
      }
    );

    if (matchError) {
      console.error("[ASK] match_course_chunks error:", matchError);
      return res.status(500).json({
        ok: false,
        stage: "vector-search",
        error: "Error during vector search",
        details: matchError.message,
      });
    }

    if (!matches || matches.length === 0) {
      return res.status(200).json({
        ok: true,
        stage: "no-matches",
        answer:
          "I couldn’t find any relevant course materials for this question yet. Try uploading notes or homework first.",
        sources: [],
      });
    }

    console.log("[ASK] Retrieved matches:", matches.length);

    // 3) Build prompt and call chat model
    const prompt = buildPromptFromChunks(question, matches);

    console.log("[ASK] Calling OpenAI chat completion…");
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // you can change to another model if you like
      messages: [
        {
          role: "system",
          content:
            "You are a calm, step-by-step AI tutor that helps the student deeply understand math.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const answer = completion.choices[0]?.message?.content ?? "";

    // 4) Return answer + a little source info
    return res.status(200).json({
      ok: true,
      stage: "done",
      answer,
      sources: matches.map((m) => ({
        chunkId: m.id,
        fileId: m.file_id,
        similarity: m.similarity,
        preview: m.content.slice(0, 200),
      })),
    });
  } catch (err) {
    console.error("[ASK] Unexpected error:", err);
    return res.status(500).json({
      ok: false,
      stage: "unexpected",
      error: "Unexpected server error",
      details: String(err),
    });
  }
}
