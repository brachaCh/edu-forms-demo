"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeSendStaffMeetingParent } from "@/lib/invokeSendStaffMeetingParent";
import {
  buildStaffMeetingParentEmail,
  buildStaffMeetingParentEmailHtmlFromText,
  formatStaffMeetingDateForEmail,
  listStaffMeetingRows,
} from "@/lib/staff-meeting-parent-email";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { Student } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface StaffMeetingParentSendPanelProps {
  student: Student;
  data: Record<string, string>;
  className?: string;
  disabled?: boolean;
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

export function StaffMeetingParentSendPanel({
  student,
  data,
  className,
  disabled = false,
}: StaffMeetingParentSendPanelProps) {
  const meetings = useMemo(() => listStaffMeetingRows(data), [data]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [emails, setEmails] = useState(() => (student.email ?? "").trim());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeMeeting =
    meetings.find((m) => m.rowIndex === selectedIndex) ??
    meetings[meetings.length - 1] ??
    null;

  const studentNameForEmail =
    formatStudentDisplayName(student.full_name) || data.full_name || "";

  const preview = useMemo(() => {
    if (!activeMeeting) return null;
    return buildStaffMeetingParentEmail({
      studentName: studentNameForEmail,
      meeting: {
        rowIndex: activeMeeting.rowIndex,
        date: activeMeeting.date,
        participants: activeMeeting.participants,
        summary: activeMeeting.summary,
      },
    });
  }, [
    activeMeeting?.rowIndex,
    activeMeeting?.date,
    activeMeeting?.participants,
    activeMeeting?.summary,
    studentNameForEmail,
  ]);

  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");

  function resetEmailDraft() {
    if (!preview) return;
    setEmailSubject(preview.subject);
    setEmailText(preview.text);
  }

  useEffect(() => {
    if (preview) {
      setEmailSubject(preview.subject);
      setEmailText(preview.text);
    }
  }, [preview]);

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (!activeMeeting) {
      setError("יש למלא לפחות ישיבת צוות אחת (תאריך / משתתפים / סיכום) לפני שליחה");
      return;
    }
    if (!activeMeeting.summary.trim()) {
      setError("נא למלא «סיכום והמלצות» בישיבה שנבחרה לפני שליחה להורים");
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
        studentName: studentNameForEmail,
      });
      if (!result.ok) {
        setError(result.error || "שליחת המייל נכשלה");
        return;
      }
      setSuccess(
        `העדכון נשלח ל: ${(result.sentTo ?? to).join(", ")}`
      );
    } catch {
      setError("שגיאת רשת — בדקו חיבור לאינטרנט");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border-2 border-brand-200 bg-white p-4",
        className
      )}
    >
      <div className="text-center">
        <p className="text-base font-bold text-ink">שליחת עדכון להורים</p>
        <p className="mt-1 text-sm text-pink">
          יישלח מייל עם סיכום והמלצות מהישיבה שנבחרה.
        </p>
      </div>

      {meetings.length === 0 ? (
        <p className="text-center text-sm text-destructive">
          מלאו שורה בטבלת ישיבות הצוות (תאריך, משתתפים וסיכום) ואז שלחו להורים.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-meeting-row">ישיבה לשליחה</Label>
          <select
            id="staff-meeting-row"
            className="h-10 w-full rounded-md border-2 border-brand-200 bg-white px-3 text-sm font-medium text-ink focus-visible:border-brand-500 focus-visible:outline-none"
            value={String(activeMeeting?.rowIndex ?? "")}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              setSelectedIndex(Number.isFinite(next) ? next : null);
            }}
          >
            {meetings.map((m) => {
              const dateLabel = formatStaffMeetingDateForEmail(m.date);
              const hint = m.summary
                ? m.summary.slice(0, 40) + (m.summary.length > 40 ? "…" : "")
                : "ללא סיכום";
              return (
                <option key={m.rowIndex} value={m.rowIndex}>
                  {dateLabel} — {hint}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-meeting-emails">מייל ההורים</Label>
        <Input
          id="staff-meeting-emails"
          type="text"
          inputMode="email"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="parent@example.com"
          dir="ltr"
          className="text-left"
        />
        <p className="text-xs text-pink">
          אפשר כמה כתובות מופרדות בפסיק. אם אין מייל בכרטיס — הזינו כאן.
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
            <Label htmlFor="staff-meeting-subject">נושא המייל</Label>
            <Input
              id="staff-meeting-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-meeting-body">תוכן המייל</Label>
            <textarea
              id="staff-meeting-body"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={12}
              className="min-h-[12rem] w-full resize-y rounded-2xl border border-input bg-white px-4 py-3 text-sm leading-relaxed text-ink shadow-inner shadow-brand-100/40 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">{error}</p>
      ) : null}
      {success ? (
        <p className="text-center text-sm font-medium text-brand-700">{success}</p>
      ) : null}

      <div className="flex justify-center">
        <Button
          type="button"
          size="lg"
          disabled={
            disabled || sending || meetings.length === 0 || !activeMeeting
          }
          onClick={() => void handleSend()}
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mail className="h-5 w-5" />
          )}
          {sending ? "שולחת..." : "שליחה להורים"}
        </Button>
      </div>
    </div>
  );
}
