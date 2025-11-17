export const metadata = {
  title: "Study App",
  description: "AI-powered study assistant for math and more."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
