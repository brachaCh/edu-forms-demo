"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildStaffMeetingInviteDraft,
  DEFAULT_STAFF_MEETING_TIME,
  parseStaffMeetingAt,
  type InstitutionStaffMember,
} from "@/lib/staff-meetings";

export type StaffMeetingInvitePrefill = {
  title?: string;
  date?: string;
  time?: string;
  studentId?: string | null;
  studentName?: string | null;
  notes?: string | null;
};

interface StaffMeetingInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: StaffMeetingInvitePrefill;
  onSent?: () => void;
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function StaffMeetingInviteDialog({
  open,
  onOpenChange,
  prefill,
  onSent,
}: StaffMeetingInviteDialogProps) {
  const [staff, setStaff] = useState<InstitutionStaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("ישיבת צוות");
  const [date, setDate] = useState(todayIsoDate);
  const [time, setTime] = useState(DEFAULT_STAFF_MEETING_TIME);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const studentId = prefill?.studentId ?? null;
  const studentName = prefill?.studentName ?? null;

  const meetingAt = useMemo(
    () => parseStaffMeetingAt(date, time),
    [date, time]
  );

  const autoDraft = useMemo(
    () =>
      buildStaffMeetingInviteDraft({
        title,
        meetingAt: meetingAt ?? `${date}T${time}:00`,
        studentName,
        location,
        notes,
      }),
    [title, meetingAt, date, time, studentName, location, notes]
  );

  function applyAutoDraft() {
    setSubject(autoDraft.subject);
    setText(autoDraft.text);
  }

  useEffect(() => {
    if (!open) return;
    const nextTitle = prefill?.title?.trim() || "ישיבת צוות";
    const nextDate = prefill?.date?.trim() || todayIsoDate();
    const nextTime = prefill?.time?.trim() || DEFAULT_STAFF_MEETING_TIME;
    const nextNotes = prefill?.notes?.trim() || "";
    setTitle(nextTitle);
    setDate(nextDate);
    setTime(nextTime);
    setLocation("");
    setNotes(nextNotes);
    setSelectedIds([]);
    setError(null);
    setSuccess(null);
    const meetingIso =
      parseStaffMeetingAt(nextDate, nextTime) ?? `${nextDate}T${nextTime}:00`;
    const draft = buildStaffMeetingInviteDraft({
      title: nextTitle,
      meetingAt: meetingIso,
      studentName,
      location: "",
      notes: nextNotes,
    });
    setSubject(draft.subject);
    setText(draft.text);
  }, [
    open,
    prefill?.title,
    prefill?.date,
    prefill?.time,
    prefill?.notes,
    studentName,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingStaff(true);
    void (async () => {
      try {
        const response = await fetch("/api/staff-meetings/staff");
        if (!response.ok) {
          if (!cancelled) {
            setStaff([]);
            if (response.status === 403) {
              setError("רק מנהלת או בעלת המוסד יכולה לשלוח הזמנות לישיבת צוות.");
            }
          }
          return;
        }
        const body = (await response.json()) as {
          staff?: InstitutionStaffMember[];
        };
        if (!cancelled) setStaff(body.staff ?? []);
      } catch {
        if (!cancelled) setError("טעינת רשימת הצוות נכשלה.");
      } finally {
        if (!cancelled) setLoadingStaff(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function toggleStaff(id: string, enabled: boolean) {
    setSelectedIds((prev) => {
      if (enabled) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
    setError(null);
    setSuccess(null);
  }

  const selectable = staff.filter((member) => member.hasEmail);

  function toggleAll(select: boolean) {
    setSelectedIds(select ? selectable.map((member) => member.id) : []);
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);
    if (!date || !parseStaffMeetingAt(date, time)) {
      setError("נא לבחור תאריך ושעה תקינים.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("נא לבחור לפחות איש צוות אחד עם כתובת מייל.");
      return;
    }
    if (!subject.trim() || !text.trim()) {
      setError("נא למלא נושא ונוסח להזמנה.");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/staff-meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          time,
          location: location.trim() || null,
          notes: notes.trim() || null,
          student_id: studentId,
          invitation_subject: subject.trim(),
          invitation_text: text.trim(),
          staff_student_ids: selectedIds,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        sentTo?: string[];
        failedTo?: string[];
      };
      if (!response.ok) {
        if (body.error === "FORBIDDEN") {
          setError("רק מנהלת או בעלת המוסד יכולה לשלוח הזמנות.");
        } else if (body.error === "MEETING_NOT_FUTURE") {
          setError("אפשר להזמין רק לישיבה עתידית.");
        } else if (body.error === "NO_INVITEES" || body.error === "INVITEE_NO_EMAIL") {
          setError("נא לבחור אנשי צוות עם כתובת מייל תקינה.");
        } else if (body.error === "EMAIL_SEND_FAILED") {
          setError("שליחת המייל נכשלה. בדקו את הגדרות השליחה.");
        } else if (body.error === "MIGRATION_REQUIRED") {
          setError("יש להריץ את מיגרציית ישיבות הצוות בשרת.");
        } else if (body.error === "RATE_LIMITED") {
          setError("נשלחו יותר מדי הזמנות. נסו שוב בעוד כמה דקות.");
        } else {
          setError("שליחת ההזמנה נכשלה. נסו שוב.");
        }
        return;
      }
      const sent = body.sentTo ?? [];
      const failed = body.failedTo ?? [];
      const sentLabel =
        sent.length > 0 ? `ההזמנה נשלחה ל: ${sent.join(", ")}` : "הישיבה נשמרה.";
      setSuccess(
        failed.length > 0
          ? `${sentLabel} לא נשלח אל: ${failed.join(", ")}`
          : sentLabel
      );
      onSent?.();
    } catch {
      setError("שגיאת רשת — בדקו חיבור לאינטרנט.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הזמנה לישיבת צוות</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3" dir="rtl">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-meeting-title">נושא הישיבה</Label>
            <Input
              id="staff-meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-meeting-date">תאריך</Label>
              <Input
                id="staff-meeting-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-meeting-time">שעה</Label>
              <Input
                id="staff-meeting-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-meeting-location">מקום (אופציונלי)</Label>
            <Input
              id="staff-meeting-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {studentName ? (
            <p className="text-sm text-brand-800">
              הישיבה משויכת לתלמיד/ה: <strong>{studentName}</strong>
            </p>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink">בחירת מוזמנים — צוות המוסד</p>
              {selectable.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    toggleAll(selectedIds.length !== selectable.length)
                  }
                >
                  {selectedIds.length === selectable.length
                    ? "ביטול בחירה"
                    : "בחירת כל הצוות"}
                </Button>
              ) : null}
            </div>
            {loadingStaff ? (
              <p className="flex items-center gap-2 text-sm text-pink">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוענת את רשימת הצוות...
              </p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-brand-800">
                אין עדיין אנשי צוות במוסד. הוסיפו כרטיס צוות עם כתובת מייל.
              </p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {staff.map((member) => {
                  const checked = selectedIds.includes(member.id);
                  return (
                    <li
                      key={member.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!member.hasEmail}
                        onCheckedChange={(value) =>
                          toggleStaff(member.id, value === true)
                        }
                        aria-label={member.full_name}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {member.full_name || "בלי שם"}
                          {member.role ? (
                            <span className="font-normal text-brand-700">
                              {" "}
                              · {member.role}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-pink" dir="ltr">
                          {member.hasEmail
                            ? member.email
                            : "אין כתובת מייל בכרטיס"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-white px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink">נוסח ההזמנה (עברית)</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs"
                onClick={applyAutoDraft}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                איפוס לנוסח אוטומטי
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-meeting-subject">נושא המייל</Label>
              <Input
                id="staff-meeting-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                dir="rtl"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-meeting-body">תוכן ההזמנה</Label>
              <textarea
                id="staff-meeting-body"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                dir="rtl"
                className="min-h-[10rem] w-full resize-y rounded-2xl border border-input bg-white px-4 py-3 text-right text-sm leading-relaxed text-ink shadow-inner shadow-brand-100/40 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              />
            </div>
          </div>

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
            onClick={() => onOpenChange(false)}
          >
            סגירה
          </Button>
          <Button
            type="button"
            disabled={sending || loadingStaff}
            onClick={() => void handleSend()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {sending ? "שולחת..." : "שליחת הזמנה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
