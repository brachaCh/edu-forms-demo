"use client";

import { useState } from "react";
import { CircleAlert, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invokeProblemReport } from "@/lib/invokeProblemReport";
import { PROBLEM_REPORT_DESCRIPTION_MAX } from "@/lib/problem-report/constants";
import { cn } from "@/lib/utils";

type ProblemReportButtonProps = {
  /** Logged-in account email. Shown read-only; the server is the source of truth. */
  sessionEmail?: string;
};

function currentPagePath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function currentBrowser(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

export function ProblemReportButton({
  sessionEmail = "",
}: ProblemReportButtonProps) {
  const accountEmail = sessionEmail.trim();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [browser, setBrowser] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function resetForm() {
    setDescription("");
    setWebsite("");
    setTicketId(null);
    setErrorDetail(null);
  }

  function handleOpenChange(next: boolean) {
    if (sending) return;
    setOpen(next);
    if (next) {
      setPagePath(currentPagePath());
      setBrowser(currentBrowser());
      setErrorDetail(null);
      setTicketId(null);
    } else {
      resetForm();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    const trimmedDescription = description.trim();
    if (!accountEmail) {
      setErrorDetail("אין מייל בחשבון המחובר");
      return;
    }
    if (!trimmedDescription) {
      setErrorDetail("נא לתאר את התקלה");
      return;
    }

    setSending(true);
    setErrorDetail(null);
    setTicketId(null);

    const result = await invokeProblemReport({
      description: trimmedDescription,
      pagePath,
      browser,
      website,
    });

    setSending(false);

    if (!result.ok) {
      setErrorDetail(result.error ?? "שליחת הדיווח נכשלה");
      return;
    }

    setTicketId(result.ticketId ?? null);
    setDescription("");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="print:hidden"
        onClick={() => handleOpenChange(true)}
        aria-label="דיווח על תקלה"
      >
        <CircleAlert className="h-4 w-4" aria-hidden />
        דיווח על תקלה
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto p-4 sm:w-full sm:p-6">
          <DialogHeader>
            <DialogTitle>דיווח על תקלה</DialogTitle>
            <DialogDescription>
              תיאור קצר של מה שקרה. הדיווח נפתח כפנייה בצוותא, ונשלח אישור למייל
              עם מספר הפנייה.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-4"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            >
              <label htmlFor="problem-website">Website</label>
              <input
                id="problem-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <p
              role="note"
              className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-ink"
            >
              אין לכתוב שמות תלמידים, מספרי זהות או פרטים מזהים אחרים של
              תלמידים. לא נשלח תוכן של העמוד או של טפסים — רק הנתיב והדפדפן.
            </p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="problem-email">כתובת מייל בחשבון</Label>
              <Input
                id="problem-email"
                type="email"
                dir="ltr"
                className="bg-muted/40 text-right"
                value={accountEmail}
                readOnly
                aria-readonly="true"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                עדכונים יישלחו למייל של החשבון המחובר. לא ניתן לשנות כאן.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="problem-description">תיאור התקלה</Label>
              <textarea
                id="problem-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={PROBLEM_REPORT_DESCRIPTION_MAX}
                rows={6}
                required
                className="w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm text-ink shadow-inner shadow-brand-100/40 placeholder:text-muted-foreground/70 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              />
              <p className="text-xs text-muted-foreground">
                נכתבו <bdi>{description.length}</bdi> מתוך{" "}
                <bdi>{PROBLEM_REPORT_DESCRIPTION_MAX}</bdi>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-brand-50/50 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-semibold text-ink">יצורף אוטומטית</p>
              <p className="mt-1">
                נתיב:{" "}
                <span dir="ltr" className="inline-block">
                  {pagePath || "—"}
                </span>
              </p>
              <p className="mt-0.5 break-all">
                דפדפן:{" "}
                <span dir="ltr" className="inline-block">
                  {browser || "—"}
                </span>
              </p>
            </div>

            {ticketId && (
              <p
                role="status"
                className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
              >
                הדיווח בטיפול. מספר הפנייה:{" "}
                <span className="font-black">{ticketId}</span>
              </p>
            )}
            {errorDetail && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
              >
                {errorDetail}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={sending}
                onClick={() => handleOpenChange(false)}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={sending || !description.trim() || !accountEmail}
                className={cn("gap-2 font-black")}
              >
                <Send className="h-4 w-4" />
                {sending ? "שליחה..." : "שליחת דיווח"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
