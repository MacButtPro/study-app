import { createClient } from "@supabase/supabase-js";

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

export async function getServerSideProps(context) {
  const { id } = context.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createClient(url, anonKey);

  const { data, error } = await supabase
    .from("courses")
    .select("id, title, description, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("Course fetch error:", error?.message);
    return {
      notFound: true
    };
  }

  return {
    props: {
      course: {
        id: data.id,
        title: data.title,
        description: data.description,
        createdAt: data.created_at
      }
    }
  };
}

export default function CourseDetailPage({ course }) {
  const createdDate = course.createdAt
    ? new Date(course.createdAt).toLocaleString()
    : null;

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

        <section style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>Course description</h2>
          <p style={{ fontSize: "0.95rem", opacity: 0.9 }}>
            {course.description || "No description provided yet."}
          </p>
        </section>

        <section style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>What&apos;s coming next</h2>
          <ul
            style={{
              marginLeft: "1.1rem",
              fontSize: "0.95rem",
              opacity: 0.9
            }}
          >
            <li>Upload notes, homework, and lecture transcripts</li>
            <li>
              Let the AI build a personalized learning plan just for this course
            </li>
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
