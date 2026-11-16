"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, MessageCircleHeart, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearUser, getUser, isStaleDemoProfile } from "@/lib/mock-store";
import {
  BUG_REPORT_FALLBACK_REPLY_TO,
  BUG_REPORT_RECIPIENTS,
} from "@/lib/email-recipients";
import { invokeBugReport } from "@/lib/invokeBugReport";
import {
  BUG_MESSAGE_MAX_LENGTH,
  BUG_SCREENSHOT_ACCEPT,
  BUG_SCREENSHOT_MAX_BYTES,
  BUG_SCREENSHOT_MAX_COUNT,
  BUG_URGENCY_OPTIONS,
  isBugScreenshotContentType,
  type BugScreenshotContentType,
  type BugScreenshotPayload,
  type BugUrgency,
} from "@/lib/bugs/bugReport";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/supabase/types";

type BugReportFabProps = {
  hidden?: boolean;
  /** בתוך עמודת כפתורים בפינה — בלי position:fixed */
  embedded?: boolean;
};

type ScreenshotDraft = {
  id: string;
  file: File;
  previewUrl: string;
  contentType: BugScreenshotContentType;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function BugReportFab({ hidden, embedded = false }: BugReportFabProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [urgency, setUrgency] = useState<BugUrgency>("medium");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [screenshots, setScreenshots] = useState<ScreenshotDraft[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let sessionUser: UserProfile | null = null;
      try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
          const data = (await response.json()) as {
            profile: UserProfile | null;
          };
          sessionUser = data.profile;
        }
      } catch {
        // offline — fall back to local cache
      }
      if (cancelled) return;
      const resolved = sessionUser ?? getUser();
      if (isStaleDemoProfile(resolved)) {
        clearUser();
        setUser(null);
        return;
      }
      setUser(resolved);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;

  const replyToEmail = user?.email?.trim() || BUG_REPORT_FALLBACK_REPLY_TO;

  function clearScreenshots(list: ScreenshotDraft[]) {
    for (const shot of list) {
      URL.revokeObjectURL(shot.previewUrl);
    }
  }

  function resetForm() {
    setUrgency("medium");
    setMessage("");
    setWebsite("");
    setFeedback(null);
    setErrorDetail(null);
    setScreenshots((prev) => {
      clearScreenshots(prev);
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (sending) return;
    setOpen(next);
    if (!next) resetForm();
  }

  function handleScreenshotPick(files: FileList | null) {
    if (!files?.length) return;
    setFeedback(null);
    setErrorDetail(null);

    const remaining = BUG_SCREENSHOT_MAX_COUNT - screenshots.length;
    if (remaining <= 0) {
      setFeedback("error");
      setErrorDetail(`אפשר לצרף עד ${BUG_SCREENSHOT_MAX_COUNT} צילומי מסך`);
      return;
    }

    const next: ScreenshotDraft[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files).slice(0, remaining)) {
      if (!isBugScreenshotContentType(file.type)) {
        errors.push(`"${file.name}" אינו קובץ תמונה נתמך`);
        continue;
      }
      if (file.size > BUG_SCREENSHOT_MAX_BYTES) {
        errors.push(
          `"${file.name}" גדול מדי (עד ${formatFileSize(BUG_SCREENSHOT_MAX_BYTES)})`
        );
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        contentType: file.type,
      });
    }

    if (next.length) {
      setScreenshots((prev) => [...prev, ...next]);
    }
    if (errors.length) {
      setFeedback("error");
      setErrorDetail(errors[0] ?? "לא ניתן לצרף את הקבצים");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeScreenshot(id: string) {
    setScreenshots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    const trimmed = message.trim();

    if (!trimmed) {
      setFeedback("error");
      setErrorDetail("נא לתאר את הבעיה");
      return;
    }

    setSending(true);
    setFeedback(null);
    setErrorDetail(null);

    let screenshotPayload: BugScreenshotPayload[] = [];
    try {
      screenshotPayload = await Promise.all(
        screenshots.map(async (shot) => ({
          filename: shot.file.name || `screenshot.${shot.contentType.split("/")[1] ?? "png"}`,
          contentType: shot.contentType,
          content: await readFileAsBase64(shot.file),
        }))
      );
    } catch {
      setSending(false);
      setFeedback("error");
      setErrorDetail("לא ניתן לקרוא את צילומי המסך");
      return;
    }

    const result = await invokeBugReport({
      urgency,
      message: trimmed,
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      reporterEmail: replyToEmail,
      screenshots: screenshotPayload,
      website,
    });

    setSending(false);

    if (!result.ok) {
      setFeedback("error");
      setErrorDetail(result.error ?? "שליחת הדיווח נכשלה");
      return;
    }

    setFeedback("success");
    setMessage("");
    setUrgency("medium");
    setScreenshots((prev) => {
      clearScreenshots(prev);
      return [];
    });
  }

  return (
    <>
      <button
        type="button"
        className={
          embedded
            ? "fab fab-bug-report fab-bug-report--embedded print:hidden"
            : "fab fab-bug-report print:hidden"
        }
        onClick={() => setOpen(true)}
        aria-label="תיבת ההשבחות"
        title="תיבת ההשבחות"
      >
        <MessageCircleHeart
          strokeWidth={2.25}
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5"
        />
        <span className="whitespace-nowrap text-[13px] font-black leading-none sm:text-sm">
          תיבת ההשבחות
        </span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto p-4 sm:w-full sm:p-6">
          <DialogHeader>
            <DialogTitle>דיווח באג</DialogTitle>
            <DialogDescription>
              תארי את הבעיה. אפשר לצרף צילומי מסך. הדיווח יישלח למפתחת עם רמת
              הדחיפות וכתובת העמוד הנוכחי.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-5"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            >
              <label htmlFor="bug-website">Website</label>
              <input
                id="bug-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <fieldset className="space-y-2 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-ink">דחיפות</legend>
              <div className="grid grid-cols-2 gap-2">
                {BUG_URGENCY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                      urgency === opt.value
                        ? "border-red-400/50 bg-red-500/10"
                        : "border-border bg-brand-50/40 hover:bg-brand-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="bug-urgency"
                      value={opt.value}
                      checked={urgency === opt.value}
                      onChange={() => setUrgency(opt.value)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-semibold text-ink">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-message">תיאור הבעיה</Label>
              <textarea
                id="bug-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={BUG_MESSAGE_MAX_LENGTH}
                rows={6}
                placeholder=""
                className="w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm text-ink shadow-inner shadow-brand-100/40 placeholder:text-muted-foreground/70 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              />
              <p className="text-xs text-muted-foreground">
                {message.length} / {BUG_MESSAGE_MAX_LENGTH}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-screenshots">צילומי מסך (אופציונלי)</Label>
              <input
                ref={fileInputRef}
                id="bug-screenshots"
                type="file"
                accept={BUG_SCREENSHOT_ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => handleScreenshotPick(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  sending || screenshots.length >= BUG_SCREENSHOT_MAX_COUNT
                }
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 justify-center"
              >
                <ImagePlus className="h-4 w-4" />
                הוספת צילום מסך
              </Button>
              <p className="text-xs text-muted-foreground">
                עד {BUG_SCREENSHOT_MAX_COUNT} תמונות · PNG / JPG / WEBP / GIF · עד{" "}
                {formatFileSize(BUG_SCREENSHOT_MAX_BYTES)} לקובץ
              </p>

              {screenshots.length > 0 && (
                <ul className="grid grid-cols-3 gap-2">
                  {screenshots.map((shot) => (
                    <li
                      key={shot.id}
                      className="relative overflow-hidden rounded-xl border border-border bg-brand-50/40"
                    >
                      <img
                        src={shot.previewUrl}
                        alt={shot.file.name}
                        className="h-24 w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute left-1 top-1 rounded-full bg-ink/80 p-1 text-white"
                        aria-label={`הסרת ${shot.file.name}`}
                        onClick={() => removeScreenshot(shot.id)}
                        disabled={sending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {feedback === "success" && (
              <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                הדיווח נשלח לשרת המייל — תודה!
                <span className="mt-1 block text-xs font-normal text-brand-600">
                  המייל מגיע ל: {BUG_REPORT_RECIPIENTS.join(", ")}. בדקי גם
                  בתיקיית ספאם.
                </span>
              </p>
            )}
            {feedback === "error" && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
                {errorDetail ?? "שליחת הדיווח נכשלה"}
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
                disabled={sending || !message.trim()}
                className="gap-2 font-black"
              >
                <Send className="h-4 w-4" />
                {sending ? "שולחת…" : "שליחת דיווח"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
