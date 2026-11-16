"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
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

export interface StaffFillRecipientOption {
  name: string;
  email: string;
}

interface HomeroomFillRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sending: boolean;
  defaultEmail?: string;
  teacherName?: string;
  /** אנשי צוות לבחירה מהירה (שם + מייל) */
  staffOptions?: StaffFillRecipientOption[];
  onSend: (email: string, note: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HomeroomFillRequestDialog({
  open,
  onOpenChange,
  sending,
  defaultEmail = "",
  teacherName = "",
  staffOptions = [],
  onSend,
}: HomeroomFillRequestDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState("");

  const optionsWithEmail = useMemo(
    () =>
      staffOptions.filter((option) => EMAIL_RE.test(option.email.trim())),
    [staffOptions]
  );

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail);
    setNote("");
    setError(null);
    const match = optionsWithEmail.find(
      (option) =>
        option.email.trim().toLowerCase() === defaultEmail.trim().toLowerCase()
    );
    setSelectedStaff(match?.email ?? "");
  }, [open, defaultEmail, optionsWithEmail]);

  async function submit() {
    const next = email.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) {
      setError("יש להזין כתובת מייל תקינה של איש הצוות");
      return;
    }
    setError(null);
    await onSend(next, note.trim());
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
          <DialogTitle>שליחה למילוי</DialogTitle>
          <DialogDescription>
            יישלח קישור אישי למילוי הטופס
            {teacherName ? ` עבור ${teacherName}` : ""}. התשובות יישמרו ישירות
            בתיק התלמיד ויופיעו בטופס אוטומטית — בלי צורך בריענון.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {optionsWithEmail.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="staff-fill-pick">איש צוות</Label>
              <select
                id="staff-fill-pick"
                value={selectedStaff}
                onChange={(event) => {
                  const nextEmail = event.target.value;
                  setSelectedStaff(nextEmail);
                  if (nextEmail) {
                    setEmail(nextEmail);
                    setError(null);
                  }
                }}
                className="h-10 rounded-md border-2 border-brand-200 bg-white px-3 text-sm"
              >
                <option value="">— בחרו או הזינו מייל ידנית —</option>
                {optionsWithEmail.map((option) => (
                  <option key={`${option.name}-${option.email}`} value={option.email}>
                    {option.name}
                    {option.email ? ` (${option.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="homeroom-fill-email">מייל איש הצוות</Label>
            <Input
              id="homeroom-fill-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSelectedStaff("");
                setError(null);
              }}
              placeholder="staff@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="homeroom-fill-note">הודעה קצרה (אופציונלי)</Label>
            <textarea
              id="homeroom-fill-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="min-h-[72px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
              placeholder="למשל: נשמח לקבל עד יום חמישי"
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" disabled={sending} onClick={() => void submit()}>
            <Mail className="h-4 w-4" />
            {sending ? "שולח..." : "שליחה למילוי"}
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
