"use client";

/**
 * שגיאה גלובלית גנרית — בלי stack / פרטים טכניים (צ'קליסט #19)
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, Helvetica, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 8 }}>אירעה שגיאה</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>
            לא ניתן להשלים את הפעולה כרגע. נסו שוב בעוד רגע.
          </p>
          <button type="button" onClick={() => reset()}>
            נסו שוב
          </button>
        </div>
      </body>
    </html>
  );
}
