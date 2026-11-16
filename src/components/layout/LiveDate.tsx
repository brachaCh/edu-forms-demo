"use client";

import { useEffect, useState } from "react";
import {
  formatHebrewDate,
  formatHebrewDayName,
  formatTime,
} from "@/lib/hebrew-date";

export function LiveDate() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <div className="rounded-full border border-border bg-white/70 px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
      <span>בס״ד</span>
      <span className="mx-2">|</span>
      <span>
        {formatHebrewDayName(now)}, {formatHebrewDate(now)}
      </span>
      <span className="mx-2">|</span>
      <span className="tabular-nums">{formatTime(now)}</span>
    </div>
  );
}
