"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Briefcase, Code2, Sparkles } from "lucide-react";
import { Hourglass } from "@/components/hours/Hourglass";
import { HourglassDialog } from "@/components/hours/HourglassDialog";
import { formatHours, loadProjectHours } from "@/lib/project-hours-store";
import { getDataCache, subscribeDataCache } from "@/lib/data-cache";
import { cn } from "@/lib/utils";

export function HourglassWidget() {
  // מקור אמת יחיד — כל פעולה בחלון מעדכנת את המטמון והווידג'ט נגזר ממנו
  const cache = useSyncExternalStore(
    subscribeDataCache,
    getDataCache,
    getDataCache
  );
  const hours = cache.projectHours;
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [pouring, setPouring] = useState(false);

  useEffect(() => {
    if (cache.projectHours) return;
    void loadProjectHours().catch((error) => {
      // בלי נתונים אמיתיים לא מציגים אפסים — הם נראים כמו מאגר שהתאפס
      console.error("[HourglassWidget] load failed:", error);
      setLoadFailed(true);
    });
  }, [cache.projectHours]);

  if (!hours) {
    if (!loadFailed) return null;
    return (
      <div
        className="fixed left-1.5 top-1/2 z-40 -translate-y-1/2 print:hidden sm:left-4"
        data-matoah-chrome
      >
        <div
          role="alert"
          className="flex w-20 flex-col items-center gap-1 rounded-2xl border border-destructive/30 bg-white/90 p-2 text-center shadow-[0_20px_44px_-24px_rgba(47,59,103,0.45)] backdrop-blur-sm sm:w-[8.5rem] sm:p-3"
        >
          <Hourglass ratio={0} size={34} />
          <span className="text-[10px] font-bold leading-tight text-destructive">
            שעות הפרויקט לא נטענו
          </span>
        </div>
      </div>
    );
  }

  const mgmtUsed = hours.management_used;
  const progUsed = hours.programming_used;
  const extraUsed = hours.extra_used;
  const mgmtTotal = hours.management_total;
  const progTotal = hours.programming_total;
  const extraTotal = hours.extra_total;
  const allTotal = mgmtTotal + progTotal + extraTotal;
  const allUsed = mgmtUsed + progUsed + extraUsed;
  const remaining = allTotal - allUsed;
  // חריגה מותרת — כשעוברים את המכסה הכוללת מציגים אותה במקום "נשארו"
  const overage = remaining < 0 ? -remaining : 0;
  const ratio = allTotal > 0 ? Math.max(0, remaining) / allTotal : 0;

  function triggerPour() {
    setPouring(true);
    window.setTimeout(() => setPouring(false), 1800);
  }

  return (
    <>
      <motion.div
        className="fixed left-1.5 top-1/2 z-40 -translate-y-1/2 print:hidden sm:left-4"
        data-matoah-chrome
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, type: "spring", damping: 20 }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="שעות פרויקט"
          className={cn(
            "group flex flex-col items-center gap-1.5 rounded-2xl border bg-white/90 p-2 shadow-[0_20px_44px_-24px_rgba(47,59,103,0.45)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_26px_52px_-24px_rgba(47,59,103,0.5)] sm:gap-2 sm:rounded-3xl sm:p-3",
            overage > 0
              ? "border-destructive ring-2 ring-destructive/25"
              : "border-border"
          )}
        >
          <span className="sm:hidden">
            <Hourglass ratio={ratio} pouring={pouring} size={34} />
          </span>
          <span className="hidden sm:block">
            <Hourglass ratio={ratio} pouring={pouring} size={58} />
          </span>

          <div className="flex w-full flex-col items-center gap-1.5">
            <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:block">
              סך הכל שעות
            </span>
            <div className="flex w-full flex-col gap-1 sm:grid sm:grid-cols-2 sm:gap-1.5">
              <TotalCell label="נוצלו" value={allUsed} tone={overage > 0 ? "danger" : "ink"} />
              {overage > 0 ? (
                <TotalCell label="חריגה" value={overage} tone="danger" />
              ) : (
                <TotalCell label="נשארו" value={remaining} tone="brand" />
              )}
            </div>
            {overage > 0 ? (
              <span className="flex w-full items-center justify-center gap-1 rounded-lg bg-destructive px-1 py-1 text-center text-[9px] font-black leading-tight text-white sm:gap-1.5 sm:px-2 sm:text-[11px]">
                <AlertTriangle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                חריגה של {formatHours(overage)} שעות
              </span>
            ) : null}
            <span className="hidden text-[10px] font-semibold text-ink/50 sm:block">
              מתוך {formatHours(allTotal)} שעות
            </span>
          </div>

          <div className="hidden w-full flex-col gap-1.5 sm:flex">
            <UsagePill
              icon={<Briefcase className="h-3.5 w-3.5" />}
              label="ניהול"
              used={mgmtUsed}
              total={mgmtTotal}
              tone="pink"
            />
            <UsagePill
              icon={<Code2 className="h-3.5 w-3.5" />}
              label="תכנות"
              used={progUsed}
              total={progTotal}
              tone="cyan"
            />
            <UsagePill
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="נוספות"
              used={extraUsed}
              total={extraTotal}
              tone="amber"
            />
          </div>
        </button>
      </motion.div>

      <HourglassDialog
        open={open}
        onOpenChange={setOpen}
        hours={hours}
        onPour={triggerPour}
      />
    </>
  );
}

function TotalCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ink" | "brand" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex w-16 items-center justify-between gap-1 rounded-lg border px-1.5 py-1 sm:w-auto sm:flex-col sm:justify-center sm:gap-0 sm:rounded-xl sm:px-2 sm:py-1.5",
        tone === "danger"
          ? "border-destructive/40 bg-destructive/10"
          : "border-border bg-brand-50"
      )}
    >
      <span
        className={cn(
          "text-[9px] font-semibold sm:order-2 sm:mt-1 sm:text-[10px]",
          tone === "danger" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-black leading-none sm:order-1 sm:text-lg",
          tone === "danger"
            ? "text-destructive"
            : tone === "brand"
              ? "text-brand-600"
              : "text-ink"
        )}
      >
        {formatHours(value)}
      </span>
    </div>
  );
}

function UsagePill({
  icon,
  label,
  used,
  total,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  total: number;
  tone: "pink" | "cyan" | "amber";
}) {
  const over = used > total;
  const pct =
    total > 0 ? Math.min(100, (used / total) * 100) : used > 0 ? 100 : 0;
  const barColor = over
    ? "bg-destructive"
    : tone === "pink"
      ? "bg-brand-500"
      : tone === "cyan"
        ? "bg-amber"
        : "bg-pink";

  return (
    <div
      className={cn(
        "w-[8.5rem] rounded-xl border px-2 py-1.5",
        over ? "border-destructive/40 bg-destructive/5" : "border-border bg-brand-50"
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[11px] font-bold text-ink">
          {icon}
          {label}
        </span>
        <span
          className={cn(
            "text-[11px] font-black",
            over ? "text-destructive" : "text-ink"
          )}
        >
          {formatHours(used)}
          <span className={over ? "text-destructive/50" : "text-ink/40"}>
            /{formatHours(total)}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
