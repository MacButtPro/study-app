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
  marginBottom: "2rem",
  gap: "1rem"
};

const titleStyle = {
  fontSize: "2rem",
  fontWeight: 700
};

const subtitleStyle = {
  opacity: 0.8,
  marginTop: "0.25rem",
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

const addButtonStyle = {
  fontSize: "0.9rem",
  textDecoration: "none",
  color: "#ecfeff",
  background:
    "linear-gradient(135deg, rgba(56,189,248,0.9), rgba(37,99,235,0.9))",
  padding: "0.5rem 1rem",
  borderRadius: "999px",
  border: "none",
  display: "inline-block",
  whiteSpace: "nowrap"
};

const courseListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  marginTop: "1.5rem"
};

const courseCardStyle = {
  padding: "1rem 1.25rem",
  borderRadius: "0.75rem",
  background:
    "linear-gradient(135deg, rgba(79,70,229,0.2), rgba(15,23,42,0.95))",
  border: "1px solid rgba(148,163,184,0.4)"
};

const courseTitleStyle = {
  fontWeight: 600,
  marginBottom: "0.25rem"
};

const badgeStyle = {
  display: "inline-block",
  fontSize: "0.75rem",
  padding: "0.2rem 0.5rem",
  borderRadius: "999px",
  background: "rgba(15,118,110,0.2)",
  color: "#5eead4",
  marginLeft: "0.5rem"
};

export async function getServerSideProps() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const hasUrl = Boolean(url);
  const hasKey = Boolean(anonKey);

  let courses = [];
  let errorMessage = null;

  if (!hasUrl || !hasKey) {
    errorMessage = "Missing Supabase URL or anon key env vars.";
  } else {
    const supabase = createClient(url, anonKey);

    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error.message);
      errorMessage = error.message;
    } else {
      courses = data || [];
    }
  }

  return {
    props: {
      courses,
      error: errorMessage,
      debug: {
        hasUrl,
        hasKey,
        count: courses.length
      }
    }
  };
}

export default function CoursesPage({ courses, error, debug }) {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div style={{ flex: 1 }}>
            <h1 style={titleStyle}>My Courses</h1>
            <p style={subtitleStyle}>
              This is where you&apos;ll see all the subjects you&apos;re
              studying with your AI tutor.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <a href="/courses/new" style={addButtonStyle}>
              + Add Course
            </a>
            <a href="/" style={backLinkStyle}>
              ← Back to Home
            </a>
          </div>
        </header>

        <section>
          <p style={{ fontSize: "0.95rem", opacity: 0.85 }}>
            This page is now connected to your Supabase database. As you add
            more courses, they&apos;ll appear here automatically.
          </p>
        </section>

        {error && (
          <p style={{ color: "#f97373", marginTop: "1rem" }}>
            Error: {error}
          </p>
        )}

        {/* Debug info – we can remove this later */}
        <section
          style={{
            marginTop: "1rem",
            fontSize: "0.8rem",
            opacity: 0.7
          }}
        >
          <div>Debug:</div>
          <div>hasUrl: {String(debug?.hasUrl)}</div>
          <div>hasKey: {String(debug?.hasKey)}</div>
          <div>courses count: {debug?.count}</div>
        </section>

        <section style={courseListStyle}>
          {courses.length === 0 && !error && (
            <p style={{ fontSize: "0.95rem", opacity: 0.8 }}>
              You don&apos;t have any courses yet. Use &quot;Add Course&quot; to
              create one.
            </p>
          )}

          {courses.map((course) => (
            <div key={course.id} style={courseCardStyle}>
              <div style={courseTitleStyle}>
                {course.title}
                <span style={badgeStyle}>From Supabase</span>
              </div>
              <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
                {course.description || "No description yet."}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
