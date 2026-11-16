"use client";

import { useState } from "react";
import {
  Briefcase,
  Code2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addHours,
  deductHours,
  formatHours,
  resetHours,
  updateHoursTotals,
  verifyHoursPassword,
  type HoursPool,
  type ProjectHours,
} from "@/lib/project-hours-store";

type Mode = "deduct" | "add" | "settings";

const MODE_LABELS: Record<Mode, { label: string; hint: string }> = {
  deduct: { label: "ניכוי שעות", hint: "רישום שעות שבוצעו" },
  add: { label: "החזרת שעות", hint: "תיקון / החזרת שעות שנוכו בטעות" },
  settings: { label: "הגדרות", hint: "עדכון מכסות המאגרים ואיפוס" },
};

const POOL_META: Record<
  HoursPool,
  { label: string; shortLabel: string; icon: React.ReactNode; tone: "pink" | "cyan" | "amber" }
> = {
  management: {
    label: "שעות ניהול",
    shortLabel: "ניהול",
    icon: <Briefcase className="h-4 w-4" />,
    tone: "pink",
  },
  programming: {
    label: "שעות תכנות",
    shortLabel: "תכנות",
    icon: <Code2 className="h-4 w-4" />,
    tone: "cyan",
  },
  extra: {
    label: "שעות נוספות",
    shortLabel: "נוספות",
    icon: <Sparkles className="h-4 w-4" />,
    tone: "amber",
  },
};

function getPoolUsed(hours: ProjectHours, pool: HoursPool): number {
  if (pool === "management") return hours.management_used;
  if (pool === "programming") return hours.programming_used;
  return hours.extra_used;
}

function getPoolTotal(hours: ProjectHours, pool: HoursPool): number {
  if (pool === "management") return hours.management_total;
  if (pool === "programming") return hours.programming_total;
  return hours.extra_total;
}

