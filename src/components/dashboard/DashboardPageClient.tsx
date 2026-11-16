"use client";

import Link from "next/link";
import {
  School,
  GraduationCap,
  Baby,
  User,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { AppHeader } from "@/components/layout/AppHeader";
import { SimpleActionCard } from "@/components/layout/SimpleActionCard";
import { TutorialsButton } from "@/components/layout/TutorialsButton";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { sectorHomeHref } from "@/lib/personal-sector";

export function DashboardPageClient() {
  return (
    <div className="flex min-h-full flex-col bg-brand-gradient">
      <AppHeader
        className="shrink-0 py-2"
        maxWidthClassName="max-w-5xl"
        actions={
          <div className="flex flex-col items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <Settings className="h-4 w-4" />
                <EditableText path="admin.title" />
              </Link>
            </Button>
            <Button asChild size="sm" className="animate-blink">
              <Link href="/personal-area">
                <User className="h-4 w-4" />
                <EditableText path="dashboard.personalArea" />
              </Link>
            </Button>
          </div>
        }
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-4 py-3 pb-12 animate-fade-in">
        <section className="flex w-full max-w-2xl flex-col items-center gap-2 rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-[0_24px_48px_-32px_rgba(47,59,103,0.35)]">
          <Logo size="md" />
          <EditableText
            path="dashboard.title"
            as="h1"
            block
            center
            className="text-2xl text-ink sm:text-3xl"
          />
          <EditableText
            path="dashboard.subtitle"
            as="p"
            block
            center
            className="text-sm text-muted-foreground sm:text-base"
          />
        </section>

        {/* אותה לוגיקת שלבים כמו באזור האישי: מגזר → מסגרת → טבלה.
            textPath נשאר dashboard.* — שם נשמרו שינויי הכיתוב בפרודקשן. */}
        <div className="grid w-full gap-4 sm:grid-cols-3">
          <SimpleActionCard
            href={sectorHomeHref("kindergartens", "dashboard")}
            textPath="dashboard.kindergartens"
            icon={Baby}
          />
          <SimpleActionCard
            href={sectorHomeHref("schools", "dashboard")}
            textPath="dashboard.schools"
            icon={School}
          />
          <SimpleActionCard
            href={sectorHomeHref("high-schools", "dashboard")}
            textPath="dashboard.highSchools"
            icon={GraduationCap}
          />
        </div>

        <TutorialsButton />
      </main>
    </div>
  );
}
