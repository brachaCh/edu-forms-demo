"use client";

import { Header } from "./Header";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: React.ReactNode;
  /**
   * נועל גלילת עמוד — התוכן מתאים לגובה המסך והגלילה רק בתוך הילד
   * (למשל כרטיס תלמיד עם סרגל גלילה ליד הכרטיס בלבד).
   */
  lockPageScroll?: boolean;
}

export function PageShell({ children, lockPageScroll = false }: PageShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col bg-brand-gradient",
        lockPageScroll ? "h-full overflow-hidden" : "min-h-full"
      )}
    >
      <Header />
      <main
        className={cn(
          "mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-3 animate-fade-in",
          lockPageScroll ? "min-h-0 overflow-hidden pb-3" : "pb-12"
        )}
      >
        {children}
      </main>
    </div>
  );
}
