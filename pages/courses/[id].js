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
  maxWidth: "900px",
  margin: "0 auto",
  padding: "2.5rem 1.5rem 3rem"
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1.5rem",
  gap: "1rem"
};

const titleBlockStyle = {
  flex: 1
};

const titleStyle = {
  fontSize: "2rem",
  fontWeight: 700
};

const subtitleStyle = {
  opacity: 0.8,
  marginTop: "0.35rem",
  fontSize: "0.95rem"
};

const backLinkStyle = {
  fontSize: "0.9rem",
  textDecoration: "none",
  color: "#a5b4fc",
  border: "1px solid #4f46e5",
  padding: "0.5rem 0.9rem",
  borderRadius: "999px"
};

const sectionCardStyle = {
  marginTop: "1.75rem",
  padding: "1.25rem 1.5rem",
  borderRadius: "0.9rem",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,64,175,0.35))",
  border: "1px solid rgba(148,163,184,0.4)"
};

const sectionTitleStyle = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "0.5rem"
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
  fontSize: "0.9rem",
  outline: "none"
};

const fileInputStyle = {
  marginTop: "0.35rem",
  fontSize: "0.9rem"
};

const buttonStyle = {
  marginTop: "0.9rem",
  padding: "0.6rem 1.3rem",
  borderRadius: "999px",
  border: "none",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  background:
    "linear-gradient(135deg, rgba(56,189,248,0.9), rgba(37,99,235,0.9))",
  color: "#ecfeff"
};

const errorStyle = {
  marginTop: "0.5rem",
  fontSize: "0.85rem",
  color: "#f97373"
};

const smallTextStyle = {
  marginTop: "0.4rem",
  fontSize: "0.8rem",
  opacity: 0.75
};

const fileListStyle = {
  marginTop: "0.75rem",
  fontSize: "0.9rem"
};

const fileItemStyle = {
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid rgba(30,64,175,0.5)"
};

export async function getServerSideProps(context) {
  const { id } = context.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseSSR = createClient(url, anonKey);

  // Fetch course
  const { data: courseData, error: courseError } = await supabaseSSR
    .from("courses")
    .select("id, title, description, created_at")
    .eq("id", id)
    .single();

  if (courseError || !courseData) {
    console.error("Course fetch error:", courseError?.message);
    return {
      notFound: true
    };
  }

  // Fetch files for this course
  const { data: filesData, error: filesError } = await supabaseSSR
    .from("course_files")
    .select("id, file_name, file_path, created_at")
    .eq("course_id", id)
    .order("created_at", { ascending: false });

  if (filesError) {
    console.error("Files fetch error:", filesError.message);
  }

  return {
    props: {
      course: {
        id: courseData.id,
        title: courseData.title,
        description: courseData.description,
        createdAt: courseData.created_at
      },
      initialFiles: filesData || []
    }
  };
}

