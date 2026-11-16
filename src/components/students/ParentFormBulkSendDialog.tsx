"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail } from "lucide-react";
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
import { PARENT_BULK_SEND_FORM_IDS } from "@/lib/form-parent-send-status";
import {
  fetchStudentParentFormSendStatuses,
  runParentFormBulkSendClient,
} from "@/lib/form-parent-send-status-client";
import { shouldSkipBulkRecipient } from "@/lib/form-parent-send-status";
import { getFormSchema } from "@/lib/form-schemas";
import type { Student } from "@/lib/supabase/types";

interface ParentFormBulkSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  defaultFormId?: string;
  institutionScopeStudents?: Student[];
  onComplete?: (summary: string) => void;
}

export function ParentFormBulkSendDialog({
  open,
  onOpenChange,
  students,
  defaultFormId = "parent-questionnaire",
  institutionScopeStudents,
  onComplete,
}: ParentFormBulkSendDialogProps) {
  const [formId, setFormId] = useState(defaultFormId);
  const [scope, setScope] = useState<"class" | "institution">("class");
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [skipAlreadyFilled, setSkipAlreadyFilled] = useState(true);
  const [note, setNote] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  const scopeStudents = useMemo(() => {
    if (scope === "institution" && institutionScopeStudents?.length) {
      return institutionScopeStudents;
    }
    return students;
  }, [scope, students, institutionScopeStudents]);

  const formOptions = useMemo(
    () =>
      PARENT_BULK_SEND_FORM_IDS.map((id) => {
        const schema = getFormSchema(id);
        return { id, label: schema?.title ?? id };
      }),
    []
  );

  useEffect(() => {
    if (!open) return;
    setFormId(defaultFormId);
    setScope("class");
    setError(null);
    setRecipientCount(null);
    setNote("");
  }, [open, defaultFormId]);

  useEffect(() => {
    if (!open || scopeStudents.length === 0) {
      setRecipientCount(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    void fetchStudentParentFormSendStatuses(
      formId,
      scopeStudents.map((s) => s.id)
    ).then((result) => {
      if (cancelled) return;
      setLoadingPreview(false);
      if (!result.ok || !result.statuses) {
        setRecipientCount(null);
        setError(result.error ?? "לא ניתן לטעון סטטוס");
        return;
      }
      const count = result.statuses.filter(
        (row) =>
          !shouldSkipBulkRecipient(row, { skipAlreadySent, skipAlreadyFilled })
      ).length;
      setRecipientCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [open, formId, scopeStudents, skipAlreadySent, skipAlreadyFilled]);

  async function handleSend() {
    if (recipientCount === 0) {
      setError("אין נמענים לשליחה לפי הסינון שנבחר");
      return;
    }
    setSending(true);
    setError(null);
    const preview = await fetchStudentParentFormSendStatuses(
      formId,
      scopeStudents.map((s) => s.id)
    );
    if (!preview.ok || !preview.statuses) {
      setSending(false);
      setError(preview.error ?? "לא ניתן לטעון סטטוס");
      return;
    }
    const targetIds = preview.statuses
      .filter(
        (row) =>
          !shouldSkipBulkRecipient(row, { skipAlreadySent, skipAlreadyFilled })
      )
      .map((row) => row.studentId);

    const response = await runParentFormBulkSendClient({
      formId,
      studentIds: targetIds,
      skipAlreadySent,
      skipAlreadyFilled,
      note: note.trim() || undefined,
    });
    setSending(false);
    if (!response.ok) {
      setError(response.error ?? "השליחה נכשלה");
      return;
    }
    const sent = response.sent?.length ?? 0;
    const failed = response.failed?.length ?? 0;
    const skipped = response.skipped?.length ?? 0;
    const summary = `סיום שליחה: ${sent} נשלחו, ${failed} נכשלו, ${skipped} דולגו`;
    onComplete?.(summary);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!sending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>שליחה גורפת להורים</DialogTitle>
          <DialogDescription>
            יישלח קישור למילוי או לחתימה לכל תלמידה שנבחרה, בלחיצה אחת. לפני
            השליחה מוצג מספר הנמענים לפי הסינון.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bulk-form-id">סוג טופס</Label>
            <select
              id="bulk-form-id"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              className="h-10 rounded-md border-2 border-brand-200 bg-white px-3 text-sm"
              disabled={sending}
            >
              {formOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {institutionScopeStudents && institutionScopeStudents.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="bulk-scope">היקף</Label>
              <select
                id="bulk-scope"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value === "institution" ? "institution" : "class")
                }
                className="h-10 rounded-md border-2 border-brand-200 bg-white px-3 text-sm"
                disabled={sending}
              >
                <option value="class">
                  כיתה נוכחית ({students.length} תלמידות)
                </option>
                <option value="institution">
                  כל התלמידות במוסד ({institutionScopeStudents.length})
                </option>
              </select>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipAlreadySent}
              onChange={(e) => setSkipAlreadySent(e.target.checked)}
              disabled={sending}
            />
            דילוג על מי שכבר נשלח לה
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipAlreadyFilled}
              onChange={(e) => setSkipAlreadyFilled(e.target.checked)}
              disabled={sending}
            />
            דילוג על מי שכבר מילאה
          </label>

          <div className="flex flex-col gap-1">
            <Label htmlFor="bulk-note">הודעה קצרה להורים (אופציונלי)</Label>
            <textarea
              id="bulk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="min-h-[56px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm"
              disabled={sending}
            />
          </div>

          <TaskRecipientMessage
            loading={loadingPreview}
            recipientCount={recipientCount}
            scopeCount={scopeStudents.length}
          />
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={sending || loadingPreview || recipientCount === 0}
            onClick={() => void handleSend()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {sending ? "שולחת..." : "אישור ושליחה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRecipientMessage({
  loading,
  recipientCount,
  scopeCount,
}: {
  loading: boolean;
  recipientCount: number | null;
  scopeCount: number;
}) {
  if (loading) {
    return <p className="text-sm text-pink">מחשבת נמענים...</p>;
  }
  if (recipientCount === null) {
    return (
      <p className="text-sm text-pink">
        סה״כ ברשימה: {scopeCount} תלמידות
      </p>
    );
  }
  return (
    <p className="text-sm font-medium text-ink">
      יישלחו ל־<strong>{recipientCount}</strong> תלמידות (מתוך {scopeCount})
    </p>
  );
}
