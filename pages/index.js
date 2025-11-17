export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "2rem",
        background: "#050816",
        color: "#f9fafb",
        textAlign: "center"
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
        Study App – Early Prototype
      </h1>

      <p style={{ maxWidth: "600px", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        This will become your personal AI tutor: it will read your notes,
        homework, and lecture transcripts, then teach you step-by-step with
        unlimited questions.
      </p>

      <p style={{ opacity: 0.8, maxWidth: "600px", marginBottom: "2rem" }}>
        Right now this is just the starting screen. Next, we&apos;ll add
        courses, uploads, and the interactive tutor.
      </p>

      <a
        href="/courses"
        style={{
          display: "inline-block",
          padding: "0.75rem 1.5rem",
          borderRadius: "999px",
          border: "1px solid #38bdf8",
          textDecoration: "none",
          color: "#e5f6ff",
          fontWeight: 600,
          letterSpacing: 0.3,
          fontSize: "0.95rem"
        }}
      >
        View My Courses →
      </a>
    </main>
  );
}