export function HourglassDialog({
  open,
  onOpenChange,
  hours,
  onPour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hours: ProjectHours;
  onPour: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("deduct");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pool, setPool] = useState<HoursPool>("management");
  const [amount, setAmount] = useState("");
  const [mgmtTotal, setMgmtTotal] = useState(String(hours.management_total));
  const [progTotal, setProgTotal] = useState(String(hours.programming_total));
  const [extraTotal, setExtraTotal] = useState(String(hours.extra_total));

  function resetState() {
    setUnlocked(false);
    setPassword("");
    setMode("deduct");
    setAmount("");
    setPool("management");
    setMgmtTotal(String(hours.management_total));
    setProgTotal(String(hours.programming_total));
    setExtraTotal(String(hours.extra_total));
    setMessage(null);
    setError(null);
  }

  function handleClose(next: boolean) {
    if (!next) resetState();
    onOpenChange(next);
  }

  async function handleUnlock() {
    setError(null);
    setUnlocking(true);
    try {
      await verifyHoursPassword(password);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setUnlocking(false);
    }
  }

  async function runAmountAction(kind: "deduct" | "add") {
    setError(null);
    setMessage(null);
    const value = Number(amount);
    try {
      if (kind === "deduct") {
        await deductHours({ password, pool, amount: value });
        onPour();
      } else {
        await addHours({ password, pool, amount: value });
      }
      setAmount("");
      setMessage(kind === "deduct" ? "השעות נוכו" : "השעות הוחזרו");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  async function handleSaveTotals() {
    setError(null);
    setMessage(null);
    try {
      await updateHoursTotals({
        password,
        management_total: Number(mgmtTotal),
        programming_total: Number(progTotal),
        extra_total: Number(extraTotal),
      });
      setMessage("הגדרות השעות עודכנו");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "לאפס את כל מאגרי השעות (ניהול, תכנות ושעות נוספות) ולמחוק את ההיסטוריה?"
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await resetHours({ password });
      setMgmtTotal("0");
      setProgTotal("0");
      setExtraTotal("0");
      setMessage("מאגר השעות אופס");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto p-4 print:hidden sm:w-full sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>שעות פרויקט</DialogTitle>
        </DialogHeader>

        {!unlocked ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-brand-50 px-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-lg">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-ink">אזור מוגן</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  ניהול השעות זמין לבעלי הרשאה בלבד. הזינו סיסמה כדי להמשיך.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hours-password">סיסמת ניהול</Label>
              <Input
                id="hours-password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password && !unlocking) {
                    void handleUnlock();
                  }
                }}
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={unlocking}
              >
                ביטול
              </Button>
              <Button
                onClick={() => void handleUnlock()}
                disabled={!password || unlocking}
              >
                {unlocking ? "מאמת…" : "כניסה"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {(["management", "programming", "extra"] as HoursPool[]).map((p) => (
                <PoolCard
                  key={p}
                  icon={POOL_META[p].icon}
                  label={POOL_META[p].shortLabel}
                  used={getPoolUsed(hours, p)}
                  total={getPoolTotal(hours, p)}
                  tone={POOL_META[p].tone}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-brand-50 p-1.5">
              {(["deduct", "add", "settings"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-bold transition-all",
                    mode === m
                      ? "bg-white text-brand-600 shadow-md ring-1 ring-brand-200"
                      : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {m === "deduct" ? (
                    <Minus className="h-4 w-4" />
                  ) : m === "add" ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <Settings2 className="h-4 w-4" />
                  )}
                  {MODE_LABELS[m].label}
                </button>
              ))}
            </div>

            <p className="-mt-2 text-center text-xs text-pink/70">
              {MODE_LABELS[mode].hint}
            </p>

            {mode === "settings" ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mgmt-total">מכסת ניהול</Label>
                  <Input
                    id="mgmt-total"
                    type="number"
                    min="0"
                    step="0.25"
                    dir="ltr"
                    value={mgmtTotal}
                    onChange={(e) => setMgmtTotal(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prog-total">מכסת תכנות</Label>
                  <Input
                    id="prog-total"
                    type="number"
                    min="0"
                    step="0.25"
                    dir="ltr"
                    value={progTotal}
                    onChange={(e) => setProgTotal(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="extra-total">מכסת שעות נוספות</Label>
                  <Input
                    id="extra-total"
                    type="number"
                    min="0"
                    step="0.25"
                    dir="ltr"
                    value={extraTotal}
                    onChange={(e) => setExtraTotal(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button variant="destructive" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                    איפוס הכל
                  </Button>
                  <Button onClick={handleSaveTotals}>שמירת שינויים</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-bold text-pink">בחרו מאגר</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(["management", "programming", "extra"] as HoursPool[]).map((p) => {
                      const used = getPoolUsed(hours, p);
                      const total = getPoolTotal(hours, p);
                      const remaining = total - used;
                      return (
                        <PoolChoice
                          key={p}
                          active={pool === p}
                          onClick={() => setPool(p)}
                          icon={POOL_META[p].icon}
                          label={POOL_META[p].label}
                          used={used}
                          total={total}
                          remaining={remaining}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="hours-amount">
                    {mode === "deduct" ? "כמה שעות לנכות?" : "כמה שעות להחזיר?"}
                  </Label>
                  <Input
                    id="hours-amount"
                    type="number"
                    min="0"
                    step="0.25"
                    dir="ltr"
                    placeholder=""
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  variant={mode === "deduct" ? "default" : "outline"}
                  onClick={() => runAmountAction(mode === "deduct" ? "deduct" : "add")}
                  disabled={!amount || Number(amount) <= 0}
                >
                  {mode === "deduct" ? (
                    <Minus className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  {mode === "deduct" ? "נכה שעות" : "החזר שעות"}
                </Button>
              </div>
            )}

            {message && (
              <p className="text-center text-sm font-medium text-pink">{message}</p>
            )}
            {error && (
              <p className="text-center text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PoolCard({
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
  const bar = over
    ? "bg-destructive"
    : tone === "pink"
      ? "bg-brand-500"
      : tone === "cyan"
        ? "bg-amber"
        : "bg-pink";

  return (
    <div
      className={cn(
        "rounded-2xl border p-2 sm:p-3",
        over ? "border-destructive/40 bg-destructive/5" : "border-border bg-brand-50"
      )}
    >
      <div className="flex items-center gap-1 text-xs font-bold text-ink sm:gap-1.5 sm:text-sm">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-xl font-black leading-none sm:text-2xl",
          over ? "text-destructive" : "text-ink"
        )}
      >
        {formatHours(used)}
        <span
          className={cn(
            "text-xs font-bold sm:text-sm",
            over ? "text-destructive/50" : "text-ink/40"
          )}
        >
          {" "}
          / {formatHours(total)}
        </span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {over && (
        <p className="mt-1 text-[10px] font-bold text-destructive">
          חריגה של {formatHours(used - total)}
        </p>
      )}
    </div>
  );
}

function PoolChoice({
  active,
  onClick,
  icon,
  label,
  used,
  total,
  remaining,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  used: number;
  total: number;
  remaining: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-start transition-all",
        active
          ? "border-brand-500 bg-brand-50 text-ink shadow-sm"
          : "border-border text-muted-foreground hover:border-brand-300"
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-bold">
        {icon}
        {label}
      </span>
      <span className="text-xs opacity-70">
        {formatHours(used)}/{formatHours(total)} נוצלו ·{" "}
        {remaining < 0 ? (
          <span className="font-bold text-destructive opacity-100">
            חריגה של {formatHours(-remaining)}
          </span>
        ) : (
          `${formatHours(remaining)} זמינות`
        )}
      </span>
    </button>
  );
}
