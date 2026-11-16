"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getViewRecipientLabel,
  getViewRecipientRoles,
  type ViewFormId,
  type ViewRecipient,
  type ViewRecipientRole,
} from "@/lib/form-view-request";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StaffEmailOption {
  name: string;
  email: string;
}

interface SendForViewingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sending: boolean;
  formId: ViewFormId;
  parentEmails?: { father?: string; mother?: string };
  homeroomEmail?: string;
  principalEmail?: string;
  staffOptions?: StaffEmailOption[];
  onSend: (recipients: Array<{ email: string; role: ViewRecipientRole }>) => Promise<void>;
}

interface RecipientRowState {
  role: ViewRecipientRole;
  email: string;
  enabled: boolean;
}

export function SendForViewingDialog({
  open,
  onOpenChange,
  sending,
  formId,
  parentEmails = {},
  homeroomEmail = "",
  principalEmail = "",
  staffOptions = [],
  onSend,
}: SendForViewingDialogProps) {
  const roles = useMemo(() => getViewRecipientRoles(formId), [formId]);
  const [rows, setRows] = useState<RecipientRowState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const optionsWithEmail = useMemo(
    () => staffOptions.filter((option) => EMAIL_RE.test(option.email.trim())),
    [staffOptions]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    const newRows: RecipientRowState[] = [];

    for (const role of roles) {
      let email = "";
      let enabled = false;

      if (role === "parent") {
        const fatherEmail = parentEmails.father?.trim() ?? "";
        const motherEmail = parentEmails.mother?.trim() ?? "";
        if (fatherEmail && motherEmail && fatherEmail !== motherEmail) {
          email = `${fatherEmail}, ${motherEmail}`;
        } else {
          email = fatherEmail || motherEmail;
        }
        enabled = Boolean(email);
      } else if (role === "homeroom") {
        email = homeroomEmail.trim();
        enabled = Boolean(email);
      } else if (role === "principal") {
        email = principalEmail.trim();
        enabled = Boolean(email);
      }

      newRows.push({ role, email, enabled });
    }

    setRows(newRows);
  }, [open, roles, parentEmails, homeroomEmail, principalEmail]);

  function updateRow(role: ViewRecipientRole, patch: Partial<Omit<RecipientRowState, "role">>) {
    setRows((current) =>
      current.map((row) =>
        row.role === role ? { ...row, ...patch } : row
      )
    );
    setError(null);
  }

  async function submit() {
    const enabledRows = rows.filter((row) => row.enabled);
    if (enabledRows.length === 0) {
      setError("יש לבחור לפחות נמען אחד");
      return;
    }

    const recipients: Array<{ email: string; role: ViewRecipientRole }> = [];
    for (const row of enabledRows) {
      const emails = row.email
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e));
      
      if (emails.length === 0) {
        setError(`כתובת מייל לא תקינה עבור ${getViewRecipientLabel(row.role)}`);
        return;
      }

      for (const email of emails) {
        recipients.push({ email, role: row.role });
      }
    }

    if (recipients.length === 0) {
      setError("לא נמצאו כתובות מייל תקינות");
      return;
    }

    setError(null);
    await onSend(recipients);
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
          <DialogTitle>שליחה לצפייה</DialogTitle>
          <DialogDescription>
            יישלח קישור לצפייה בלבד (ללא חתימה). ניתן לבחור מספר נמענים.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div
              key={row.role}
              className="rounded-xl border border-border p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id={`view-recipient-${row.role}`}
                  checked={row.enabled}
                  onCheckedChange={(checked) =>
                    updateRow(row.role, { enabled: Boolean(checked) })
                  }
                />
                <Label
                  htmlFor={`view-recipient-${row.role}`}
                  className="text-sm font-semibold"
                >
                  {getViewRecipientLabel(row.role)}
                </Label>
              </div>
              {row.enabled && (
                <div className="flex flex-col gap-1">
                  {(row.role === "homeroom" || row.role === "principal") &&
                  optionsWithEmail.length > 0 ? (
                    <select
                      value={
                        optionsWithEmail.find(
                          (o) =>
                            o.email.trim().toLowerCase() ===
                            row.email.trim().toLowerCase()
                        )?.email ?? ""
                      }
                      onChange={(event) => {
                        const nextEmail = event.target.value;
                        if (nextEmail) {
                          updateRow(row.role, { email: nextEmail });
                        }
                      }}
                      className="h-10 rounded-md border-2 border-brand-200 bg-white px-3 text-sm mb-1"
                    >
                      <option value="">— בחרו או הזינו ידנית —</option>
                      {optionsWithEmail.map((option) => (
                        <option key={option.email} value={option.email}>
                          {option.name} ({option.email})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Input
                    type="text"
                    dir="ltr"
                    value={row.email}
                    onChange={(event) =>
                      updateRow(row.role, { email: event.target.value })
                    }
                    placeholder={
                      row.role === "parent"
                        ? "parent1@email.com, parent2@email.com"
                        : "email@example.com"
                    }
                  />
                  {row.role === "parent" && (
                    <p className="text-xs text-muted-foreground">
                      ניתן להזין מספר כתובות מופרדות בפסיק
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" disabled={sending} onClick={() => void submit()}>
            <Eye className="h-4 w-4" />
            {sending ? "שולח..." : "שליחה לצפייה"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
