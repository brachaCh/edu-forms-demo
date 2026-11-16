"use client";

import { useEffect, useState } from "react";
import { FormParentSendStatusLine } from "@/components/students/FormParentSendStatusLine";
import { fetchStudentParentFormSendStatuses } from "@/lib/form-parent-send-status-client";
import type { StudentParentFormSendStatus } from "@/lib/form-parent-send-status";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFormFillRequest } from "@/lib/form-fill-request";
import { FormSendStatusPanel } from "@/components/students/FormSendStatusPanel";
import type { FormSchema } from "@/lib/form-schemas";
import type { FormFillStatus, Student } from "@/lib/supabase/types";
import { formatStudentDisplayName } from "@/lib/person-name";
import { cn } from "@/lib/utils";

interface ParentQuestionnaireSendPanelProps {
  schema: FormSchema;
  student: Student;
  data: Record<string, string>;
  formFillId?: string;
  fillStatus?: FormFillStatus;
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

export function ParentQuestionnaireSendPanel({
  schema,
  student,
  data,
  formFillId,
  fillStatus,
  className,
}: ParentQuestionnaireSendPanelProps) {
  const [emails, setEmails] = useState(() => (student.email ?? "").trim());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sendStatus, setSendStatus] =
    useState<StudentParentFormSendStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    void fetchStudentParentFormSendStatuses(schema.id, [student.id]).then(
      (result) => {
        if (cancelled) return;
        setStatusLoading(false);
        if (result.ok && result.statuses?.[0]) {
          setSendStatus(result.statuses[0]);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [schema.id, student.id, success, formFillId, refreshTrigger]);

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (fillStatus === "completed") {
      setError("הטופס כבר הושלם. אין צורך לשלוח קישור נוסף למייל.");
      return;
    }

    const to = splitEmails(emails);
    if (to.length === 0) {
      setError("נא להזין מייל הורים (אפשר כמה כתובות מופרדות בפסיק)");
      return;
    }
    if (!formFillId) {
      setError("יש לשמור את הטופס לפני שליחה להורים");
      return;
    }

    setSending(true);
    try {
      const studentName =
        formatStudentDisplayName(student.full_name) ||
        data.full_name ||
        "";

      // Send a link to each recipient
      const sentTo: string[] = [];
      for (const email of to) {
        const result = await createFormFillRequest({
          formFillId,
          formId: schema.id,
          formTitle: schema.title,
          studentName,
          recipientEmail: email,
          note: note.trim() || undefined,
        });
        if (!result.ok) {
          setError(result.error || "שליחת הקישור נכשלה");
          setSending(false);
          return;
        }
        sentTo.push(...(result.sentTo ?? [email]));
      }

      setSuccess(`קישור למילוי השאלון נשלח ל: ${sentTo.join(", ")}`);
      setRefreshTrigger((prev) => prev + 1);
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
        <p className="text-base font-bold text-ink">שליחת השאלון להורים במייל</p>
        <p className="mt-1 text-sm text-pink">
          ההורים יקבלו קישור אישי למילוי השאלון — התשובות יחזרו אוטומטית לטופס.
        </p>
        <FormParentSendStatusLine
          status={sendStatus}
          loading={statusLoading}
          className="mt-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parent-q-emails">מייל ההורים</Label>
        <Input
          id="parent-q-emails"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parent-q-note">הודעה קצרה להורים (אופציונלי)</Label>
        <textarea
          id="parent-q-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="min-h-[72px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
          placeholder="למשל: נשמח לקבל תשובה עד יום חמישי"
        />
      </div>

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
          disabled={sending || !formFillId || fillStatus === "completed"}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mail className="h-5 w-5" />
          )}
          {sending ? "שולחת..." : "שליחת קישור למייל ההורים"}
        </Button>
      </div>

      {!formFillId ? (
        <p className="text-center text-xs text-destructive">
          יש לשמור את הטופס לפחות פעם אחת לפני שליחה להורים.
        </p>
      ) : null}

      <FormSendStatusPanel formFillId={formFillId} className="mt-4" refreshTrigger={refreshTrigger} />
    </div>
  );
}
