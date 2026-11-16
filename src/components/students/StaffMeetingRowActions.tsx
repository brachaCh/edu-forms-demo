"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffMeetingInviteDialog } from "@/components/personal/StaffMeetingInviteDialog";
import { invokeSendStaffMeetingParent } from "@/lib/invokeSendStaffMeetingParent";
import {
  buildStaffMeetingParentEmail,
  buildStaffMeetingParentEmailHtmlFromText,
  buildStaffMeetingPrintHtml,
  getStaffMeetingRow,
  staffMeetingRowHasContent,
} from "@/lib/staff-meeting-parent-email";
import { formatStudentDisplayName } from "@/lib/person-name";
import { openDetachedPrintWindow, POPUP_BLOCKED_MESSAGE } from "@/lib/detached-print";
import type { Student } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface StaffMeetingRowActionsProps {
  student: Student;
  data: Record<string, string>;
  rowIndex: number;
  disabled?: boolean;
  className?: string;
}

function splitEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function StaffMeetingRowActions({
  student,
  data,
  rowIndex,
  disabled = false,
  className,
}: StaffMeetingRowActionsProps) {
  const meeting = getStaffMeetingRow(data, rowIndex);
  const hasContent = staffMeetingRowHasContent(meeting);
  const studentName =
    formatStudentDisplayName(student.full_name) || student.full_name || "";

  const [sendOpen, setSendOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [emails, setEmails] = useState(() => (student.email ?? "").trim());
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) return;
        const data = (await response.json()) as {
          canManageStudents?: boolean;
        };
        if (!cancelled) setCanInvite(data.canManageStudents === true);
      } catch {
        // בלי סשן אין כפתור הזמנה
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => {
    if (!hasContent) return null;
    return buildStaffMeetingParentEmail({
      studentName,
      meeting: {
        rowIndex,
        date: meeting.date,
        participants: meeting.participants,
        summary: meeting.summary,
      },
    });
  }, [
    hasContent,
    studentName,
    rowIndex,
    meeting.date,
    meeting.participants,
    meeting.summary,
  ]);

  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");

  function resetEmailDraft() {
    if (!preview) return;
    setEmailSubject(preview.subject);
    setEmailText(preview.text);
  }

  useEffect(() => {
    if (sendOpen && preview) {
      setEmailSubject(preview.subject);
      setEmailText(preview.text);
    }
  }, [sendOpen, preview]);

  async function handlePrint() {
    setError(null);
    if (!hasContent) {
      setError("מלאו תאריך / משתתפים / סיכום לפני הדפסה");
      return;
    }
    // חלון מנותק (noopener) — דיאלוג ההדפסה לא מקפיא את הדף הראשי
    const printWindow = openDetachedPrintWindow("ישיבת צוות");
    if (!printWindow) {
      window.alert(POPUP_BLOCKED_MESSAGE);
      return;
    }
    setPrinting(true);
    try {
      const html = buildStaffMeetingPrintHtml({ studentName, meeting });
      if (!(await printWindow.whenReady())) {
        printWindow.close();
        window.alert(POPUP_BLOCKED_MESSAGE);
        return;
      }
      printWindow.deliver(html, { autoPrint: true });
      printWindow.dispose();
    } catch {
      printWindow.close();
      setError("הדפסה נכשלה — נסו שוב");
    } finally {
      setPrinting(false);
    }
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (!hasContent) {
      setError("מלאו את שורת הישיבה לפני שליחה");
      return;
    }
    if (!meeting.summary.trim()) {
      setError("נא למלא «סיכום והמלצות» לפני שליחה להורים");
      return;
    }

    const to = splitEmails(emails);
    if (to.length === 0) {
      setError("נא להזין מייל הורים (אפשר כמה כתובות מופרדות בפסיק)");
      return;
    }

    const subject = emailSubject.trim();
    const text = emailText.trim();
    if (!subject || !text) {
      setError("נא למלא נושא ונוסח למייל");
      return;
    }

    const html = buildStaffMeetingParentEmailHtmlFromText(subject, text);
    setSending(true);
    try {
      const result = await invokeSendStaffMeetingParent({
        to,
        subject,
        text,
        html,
        studentName,
      });
      if (!result.ok) {
        setError(result.error || "שליחת המייל נכשלה");
        return;
      }
      setSuccess(`העדכון נשלח ל: ${(result.sentTo ?? to).join(", ")}`);
    } catch {
      setError("שגיאת רשת — בדקו חיבור לאינטרנט");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-stretch gap-1.5", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1 px-2 text-xs"
        disabled={disabled || !hasContent || printing}
        onClick={handlePrint}
        title="הדפסת ישיבה זו"
      >
        {printing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
        הדפסה
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1 px-2 text-xs"
        disabled={disabled || !hasContent}
        onClick={() => {
          setError(null);
          setSuccess(null);
          setEmails((student.email ?? "").trim());
          setSendOpen(true);
        }}
        title="שליחת ישיבה זו להורים"
      >
        <Mail className="h-3.5 w-3.5" />
        להורים
      </Button>
      {canInvite ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 px-2 text-xs"
          disabled={disabled || !meeting.date.trim()}
          onClick={() => {
            setError(null);
            setInviteOpen(true);
          }}
          title="הזמנת צוות לישיבה זו"
        >
          <Mail className="h-3.5 w-3.5" />
          הזמנה
        </Button>
      ) : null}

      <Dialog
        open={sendOpen}
        onOpenChange={(open) => {
          setSendOpen(open);
          if (!open) {
            setError(null);
            setSuccess(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שליחת ישיבת צוות להורים</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`staff-meeting-emails-${rowIndex}`}>
                מייל ההורים
              </Label>
              <Input
                id={`staff-meeting-emails-${rowIndex}`}
                type="text"
                inputMode="email"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="parent@example.com"
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-pink">
                אפשר כמה כתובות מופרדות בפסיק.
              </p>
            </div>

            {preview ? (
              <div className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink">עריכת נוסח המייל</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2 text-xs"
                    onClick={resetEmailDraft}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    איפוס לנוסח אוטומטי
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`staff-meeting-subject-${rowIndex}`}>
                    נושא המייל
                  </Label>
                  <Input
                    id={`staff-meeting-subject-${rowIndex}`}
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`staff-meeting-body-${rowIndex}`}>
                    תוכן המייל
                  </Label>
                  <textarea
                    id={`staff-meeting-body-${rowIndex}`}
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                    rows={12}
                    className="min-h-[12rem] w-full resize-y rounded-2xl border border-input bg-white px-4 py-3 text-sm leading-relaxed text-ink shadow-inner shadow-brand-100/40 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-center text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-center text-sm font-medium text-brand-700">
                {success}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSendOpen(false)}
            >
              סגירה
            </Button>
            <Button
              type="button"
              disabled={disabled || sending || !hasContent}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {sending ? "שולחת..." : "שליחה להורים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canInvite ? (
        <StaffMeetingInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          prefill={{
            title: studentName
              ? `ישיבת צוות — ${studentName}`
              : "ישיבת צוות",
            date: meeting.date.trim(),
            studentId: student.id,
            studentName,
            notes: meeting.summary || meeting.participants || null,
          }}
        />
      ) : null}
    </div>
  );
}