export default function CourseDetailPage({ course, initialFiles }) {
  const router = useRouter();

  const [files, setFiles] = useState(initialFiles);
  const [fileTitle, setFileTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const createdDate = course.createdAt
    ? new Date(course.createdAt).toLocaleString()
    : null;

  async function handleUpload(e) {
    e.preventDefault();
    setError("");

    if (!selectedFile) {
      setError("Please choose a file to upload.");
      return;
    }

    const cleanTitle = fileTitle.trim() || selectedFile.name;

    try {
      setUploading(true);

      // 1) Upload to storage bucket
      const path = `${course.id}/${Date.now()}-${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("course-files")
        .upload(path, selectedFile);

      if (uploadError) {
        console.error("Upload error:", uploadError.message);
        setError("Could not upload file. Please try again.");
        setUploading(false);
        return;
      }

      // 2) Insert metadata row into course_files table
      const { data: inserted, error: insertError } = await supabase
        .from("course_files")
        .insert([
          {
            course_id: course.id,
            file_name: cleanTitle,
            file_path: path
          }
        ])
        .select("id, file_name, file_path, created_at")
        .single();

      if (insertError) {
        console.error("Insert error:", insertError.message);
        setError(
          "File uploaded, but could not save metadata. Please refresh."
        );
        setUploading(false);
        return;
      }

      // 3) Update local state so the new file shows up immediately
      setFiles((prev) => [inserted, ...prev]);
      setFileTitle("");
      setSelectedFile(null);

      // Clear the file input element
      if (e.target && e.target.reset) {
        e.target.reset();
      } else {
        // If form reset not available, we'll just rely on state
      }

      setUploading(false);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Something went wrong. Please try again.");
      setUploading(false);
    }
  }

  function getPublicUrl(filePath) {
    const { data } = supabase.storage
      .from("course-files")
      .getPublicUrl(filePath);
    return data.publicUrl;
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div style={titleBlockStyle}>
            <h1 style={titleStyle}>{course.title}</h1>
            <p style={subtitleStyle}>
              This is your dedicated space for this course. Soon, you&apos;ll be
              able to upload notes, homework, and lecture transcripts here and
              let the AI tutor guide you step-by-step.
            </p>
            {createdDate && (
              <p
                style={{
                  marginTop: "0.4rem",
                  fontSize: "0.8rem",
                  opacity: 0.7
                }}
              >
                Created at: {createdDate}
              </p>
            )}
          </div>

          <a href="/courses" style={backLinkStyle}>
            ← Back to Courses
          </a>
        </header>

        {/* Description */}
        <section style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>Course description</h2>
          <p style={{ fontSize: "0.95rem", opacity: 0.9 }}>
            {course.description || "No description provided yet."}
          </p>
        </section>

        {/* Uploads section */}
        <section style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>Uploads for this course</h2>

          <p style={{ fontSize: "0.9rem", opacity: 0.9 }}>
            Upload notes, homework PDFs, screenshots, or lecture transcripts
            related to this course. Later, the AI tutor will use these uploads
            to teach you step-by-step.
          </p>

          <form onSubmit={handleUpload} style={{ marginTop: "1rem" }}>
            <label style={labelStyle} htmlFor="fileTitle">
              File title (optional)
            </label>
            <input
              id="fileTitle"
              type="text"
              style={inputStyle}
              placeholder='e.g. "Section 3.1 notes"'
              value={fileTitle}
              onChange={(e) => setFileTitle(e.target.value)}
            />

            <div style={{ marginTop: "0.75rem" }}>
              <label style={labelStyle} htmlFor="fileInput">
                Choose file
              </label>
              <input
                id="fileInput"
                type="file"
                style={fileInputStyle}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                }}
              />
            </div>

            {error && <div style={errorStyle}>{error}</div>}

            <button type="submit" style={buttonStyle} disabled={uploading}>
              {uploading ? "Uploading..." : "Upload file"}
            </button>

            <div style={smallTextStyle}>
              For now, files are public in your prototype bucket. We can lock
              this down later when we add authentication.
            </div>
          </form>

          {/* File list */}
          <div style={fileListStyle}>
            {files.length === 0 ? (
              <p style={{ fontSize: "0.9rem", opacity: 0.8, marginTop: "0.75rem" }}>
                No files uploaded yet for this course.
              </p>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "0.9rem",
                    opacity: 0.9,
                    marginTop: "0.85rem",
                    marginBottom: "0.4rem"
                  }}
                >
                  Files:
                </p>
                <div>
                  {files.map((file) => {
                    const createdAt = file.created_at
                      ? new Date(file.created_at).toLocaleString()
                      : "";
                    const url = getPublicUrl(file.file_path);

                    return (
                      <div key={file.id} style={fileItemStyle}>
                        <div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: "#93c5fd",
                              textDecoration: "underline"
                            }}
                          >
                            {file.file_name}
                          </a>
                        </div>
                        {createdAt && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              opacity: 0.7,
                              marginTop: "0.15rem"
                            }}
                          >
                            Uploaded: {createdAt}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Future features section */}
        <section style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>What&apos;s coming next</h2>
          <ul
            style={{
              marginLeft: "1.1rem",
              fontSize: "0.95rem",
              opacity: 0.9
            }}
          >
            <li>Let the AI build a personalized learning plan for this course</li>
            <li>
              Chat with an AI tutor that only uses materials from this course
            </li>
            <li>Track your progress and identify weak spots</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
