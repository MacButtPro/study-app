import { useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, anonKey);

const pageStyle = {
  minHeight: "100vh",
  margin: 0,
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  background: "#020617",
  color: "#e5e7eb"
};

const containerStyle = {
  maxWidth: "700px",
  margin: "0 auto",
  padding: "2.5rem 1.5rem 3rem"
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "2rem"
};

const titleStyle = {
  fontSize: "2rem",
  fontWeight: 700
};

const backLinkStyle = {
  fontSize: "0.9rem",
  textDecoration: "none",
  color: "#a5b4fc",
  border: "1px solid #4f46e5",
  padding: "0.5rem 0.9rem",
  borderRadius: "999px"
};

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  marginBottom: "0.35rem"
};

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(148,163,184,0.6)",
  background: "rgba(15,23,42,0.8)",
  color: "#e5e7eb",
  fontSize: "0.95rem",
  outline: "none"
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "120px",
  resize: "vertical"
};

const buttonStyle = {
  marginTop: "1.25rem",
  padding: "0.7rem 1.5rem",
  borderRadius: "999px",
  border: "none",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
  background:
    "linear-gradient(135deg, rgba(56,189,248,0.9), rgba(37,99,235,0.9))",
  color: "#ecfeff"
};

const errorStyle = {
  marginTop: "0.75rem",
  fontSize: "0.9rem",
  color: "#f97373"
};

export default function NewCoursePage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a course title.");
      return;
    }

    try {
      setLoading(true);

      const { error: insertError } = await supabase
        .from("courses")
        .insert([
          {
            title: title.trim(),
            description: description.trim() || null
          }
        ]);

      if (insertError) {
        console.error("Supabase insert error:", insertError.message);
        setError("Could not save the course. Please try again.");
        setLoading(false);
        return;
      }

      // Go back to the courses list
      router.push("/courses");
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>Create a New Course</h1>
          <a href="/courses" style={backLinkStyle}>
            ← Back to Courses
          </a>
        </header>

        <p style={{ fontSize: "0.95rem", opacity: 0.85, marginBottom: "1.5rem" }}>
          Give your course a name and an optional description. Later, you&apos;ll
          be able to upload notes, homework, and lecture transcripts to this course
          and let the AI tutor guide you through it.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle} htmlFor="title">
              Course title
            </label>
            <input
              id="title"
              type="text"
              style={inputStyle}
              placeholder='e.g. "Pre-Calculus – IVC" or "Biology Unit 3"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "0.5rem" }}>
            <label style={labelStyle} htmlFor="description">
              Description (optional)
            </label>
            <textarea
              id="description"
              style={textareaStyle}
              placeholder="Short note about what this course covers."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Saving..." : "Save Course"}
          </button>
        </form>
      </div>
    </div>
  );
}
