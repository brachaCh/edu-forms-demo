"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Mail, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { SignatureAssignment } from "@/lib/form-signature-request";
import { collectSignatureAssignments } from "@/lib/simplesign/signer-email-rows";
import { sameParentSignerInboxWarning } from "@/lib/waiver-signer-status";

interface SignatureFieldOption {
  key: string;
  label: string;
}

interface SignatureRequestInitialRow {
  fieldKey: string;
  email?: string;
  /** When false, an empty email is skipped on send (TZ-30 single parent). */
  required?: boolean;
}

interface SignatureRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: SignatureFieldOption[];
  sending: boolean;
  onSend: (assignments: SignatureAssignment[]) => Promise<void>;
  /** בכניסה חופשית — כל השורות ננעלות למייל הסשן */
  lockedEmail?: string | null;
  /** שורות ברירת מחדל בפתיחה (למשל שורה לכל חתימת הורה) */
  initialRows?: SignatureRequestInitialRow[] | null;
  /** טקסט הסבר חלופי מעל השורות */
  description?: string | null;
  /** שדה החתימה קבוע מראש — מציגים רק מייל (למשל SimpleSign עם הורה א'+ב') */
  hideFieldSelect?: boolean;
  /** אפשר להוסיף כתובת נוספת לאותו חותם */
  allowExtraEmails?: boolean;
  /** אזהרה אחרי יצירת שליחה — למשל כשהמייל לא נשלח */
  sendWarning?: string | null;
  /** קישורי חתימה להעתקה כשהמייל לא נשלח */
  signingLinks?: Array<{ fieldKey: string; label: string; url: string }>;
}

interface SignatureRow {
  id: string;
  email: string;
  fieldKey: string;
  required: boolean;
}

/** תואם ל־MAX_ASSIGNMENTS ב־form-signature Edge Function */
const MAX_ROWS = 10;

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pickDefaultFieldKey(
  fields: SignatureFieldOption[],
  usedKeys: Set<string>
): string {
  const unused = fields.find((field) => !usedKeys.has(field.key));
  return unused?.key ?? fields[0]?.key ?? "";
}

