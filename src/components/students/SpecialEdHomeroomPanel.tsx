"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { getCanManageStudents, getStudents } from "@/lib/mock-store";
import {
  findClassCurriculumOwner,
  listStudentsInSpecialEdClass,
} from "@/lib/special-ed-classes";
import {
  homeroomInviteErrorMessage,
  normalizeHomeroomInviteEmail,
  resolveClassHomeroomTeacher,
  sendHomeroomInvite,
  type ReassignStudent,
} from "@/lib/special-ed-homeroom-invite";
import type { Category } from "@/lib/supabase/types";

interface SpecialEdHomeroomPanelProps {
  className: string;
  category?: Category;
}

export function SpecialEdHomeroomPanel({
  className,
  category = "schools",
}: SpecialEdHomeroomPanelProps) {
  const { texts } = useSiteText();
  const { ready, refresh } = useDataStore();
  const [canInvite, setCanInvite] = useState(false);

  const initial = useMemo(() => {
    if (!ready) return { name: "", email: "" };
    const owner = findClassCurriculumOwner(className, category);
    const students = listStudentsInSpecialEdClass(className, category);
    const staffCards = getStudents().filter(
      (s) => s.status === "integration-teacher"
    );
    return resolveClassHomeroomTeacher({ owner, students, staffCards });
  }, [className, category, ready]);

  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingReassign, setPendingReassign] = useState<ReassignStudent[] | null>(
    null
  );

  useEffect(() => {
    setCanInvite(getCanManageStudents());
    setName(initial.name);
    setEmail(initial.email);
  }, [initial.name, initial.email, ready]);

  if (!canInvite && !initial.name && !initial.email) {
    return null;
  }

  async function handleSend(confirmReassign = false) {
    setError(null);
    setSuccess(null);
    if (!confirmReassign) setPendingReassign(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(
        getTextByPath(texts, "status.specialEdHomeroomNameRequired") ||
          "יש להזין שם מחנכת"
      );
      return;
    }
    if (!normalizeHomeroomInviteEmail(email)) {
      setError(
        getTextByPath(texts, "status.specialEdHomeroomEmailInvalid") ||
          "כתובת המייל אינה תקינה"
      );
      return;
    }

    setBusy(true);
    try {
      const result = await sendHomeroomInvite({
        className,
        category,
        teacherName: trimmedName,
        email,
        confirmReassign,
      });
      if (result.ok) {
        setPendingReassign(null);
        setSuccess(
          result.message ||
            (result.action === "assign_existing_member"
              ? `המחנכת ${trimmedName} כבר חברה במוסד — שויכה לכיתה`
              : `ההזמנה נשלחה לכתובת ${email.trim()}`)
        );
        await refresh();
        return;
      }
      if (result.error === "REASSIGN_CONFIRMATION_REQUIRED") {
        setPendingReassign(result.studentsToReassign ?? []);
        setError(
          result.message || homeroomInviteErrorMessage(result.error)
        );
        return;
      }
      setError(result.message || homeroomInviteErrorMessage(result.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-brand-200/80 bg-white px-4 py-4 shadow-sm">
      <h3 className="mb-3 text-center text-base font-bold text-ink">
        <EditableText path="status.specialEdHomeroomTitle" />
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="homeroom-teacher-name">
            <EditableText path="status.specialEdHomeroomNameLabel" />
          </Label>
          <Input
            id="homeroom-teacher-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || !canInvite}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="homeroom-teacher-email">
            <EditableText path="status.specialEdHomeroomEmailLabel" />
          </Label>
          <Input
            id="homeroom-teacher-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy || !canInvite}
            autoComplete="email"
          />
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm font-medium text-brand-700">{success}</p>
      ) : null}
      {pendingReassign && pendingReassign.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm font-medium text-ink">
            <EditableText path="status.specialEdHomeroomReassignTitle" />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText path="status.specialEdHomeroomReassignDescription" />
          </p>
          <ul className="mt-2 list-disc pr-5 text-sm text-ink">
            {pendingReassign.map((student) => (
              <li key={student.id}>
                {student.full_name}
                {student.teacher_name ? ` — ${student.teacher_name}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPendingReassign(null);
                setError(null);
              }}
            >
              <EditableText path="status.specialEdHomeroomReassignCancel" />
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void handleSend(true)}
            >
              <EditableText path="status.specialEdHomeroomReassignConfirm" />
            </Button>
          </div>
        </div>
      ) : null}
      {canInvite && !pendingReassign?.length ? (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleSend()}
          >
            <Mail className="h-4 w-4" />
            {busy ? (
              <EditableText path="status.specialEdHomeroomSending" />
            ) : (
              <EditableText path="status.specialEdHomeroomSendLink" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
