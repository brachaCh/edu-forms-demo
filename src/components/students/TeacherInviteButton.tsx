"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import type { SiteTexts } from "@/lib/site-text";
import {
  sendTeacherInvite,
  type TeacherInviteErrorCode,
} from "@/lib/teacher-invite";
import { canInviteInstitutionTeachers } from "@/lib/institution-owner";
import { getUser } from "@/lib/mock-store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TeacherInviteButtonProps {
  studentId: string;
  teacherName: string;
  email?: string | null;
  /** כפתור אייקון בלבד (ברשימת מורות) */
  iconOnly?: boolean;
  /** כפתור מלא (בכרטיס מורה) */
  variant?: "icon" | "button";
  className?: string;
}

function errorMessage(
  texts: SiteTexts,
  code?: TeacherInviteErrorCode
): string {
  const map: Record<TeacherInviteErrorCode, string> = {
    NO_EMAIL:
      getTextByPath(texts, "studentCard.teacherInviteNoEmail") ||
      "יש להוסיף כתובת מייל בכרטיס לפני שליחת הזמנה",
    ALREADY_HAS_ACCOUNT:
      getTextByPath(texts, "studentCard.teacherInviteAlreadyHasAccount") ||
      "כבר קיים חשבון עם כתובת מייל זו במוסד",
    ALREADY_LINKED:
      getTextByPath(texts, "studentCard.teacherInviteAlreadyLinked") ||
      "למורה כבר יש חשבון מקושר",
    NOT_STAFF_CARD:
      getTextByPath(texts, "studentCard.teacherInviteNotStaff") ||
      "ניתן לשלוח הזמנה רק מכרטיס איש צוות",
    NOT_FOUND:
      getTextByPath(texts, "common.notFound") || "לא נמצא",
    EMAIL_SEND_FAILED:
      getTextByPath(texts, "studentCard.teacherInviteError") ||
      "שליחת ההזמנה נכשלה — נסו שוב",
    RATE_LIMITED:
      getTextByPath(texts, "studentCard.teacherInviteRateLimited") ||
      "נשלחו יותר מדי הזמנות — נסו שוב בעוד מספר דקות",
    INVITE_UNAVAILABLE:
      getTextByPath(texts, "studentCard.teacherInviteError") ||
      "שליחת ההזמנה נכשלה — נסו שוב",
    UNAUTHORIZED:
      getTextByPath(texts, "studentCard.teacherInviteUnauthorized") ||
      "יש להתחבר מחדש",
    FORBIDDEN:
      getTextByPath(texts, "studentCard.teacherInviteForbidden") ||
      "אין הרשאה לשלוח הזמנה",
    SERVER_UNAVAILABLE:
      getTextByPath(texts, "studentCard.teacherInviteError") ||
      "שליחת ההזמנה נכשלה — נסו שוב",
  };
  return map[code ?? "INVITE_UNAVAILABLE"];
}

export function TeacherInviteButton({
  studentId,
  teacherName,
  email,
  iconOnly = false,
  variant = "icon",
  className,
}: TeacherInviteButtonProps) {
  const { texts } = useSiteText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const trimmedEmail = (email ?? "").trim();
  const hasEmail = EMAIL_RE.test(trimmedEmail);
  const canInvite = canInviteInstitutionTeachers(getUser());

  if (!canInvite) {
    return null;
  }

  async function handleSend() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await sendTeacherInvite(studentId);
      if (result.ok) {
        setSuccess(
          result.message ||
            getTextByPath(texts, "studentCard.teacherInviteSuccess") ||
            "ההזמנה נשלחה בהצלחה"
        );
        return;
      }
      setError(errorMessage(texts, result.error));
    } finally {
      setBusy(false);
    }
  }

  function openDialog() {
    if (!hasEmail) {
      setError(
        getTextByPath(texts, "studentCard.teacherInviteNoEmail") ||
          "יש להוסיף כתובת מייל בכרטיס לפני שליחת הזמנה"
      );
      setSuccess(null);
      setOpen(true);
      return;
    }
    setError(null);
    setSuccess(null);
    setOpen(true);
  }

  const trigger =
    variant === "button" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={openDialog}
      >
        <Mail className="h-4 w-4" />
        <EditableText path="studentCard.teacherInviteSend" />
      </Button>
    ) : (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`h-9 w-9 shrink-0 ${className ?? ""}`}
        aria-label="שליחת הזמנה לכניסה"
        title="שליחת הזמנה לכניסה"
        onClick={openDialog}
      >
        <Mail className="h-4 w-4" />
      </Button>
    );

  return (
    <>
      {iconOnly ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={`h-9 w-9 shrink-0 ${className ?? ""}`}
          aria-label="שליחת הזמנה לכניסה"
          title="שליחת הזמנה לכניסה"
          onClick={openDialog}
        >
          <Mail className="h-4 w-4" />
        </Button>
      ) : (
        trigger
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) {
            setError(null);
            setSuccess(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="studentCard.teacherInviteTitle" as="span" />
            </DialogTitle>
            <DialogDescription>
              {teacherName.trim() || trimmedEmail}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1 text-sm text-ink">
            {hasEmail ? (
              <p>
                <EditableText path="studentCard.teacherInviteDescription" />
                <br />
                <span className="font-medium text-pink">{trimmedEmail}</span>
              </p>
            ) : (
              <p className="text-destructive">
                <EditableText path="studentCard.teacherInviteNoEmail" />
              </p>
            )}
            <p className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <EditableText path="auth.inviteAccessNotice" as="span" />
            </p>
            {error && <p className="text-destructive">{error}</p>}
            {success && <p className="font-medium text-brand-700">{success}</p>}
          </div>

          <DialogFooter>
            {success ? (
              <Button type="button" onClick={() => setOpen(false)}>
                <EditableText path="studentCard.teacherInviteClose" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  disabled={busy || !hasEmail}
                  onClick={() => void handleSend()}
                >
                  {busy ? (
                    <EditableText path="studentCard.teacherInviteBusy" />
                  ) : (
                    <EditableText path="studentCard.teacherInviteConfirm" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  <EditableText path="wizard.cancelButton" />
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
