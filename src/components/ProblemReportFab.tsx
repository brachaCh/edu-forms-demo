"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bug,
  Camera,
  ChevronDown,
  ChevronUp,
  Info,
  Send,
  Trash2,
  Video,
  VideoOff,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { clearUser, getUser, isStaleDemoProfile } from "@/lib/mock-store";
import {
  invokeProblemReport,
  requestRecordingUploadUrl,
  confirmRecordingUpload,
  type AttachmentPayload,
} from "@/lib/invokeProblemReport";
import { PROBLEM_REPORT_DESCRIPTION_MAX } from "@/lib/problem-report/constants";
import {
  initTechLog,
  getTechLogSnapshot,
  formatTechLogForSubmit,
  type TechLogSnapshot,
} from "@/lib/problem-report/tech-log";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/supabase/types";

type AttachmentType = "screenshot" | "recording";

type Attachment = {
  id: string;
  type: AttachmentType;
  blob: Blob;
  previewUrl: string;
  filename: string;
  mime: string;
};

const MAX_SCREENSHOT_SIZE = 800 * 1024;
const MAX_SCREENSHOT_WIDTH = 1600;
const MAX_RECORDING_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_PAYLOAD_SIZE = 3_500_000;
const MAX_SCREENSHOTS = 3;
const MAX_RECORDING_DURATION_MS = 60_000;
const ACCENT_COLOR = "#FF6B4A";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function currentPagePath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function currentBrowser(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

function supportsScreenRecording(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}

async function captureScreenshot(): Promise<Blob | null> {
  try {
    const { toBlob } = await import("html-to-image");
    const element = document.body;
    const blob = await toBlob(element, {
      cacheBust: true,
      pixelRatio: 1,
      quality: 0.7,
      filter: (node) => {
        if (node instanceof HTMLElement) {
          if (node.closest("[data-problem-report-dialog]")) return false;
          if (node.classList.contains("fab-problem-report")) return false;
        }
        return true;
      },
    });
    return blob;
  } catch (err) {
    console.error("[ProblemReportFab] screenshot failed:", err);
    return null;
  }
}

async function compressImageToJpeg(
  blob: Blob,
  maxWidth: number,
  maxSizeBytes: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;

  const img = await createImageBitmap(blob);

  let targetWidth = img.width;
  let targetHeight = img.height;

  if (targetWidth > maxWidth) {
    const scale = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = Math.floor(img.height * scale);
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  let quality = 0.7;
  let result: Blob | null = null;

  while (quality >= 0.3) {
    result = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (result && result.size <= maxSizeBytes) {
      return result;
    }

    quality -= 0.1;
  }

  if (result) return result;
  return blob;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function ProblemReportFab() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [browser, setBrowser] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [techLogSnapshot, setTechLogSnapshot] = useState<TechLogSnapshot | null>(null);
  const [includeTechLog, setIncludeTechLog] = useState(true);
  const [techLogExpanded, setTechLogExpanded] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);

  useEffect(() => {
    initTechLog();
  }, []);

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

  const accountEmail = user?.email?.trim() ?? "";

  function clearAttachments(list: Attachment[]) {
    for (const att of list) {
      URL.revokeObjectURL(att.previewUrl);
    }
  }

  function resetForm() {
    setDescription("");
    setWebsite("");
    setTicketId(null);
    setErrorDetail(null);
    setAttachments((prev) => {
      clearAttachments(prev);
      return [];
    });
    setTechLogSnapshot(null);
    setIncludeTechLog(true);
    setTechLogExpanded(false);
  }

  function handleOpenChange(next: boolean) {
    if (sending || recording) return;
    setOpen(next);
    if (next) {
      setPagePath(currentPagePath());
      setBrowser(currentBrowser());
      setErrorDetail(null);
      setTicketId(null);
      setTechLogSnapshot(getTechLogSnapshot());
    } else {
      resetForm();
    }
  }

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setRecording(false);
    setRecordingStartTime(null);
  }, []);

  async function handleScreenshot() {
    const currentScreenshots = attachments.filter((a) => a.type === "screenshot").length;
    if (currentScreenshots >= MAX_SCREENSHOTS) {
      setErrorDetail(`לכל היותר ${MAX_SCREENSHOTS} צילומי מסך`);
      return;
    }

    setCapturingScreenshot(true);
    setErrorDetail(null);

    const wasOpen = open;
    if (wasOpen) setOpen(false);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const rawBlob = await captureScreenshot();

    if (wasOpen) setOpen(true);
    setCapturingScreenshot(false);

    if (!rawBlob) {
      setErrorDetail("לא ניתן לצלם את המסך");
      return;
    }

    const blob = await compressImageToJpeg(
      rawBlob,
      MAX_SCREENSHOT_WIDTH,
      MAX_SCREENSHOT_SIZE
    );

    if (blob.size > MAX_SCREENSHOT_SIZE) {
      setErrorDetail(`צילום המסך גדול מדי גם אחרי דחיסה`);
      return;
    }

    const id = `screenshot-${Date.now()}`;
    setAttachments((prev) => [
      ...prev,
      {
        id,
        type: "screenshot",
        blob,
        previewUrl: URL.createObjectURL(blob),
        filename: `screenshot-${Date.now()}.jpg`,
        mime: "image/jpeg",
      },
    ]);
  }

  async function startRecording() {
    if (!supportsScreenRecording()) {
      setErrorDetail("הקלטת מסך אינה נתמכת בדפדפן זה");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });

      setOpen(false);
      await new Promise((resolve) => setTimeout(resolve, 100));

      streamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const mime = mimeType.includes("mp4") ? "video/mp4" : "video/webm";

        setOpen(true);
        setRecording(false);
        setRecordingStartTime(null);

        if (blob.size > MAX_RECORDING_SIZE) {
          setErrorDetail(
            `ההקלטה גדולה מדי (${formatFileSize(blob.size)}). הגבלה: ${formatFileSize(MAX_RECORDING_SIZE)}`
          );
          return;
        }

        const existingRecordings = attachments.filter((a) => a.type === "recording");
        if (existingRecordings.length > 0) {
          setErrorDetail("ניתן להעלות רק הקלטה אחת");
          return;
        }

        const id = `recording-${Date.now()}`;
        setAttachments((prev) => [
          ...prev,
          {
            id,
            type: "recording",
            blob,
            previewUrl: URL.createObjectURL(blob),
            filename: `recording-${Date.now()}.${mime === "video/mp4" ? "mp4" : "webm"}`,
            mime,
          },
        ]);
      };

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopRecording();
      });

      mediaRecorder.start(1000);
      setRecording(true);
      setRecordingStartTime(Date.now());

      recordingTimerRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_DURATION_MS);
    } catch (err) {
      setOpen(true);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setErrorDetail("הקלטת מסך בוטלה");
      } else {
        setErrorDetail("לא ניתן להתחיל הקלטה");
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
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

    const screenshotAttachments = attachments.filter((a) => a.type === "screenshot");
    const recordingAttachments = attachments.filter((a) => a.type === "recording");

    const totalInlineSize = screenshotAttachments.reduce(
      (sum, a) => sum + Math.ceil(a.blob.size * 1.37),
      0
    ) + (includeTechLog && techLogSnapshot ? JSON.stringify(techLogSnapshot).length : 0);

    if (totalInlineSize > MAX_TOTAL_PAYLOAD_SIZE) {
      setErrorDetail("סה״כ גודל הקבצים חורג מהמותר. נסו למחוק צילומי מסך.");
      return;
    }

    setSending(true);
    setErrorDetail(null);
    setTicketId(null);

    const attachmentPayloads: AttachmentPayload[] = [];

    for (const screenshot of screenshotAttachments) {
      try {
        const base64 = await blobToBase64(screenshot.blob);
        attachmentPayloads.push({
          kind: "screenshot",
          data: base64,
          mime: screenshot.mime as "image/png" | "image/jpeg" | "image/webp",
        });
      } catch {
        console.error("[ProblemReportFab] screenshot encoding failed");
      }
    }

    if (includeTechLog && techLogSnapshot) {
      const techLogJson = JSON.stringify(techLogSnapshot);
      attachmentPayloads.push({
        kind: "techlog",
        data: btoa(unescape(encodeURIComponent(techLogJson))),
        mime: "application/json",
      });
    }

    const recordingMime = recordingAttachments.length > 0
      ? (recordingAttachments[0]?.mime as "video/webm" | "video/mp4")
      : undefined;

    const result = await invokeProblemReport({
      description: trimmedDescription,
      pagePath,
      browser,
      website,
      recordingMime,
      attachments: attachmentPayloads,
    });

    if (!result.ok) {
      setSending(false);
      setErrorDetail(result.error ?? "שליחת הדיווח נכשלה");
      return;
    }

    const warnings: string[] = result.attachmentWarnings ?? [];

    if (result.recordingGrant && recordingAttachments.length > 0) {
      const recording = recordingAttachments[0];
      if (recording) {
        try {
          const urlResult = await requestRecordingUploadUrl(result.recordingGrant);

          if (urlResult.ok && urlResult.signedUrl && urlResult.uploadTicket) {
            const uploadResponse = await fetch(urlResult.signedUrl, {
              method: "PUT",
              body: recording.blob,
              headers: { "Content-Type": recording.mime },
            });

            if (uploadResponse.ok) {
              const confirmResult = await confirmRecordingUpload(
                urlResult.uploadTicket
              );
              if (!confirmResult.ok) {
                warnings.push("הקלטה: אישור העלאה נכשל");
              }
            } else {
              warnings.push("הקלטה: העלאה נכשלה");
            }
          } else {
            warnings.push("הקלטה: קבלת קישור העלאה נכשלה");
          }
        } catch {
          warnings.push("הקלטה: שגיאה בהעלאה");
        }
      }
    }

    setSending(false);

    if (warnings.length > 0) {
      setErrorDetail(`הדיווח נוצר, אך חלק מהקבצים לא הועלו: ${warnings.join(", ")}`);
    }

    setTicketId(result.ticketId ?? null);
    setDescription("");
    setAttachments((prev) => {
      clearAttachments(prev);
      return [];
    });
  }

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      stopRecording();
      attachmentsRef.current.forEach((att) => URL.revokeObjectURL(att.previewUrl));
    };
  }, [stopRecording]);

  const screenshots = attachments.filter((a) => a.type === "screenshot");
  const recordings = attachments.filter((a) => a.type === "recording");

  return (
    <>
      <button
        type="button"
        className="fab-problem-report"
        onClick={() => handleOpenChange(true)}
        aria-label="דיווח על תקלה"
        title="דיווח על תקלה"
        disabled={capturingScreenshot}
      >
        <Bug className="h-5 w-5" aria-hidden />
        <span className="hidden sm:inline">דיווח על תקלה</span>
      </button>

      {recording && (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-red-600 px-4 py-3 text-white shadow-lg"
          role="status"
        >
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
            מקליט מסך
            {recordingStartTime && (
              <RecordingTimer startTime={recordingStartTime} maxDuration={MAX_RECORDING_DURATION_MS} />
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={stopRecording}
            className="border-white bg-transparent text-white hover:bg-white/20"
          >
            <VideoOff className="mr-1 h-4 w-4" />
            עצור הקלטה
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          data-problem-report-dialog
          className="fixed bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-md translate-x-0 translate-y-0 overflow-y-auto rounded-t-3xl rounded-b-none sm:bottom-4 sm:left-4 sm:top-auto sm:rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" style={{ color: ACCENT_COLOR }} />
              דיווח על תקלה
            </DialogTitle>
            <DialogDescription>
              תיאור קצר של מה שקרה. הדיווח נפתח כפנייה בצוותא, ונשלח אישור למייל עם מספר הפנייה.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            >
              <label htmlFor="problem-website-fab">Website</label>
              <input
                id="problem-website-fab"
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
              <strong>שימו לב לפרטיות:</strong> אין לכתוב שמות תלמידים, מספרי זהות או פרטים מזהים
              אחרים. צילומי מסך והקלטות עשויים לכלול מידע רגיש — בדקו לפני השליחה.
            </p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="problem-description-fab">תיאור התקלה</Label>
              <textarea
                id="problem-description-fab"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={PROBLEM_REPORT_DESCRIPTION_MAX}
                rows={4}
                required
                placeholder="תארי את הבעיה..."
                className="w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm text-ink shadow-inner shadow-brand-100/40 placeholder:text-muted-foreground/70 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              />
              <p className="text-xs text-muted-foreground">
                נכתבו <bdi>{description.length}</bdi> מתוך <bdi>{PROBLEM_REPORT_DESCRIPTION_MAX}</bdi>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleScreenshot()}
                disabled={sending || capturingScreenshot}
                className="gap-1.5"
              >
                <Camera className="h-4 w-4" />
                צילום מסך
              </Button>
              {supportsScreenRecording() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void startRecording()}
                  disabled={sending || recording}
                  className="gap-1.5"
                >
                  <Video className="h-4 w-4" />
                  הקלטת מסך
                </Button>
              )}
              {!supportsScreenRecording() && (
                <p className="text-xs text-muted-foreground">
                  הקלטת מסך אינה נתמכת בדפדפן זה (iOS Safari וכו׳)
                </p>
              )}
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>קבצים מצורפים</Label>
                <p className="text-xs text-amber-600">
                  <Info className="inline h-3.5 w-3.5" /> הקבצים עשויים לכלול פרטי תלמידים. בדקו
                  ומחקו לפני השליחה.
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {screenshots.map((att) => (
                    <li
                      key={att.id}
                      className="relative overflow-hidden rounded-xl border border-border bg-brand-50/40"
                    >
                      <img
                        src={att.previewUrl}
                        alt="צילום מסך"
                        className="h-24 w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute left-1 top-1 rounded-full bg-ink/80 p-1 text-white hover:bg-ink"
                        aria-label="הסרת צילום מסך"
                        onClick={() => removeAttachment(att.id)}
                        disabled={sending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {formatFileSize(att.blob.size)}
                      </span>
                    </li>
                  ))}
                  {recordings.map((att) => (
                    <li
                      key={att.id}
                      className="relative overflow-hidden rounded-xl border border-border bg-brand-50/40"
                    >
                      <video
                        src={att.previewUrl}
                        controls
                        className="h-24 w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute left-1 top-1 rounded-full bg-ink/80 p-1 text-white hover:bg-ink"
                        aria-label="הסרת הקלטה"
                        onClick={() => removeAttachment(att.id)}
                        disabled={sending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {formatFileSize(att.blob.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-border bg-brand-50/50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-tech-log"
                    checked={includeTechLog}
                    onCheckedChange={(checked) => setIncludeTechLog(checked === true)}
                  />
                  <Label htmlFor="include-tech-log" className="cursor-pointer text-sm font-medium">
                    צרף יומן טכני
                  </Label>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-ink"
                  onClick={() => setTechLogExpanded((prev) => !prev)}
                >
                  {techLogExpanded ? "הסתר" : "הצג"}
                  {techLogExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {includeTechLog && (
                <p className="mt-1 text-xs text-muted-foreground">
                  כולל: בקשות רשת (ללא גוף/headers), שגיאות console, נתיב/דפדפן/מסך
                </p>
              )}
              {techLogExpanded && techLogSnapshot && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-white p-2 text-[10px] text-ink" dir="ltr">
                  {formatTechLogForSubmit(techLogSnapshot)}
                </pre>
              )}
            </div>

            <div className="rounded-xl border border-border bg-brand-50/50 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-semibold text-ink">יצורף אוטומטית</p>
              <p className="mt-1">
                נתיב: <span dir="ltr" className="inline-block">{pagePath || "—"}</span>
              </p>
              <p className="mt-0.5 truncate">
                דפדפן: <span dir="ltr" className="inline-block">{browser.slice(0, 80) || "—"}</span>
              </p>
              {accountEmail && (
                <p className="mt-0.5">
                  מייל: <span dir="ltr" className="inline-block">{accountEmail}</span>
                </p>
              )}
            </div>

            {ticketId && (
              <p
                role="status"
                className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
              >
                הדיווח בטיפול. מספר הפנייה: <span className="font-black">{ticketId}</span>
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
              <Button type="button" variant="ghost" disabled={sending} onClick={() => handleOpenChange(false)}>
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={sending || !description.trim() || !accountEmail}
                className={cn("gap-2 font-black")}
                style={{ background: ACCENT_COLOR }}
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

function RecordingTimer({ startTime, maxDuration }: { startTime: number; maxDuration: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.min(Date.now() - startTime, maxDuration));
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, maxDuration]);

  const seconds = Math.floor(elapsed / 1000);
  const maxSeconds = Math.floor(maxDuration / 1000);

  return (
    <span className="font-mono text-sm">
      {String(Math.floor(seconds / 60)).padStart(2, "0")}:
      {String(seconds % 60).padStart(2, "0")} / {String(Math.floor(maxSeconds / 60)).padStart(2, "0")}:
      {String(maxSeconds % 60).padStart(2, "0")}
    </span>
  );
}
