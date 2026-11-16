"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo-mode";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** לוגו GIF/WebP מונפש — למסך ברוכים הבאים */
  animated?: boolean;
}

const sizes = {
  sm: {
    wrap: "h-10",
    img: "h-10 w-auto max-w-[11rem]",
    width: 176,
    height: 40,
    badge: "text-[10px] px-2 py-0.5",
    icon: "h-9 w-9",
    text: "text-lg",
  },
  md: {
    wrap: "h-auto max-h-14",
    img: "h-11 w-auto max-w-[12rem] sm:h-14 sm:max-w-[15rem]",
    width: 240,
    height: 56,
    badge: "text-[10px] px-2 py-0.5",
    icon: "h-11 w-11",
    text: "text-xl",
  },
  lg: {
    wrap: "h-auto w-full max-w-[min(96vw,40rem)]",
    img: "h-auto w-full max-w-full object-contain object-center",
    width: 1440,
    height: 424,
    badge: "text-xs px-2 py-1",
    icon: "h-20 w-20",
    text: "text-4xl",
  },
};

/** מידות ללוגו המונפש */
const animatedSizes = {
  sm: sizes.sm,
  md: sizes.md,
  lg: {
    wrap: "h-auto w-full max-w-[min(96vw,40rem)]",
    img: "h-auto w-full max-w-[min(96vw,40rem)]",
    width: 1440,
    height: 424,
    badge: "text-xs px-2 py-1",
    icon: "h-20 w-20",
    text: "text-4xl",
  },
};

export function Logo({ className, size = "md", animated = false }: LogoProps) {
  const s = animated ? animatedSizes[size] : sizes[size];

  if (isDemoMode()) {
    return (
      <div
        className={cn(
          "flex items-center gap-3",
          animated && "animate-logo-enter",
          className
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "logo-mark flex items-center justify-center rounded-2xl bg-amber shadow-[0_10px_20px_-8px_rgba(255,122,32,0.55)]",
              s.icon,
              animated && "animate-logo-breathe"
            )}
          >
            <Layers className="h-3/5 w-3/5 text-white" strokeWidth={2.25} />
          </div>
          <span
            className={cn(
              "absolute -bottom-1 -left-1 rounded-full border border-border bg-white font-black tracking-wide text-amber shadow-sm",
              s.badge
            )}
          >
            DEMO
          </span>
        </div>
        <span className={cn("font-black text-ink", s.text)}>דמו</span>
      </div>
    );
  }

  if (animated) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-transparent",
          s.wrap,
          "animate-logo-enter",
          className
        )}
      >
        <div
          className="logo-sprite-viewport"
          role="img"
          aria-label="פרוטוקל"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <picture>
            <source
              srcSet="/brand/protocol-logo-sprite.webp?v=17"
              type="image/webp"
            />
            <img
              src="/brand/protocol-logo-sprite.png?v=17"
              alt=""
              width={720}
              height={15900}
              className="logo-sprite-strip"
              draggable={false}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-visible",
        s.wrap,
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/protocol-logo.png?v=14`}
        alt="פרוטוקל"
        width={s.width}
        height={s.height}
        className={cn(
          "logo-mark block max-h-full w-auto max-w-full object-contain object-center",
          size === "lg" ? "h-auto w-full" : s.img
        )}
        draggable={false}
      />
    </div>
  );
}
