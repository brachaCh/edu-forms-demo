"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StaffMeetingInviteDialog,
  type StaffMeetingInvitePrefill,
} from "@/components/personal/StaffMeetingInviteDialog";
import {
  formatStaffMeetingDateTimeHe,
  type UpcomingStaffMeeting,
} from "@/lib/staff-meetings";

export function UpcomingStaffMeetingsSection() {
  const [meetings, setMeetings] = useState<UpcomingStaffMeeting[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [prefill, setPrefill] = useState<StaffMeetingInvitePrefill | undefined>();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-meetings");
      if (!response.ok) {
        setLoaded(true);
        return;
      }
      const body = (await response.json()) as {
        meetings?: UpcomingStaffMeeting[];
        canCreate?: boolean;
      };
      setMeetings(body.meetings ?? []);
      setCanCreate(body.canCreate === true);
    } catch {
      // בלי סשן / רשת — לא מציגים כלום מעבר למצב ריק
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return null;

  function openCreate() {
    setPrefill(undefined);
    setInviteOpen(true);
  }

  function openFromFormRow(meeting: UpcomingStaffMeeting) {
    const date = meeting.meeting_at.slice(0, 10);
    setPrefill({
      title: meeting.title,
      date,
      studentId: meeting.student_id,
      studentName: meeting.student_name,
      notes: meeting.notes,
    });
    setInviteOpen(true);
  }

  const createMeetingButton = (
    <Button
      type="button"
      size={meetings.length === 0 ? "default" : "sm"}
      onClick={openCreate}
      className="gap-1"
    >
      <Plus className="h-4 w-4" />
      קביעת ישיבת צוות
    </Button>
  );

  return (
    <section className="menu-box flex flex-col gap-3 p-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-bold text-ink">
          <CalendarClock className="h-5 w-5 text-brand-700" />
          ישיבות צוות עתידיות
        </div>
        {canCreate ? createMeetingButton : null}
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-brand-800">
            אין ישיבות צוות עתידיות במוסד.
            {canCreate ? (
              <>
                {" "}
                לשליחת הזמנה: פתחי «קביעת ישיבת צוות», בחרי תאריך ומוזמנים מאנשי
                הצוות, ולחצי «שליחת הזמנה» — ההזמנה תישלח במייל.
              </>
            ) : (
              <>
                {" "}
                קביעת ישיבה ושליחת הזמנות לצוות זמינה למנהלת או לבעלת המוסד
                בלבד.
              </>
            )}
          </p>
          {canCreate ? createMeetingButton : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((meeting) => (
            <li
              key={meeting.id}
              className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm"
            >
              <p className="font-bold text-ink">{meeting.title}</p>
              <p className="text-brand-800">
                {formatStaffMeetingDateTimeHe(meeting.meeting_at)}
                {meeting.location ? ` · ${meeting.location}` : ""}
              </p>
              {meeting.student_name ? (
                <p className="text-brand-700">תלמיד/ה: {meeting.student_name}</p>
              ) : null}
              {meeting.participants ? (
                <p className="text-brand-700">
                  משתתפים: {meeting.participants}
                </p>
              ) : null}
              {meeting.invitees.length > 0 ? (
                <p className="text-pink">
                  מוזמנים:{" "}
                  {meeting.invitees
                    .map((invitee) => invitee.full_name || invitee.email)
                    .join(", ")}
                </p>
              ) : null}
              {canCreate && meeting.source === "form-row" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 gap-1 px-2 text-xs"
                  onClick={() => openFromFormRow(meeting)}
                >
                  <Mail className="h-3.5 w-3.5" />
                  שליחת הזמנה
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canCreate ? (
        <StaffMeetingInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          prefill={prefill}
          onSent={() => void load()}
        />
      ) : null}
    </section>
  );
}
