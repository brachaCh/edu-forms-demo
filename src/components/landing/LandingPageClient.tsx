"use client";

import { UserCircle, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Logo } from "@/components/layout/Logo";
import { SimpleActionCard } from "@/components/layout/SimpleActionCard";
import { TutorialsButton } from "@/components/layout/TutorialsButton";

const FEATURE_ICONS = [
  {
    src: "/brand/feature-icons/feature-01.webp",
    label: "ניסוח אוטומטי",
  },
  {
    src: "/brand/feature-icons/feature-02.webp",
    label: "הקלטה קולית",
  },
  {
    src: "/brand/feature-icons/feature-03.webp",
    label: "אבטחת מידע",
  },
  {
    src: "/brand/feature-icons/feature-04.webp",
    label: "תיק תלמיד",
  },
  {
    src: "/brand/feature-icons/feature-05.webp",
    label: "מסמכים ודוחות",
  },
  {
    src: "/brand/feature-icons/feature-06.webp",
    label: "תיעוד קל ומהיר",
  },
  {
    src: "/brand/feature-icons/feature-07.webp",
    label: "תוכניות עבודה",
  },
  {
    src: "/brand/feature-icons/feature-08.webp",
    label: "שיתוף הורים",
  },
] as const;

export function LandingPageClient() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-brand-gradient">
      <AppHeader className="shrink-0 !py-0.5" hideLogo />

      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-3 pt-1 pb-2 sm:pt-1.5 sm:pb-3">
        <div className="logo-sprite-viewport--landing flex w-full max-w-[min(96vw,40rem)] shrink-0 items-start justify-center overflow-hidden px-2">
          <Logo size="lg" animated className="w-full justify-center" />
        </div>

        <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center">
          <div className="grid w-full max-w-md gap-1.5 sm:grid-cols-2 sm:gap-2">
            <SimpleActionCard
              href="/login"
              textPath="landing.loginButton"
              icon={UserCircle}
              compact
              className="!min-h-[64px] sm:!min-h-[72px]"
            />
            <SimpleActionCard
              href="/guest-demo"
              textPath="landing.guestButton"
              icon={Users}
              variant="outline"
              compact
              className="!min-h-[64px] sm:!min-h-[72px]"
            />
          </div>
        </div>

        <div className="relative z-10 mt-auto flex w-full flex-col items-center gap-3 pb-0.5 sm:gap-4">
          <TutorialsButton compact className="shrink-0 !py-1.5" />

          <div
            dir="ltr"
            className="flex w-full max-w-[min(96vw,36rem)] shrink-0 flex-nowrap items-end justify-center gap-1.5 px-2 sm:gap-2.5 md:gap-3"
            role="list"
            aria-label="יכולות המערכת"
          >
            {FEATURE_ICONS.map((item) => (
              <div
                key={item.src}
                role="listitem"
                className="flex shrink-0 items-end justify-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${item.src}?v=23`}
                  alt={item.label}
                  title={item.label}
                  width={113}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="h-16 w-auto object-contain object-bottom drop-shadow-sm sm:h-[4.5rem] md:h-20"
                />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
