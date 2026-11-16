"use client";

/**
 * דף שגיאה גנרי — בלי פרטים טכניים (צ'קליסט #19 / #02)
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h2 className="text-xl font-bold text-ink">אירעה שגיאה</h2>
      <p className="max-w-md text-sm text-pink">
        לא ניתן להשלים את הפעולה כרגע. נסו שוב בעוד רגע.
      </p>
      <button
        type="button"
        className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-white"
        onClick={() => reset()}
      >
        נסו שוב
      </button>
    </div>
  );
}