export function SignatureRequestDialog({
  open,
  onOpenChange,
  fields,
  sending,
  onSend,
  lockedEmail = null,
  initialRows = null,
  description = null,
  hideFieldSelect = false,
  allowExtraEmails = true,
  sendWarning = null,
  signingLinks = [],
}: SignatureRequestDialogProps) {
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const wasOpen = useRef(false);
  const labels = useMemo(
    () => new Map(fields.map((field) => [field.key, field.label])),
    [fields]
  );
  const fieldsKey = useMemo(
    () => fields.map((field) => field.key).join("\0"),
    [fields]
  );
  const initialRowsKey = useMemo(
    () =>
      (initialRows ?? [])
        .map(
          (row) =>
            `${row.fieldKey}\0${row.email ?? ""}\0${row.required === false ? "0" : "1"}`
        )
        .join("|"),
    [initialRows]
  );
  const lockedEmailNormalized = (lockedEmail ?? "").trim().toLowerCase();
  const isEmailLocked = Boolean(lockedEmailNormalized);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setError(null);
    setCopiedUrl(null);
    const keys = fieldsKey ? fieldsKey.split("\0").filter(Boolean) : [];
    const fieldKeySet = new Set(keys);
    if (isEmailLocked && keys.length > 0) {
      // בכניסה חופשית — שורה לכל שדה חתימה, כולם למייל הסשן
      setRows(
        keys.map((fieldKey) => ({
          id: newRowId(),
          email: lockedEmailNormalized,
          fieldKey,
          required: true,
        }))
      );
      return;
    }
    const presetRows = (initialRows ?? []).filter((row) =>
      fieldKeySet.has(row.fieldKey)
    );
    if (presetRows.length > 0) {
      setRows(
        presetRows.map((row) => ({
          id: newRowId(),
          email: (row.email ?? "").trim(),
          fieldKey: row.fieldKey,
          required: row.required !== false,
        }))
      );
      return;
    }
    const firstKey = keys[0] ?? "";
    setRows([
      {
        id: newRowId(),
        email: "",
        fieldKey: firstKey,
        required: false,
      },
    ]);
  }, [
    open,
    fieldsKey,
    initialRowsKey,
    isEmailLocked,
    lockedEmailNormalized,
    initialRows,
  ]);

  function updateRow(
    index: number,
    patch: Partial<Pick<SignatureRow, "email" | "fieldKey">>
  ) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if (isEmailLocked) next.email = lockedEmailNormalized;
        return next;
      })
    );
    setError(null);
  }

  function addRow() {
    if (isEmailLocked) return;
    setRows((current) => {
      if (current.length >= MAX_ROWS || fields.length === 0) return current;
      const used = new Set(current.map((row) => row.fieldKey));
      return [
        ...current,
        {
          id: newRowId(),
          email: "",
          fieldKey: pickDefaultFieldKey(fields, used),
          required: false,
        },
      ];
    });
    setError(null);
  }

  async function submit() {
    const collected = collectSignatureAssignments(
      rows.map((row) => ({
        email: row.email,
        fieldKey: row.fieldKey,
        fieldLabel: labels.get(row.fieldKey) ?? "",
        required: row.required,
      })),
      { lockedEmail: lockedEmailNormalized || null }
    );
    if (!collected.ok) {
      setError(collected.error);
      return;
    }
    setError(null);
    try {
      await onSend(collected.assignments);
    } catch (err) {
      const raw = err instanceof Error ? err.message.trim() : "";
      setError(raw || "שליחה לחתימה נכשלה");
    }
  }

  const canAdd =
    allowExtraEmails &&
    !isEmailLocked &&
    fields.length > 0 &&
    rows.length < MAX_ROWS;
  const sameInboxWarning = sameParentSignerInboxWarning(rows);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>שליחת הטופס לחתימה</DialogTitle>
          <DialogDescription>
            {description?.trim()
              ? description
              : "לכל חותם יישלח קישור אישי. אפשר לערוך את כתובת המייל או להוסיף כתובת נוספת לאותו חותם."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
          {rows.map((row, index) => {
            const fieldLabel = labels.get(row.fieldKey) ?? "";
            const lockField = hideFieldSelect && row.required;
            return (
              <div
                key={row.id}
                className={
                  lockField
                    ? "rounded-xl border border-border p-3"
                    : "grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
                }
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`signature-email-${row.id}`}>
                    {lockField && fieldLabel ? fieldLabel : "כתובת מייל"}
                  </Label>
                  <Input
                    id={`signature-email-${row.id}`}
                    type="email"
                    dir="ltr"
                    value={row.email}
                    readOnly={isEmailLocked}
                    onChange={(event) =>
                      updateRow(index, { email: event.target.value })
                    }
                    placeholder="name@example.com"
                  />
                </div>
                {!lockField ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`signature-field-${row.id}`}>
                        שדה חתימה
                      </Label>
                      <select
                        id={`signature-field-${row.id}`}
                        value={row.fieldKey}
                        disabled={isEmailLocked || row.required}
                        onChange={(event) =>
                          updateRow(index, { fieldKey: event.target.value })
                        }
                        className="h-10 rounded-md border-2 border-brand-200 bg-white px-3 text-sm disabled:opacity-70"
                      >
                        {fields.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="self-end"
                      disabled={isEmailLocked || row.required}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                      aria-label="הסרת נמען"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={addRow}
          >
            <Plus className="h-4 w-4" />
            הוספת כתובת מייל
          </Button>
        ) : null}

        {sameInboxWarning ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {sameInboxWarning}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        {sendWarning ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p className="font-medium">{sendWarning}</p>
            {signingLinks.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2">
                {signingLinks.map((link) => (
                  <li
                    key={`${link.fieldKey}-${link.url}`}
                    className="flex flex-col gap-1 rounded-md border border-amber-100 bg-white/70 p-2"
                  >
                    <span className="font-semibold">{link.label}</span>
                    <div className="flex items-center gap-2">
                      <code
                        dir="ltr"
                        className="min-w-0 flex-1 truncate text-xs"
                      >
                        {link.url}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(link.url)
                            .then(() => setCopiedUrl(link.url))
                            .catch(() => setCopiedUrl(null));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        {copiedUrl === link.url ? "הועתק" : "העתקת קישור"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" disabled={sending} onClick={() => void submit()}>
            <Mail className="h-4 w-4" />
            {sending ? "שולח..." : "שליחה לחתימה"}
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
