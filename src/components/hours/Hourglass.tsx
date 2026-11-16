"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Hourglass({
  ratio,
  pouring = false,
  size = 64,
  className,
}: {
  ratio: number;
  pouring?: boolean;
  size?: number;
  className?: string;
}) {
  const r = Math.max(0, Math.min(1, ratio));
  const nearlyEmpty = r <= 0.1;

  const topH = 34 * r;
  const bottomH = 30 * (1 - r);

  return (
    <motion.div
      className={cn("relative", className)}
      style={{ width: size, height: size * 1.25 }}
      animate={pouring ? { scale: [1, 1.08, 1] } : {}}
      transition={{ duration: 0.5, repeat: pouring ? Infinity : 0 }}
    >
      <svg viewBox="0 0 100 125" width={size} height={size * 1.25}>
        <defs>
          <linearGradient id="hgi-frame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B7C6" />
            <stop offset="100%" stopColor="#2F3B67" />
          </linearGradient>
          <linearGradient id="hgi-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFB06A" />
            <stop offset="100%" stopColor="#FF7A20" />
          </linearGradient>
        </defs>

        <rect x="12" y="4" width="76" height="14" rx="7" fill="url(#hgi-frame)" />
        <rect x="12" y="107" width="76" height="14" rx="7" fill="url(#hgi-frame)" />

        <path
          d="M26 18
             L74 18
             C74 40 58 50 54 60
             C54 63 54 62 54 65
             C58 75 74 85 74 107
             L26 107
             C26 85 42 75 46 65
             C46 62 46 63 46 60
             C42 50 26 40 26 18
             Z"
          fill="none"
          stroke="url(#hgi-frame)"
          strokeWidth="7"
          strokeLinejoin="round"
        />

        <motion.path
          fill="url(#hgi-sand)"
          initial={false}
          animate={{
            d: `M${50 - topH * 0.85} ${57 - topH}
                L${50 + topH * 0.85} ${57 - topH}
                L50 57 Z`,
            opacity: r > 0.03 ? 1 : 0,
          }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        <motion.path
          fill="url(#hgi-sand)"
          initial={false}
          animate={{
            d: `M${50 - (bottomH * 1.15 + 6)} 103
                Q50 ${103 - bottomH * 2} ${50 + (bottomH * 1.15 + 6)} 103 Z`,
            opacity: 1 - r > 0.03 ? 1 : 0,
          }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {!nearlyEmpty
          ? [0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx="50"
                r="3"
                fill="#f5a623"
                initial={{ cy: 64, opacity: 0 }}
                animate={{ cy: [64, 100], opacity: [0, 1, 0] }}
                transition={{
                  duration: pouring ? 0.45 : 0.85,
                  repeat: Infinity,
                  delay: i * (pouring ? 0.15 : 0.28),
                  ease: "easeIn",
                }}
              />
            ))
          : null}
      </svg>
    </motion.div>
  );
}
