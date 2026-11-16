"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { invokeContact, type ContactRecipient } from "@/lib/invokeContact";
import { cn } from "@/lib/utils";

interface ContactButtonProps {
  variant?: "outline" | "link" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  /** ברירת מחדל: demo@example.com; coming-soon: שני מיילים */
  recipient?: ContactRecipient;
  defaultSubject?: string;
  defaultMessage?: string;
  labelPath?: string;
  onBeforeOpen?: () => Promise<boolean>;
  /** אחרי שליחה אמיתית: סוגר את החלון ומעביר את ההצלחה לדף */
  onSent?: () => void;
}

export function ContactButton({
  variant = "outline",
  size = "sm",
  className,
  recipient = "default",
  defaultSubject = "",
  defaultMessage = "",
  labelPath = "dashboard.contactLink",
  onBeforeOpen,
  onSent,
}: ContactButtonProps) {
  const { texts } = useSiteText();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  /** Honeypot — bots fill this; humans leave empty */
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
    setWebsite("");
    setFeedback(null);
    setErrorDetail(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setFeedback(null);
    setErrorDetail(null);

    try {
      const result = await invokeContact({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        website,
        recipient,
      });

      if (!result.ok) {
        setFeedback("error");
        setErrorDetail(result.error ?? null);
        return;
      }

      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setWebsite("");
      if (onSent) {
        setOpen(false);
        window.setTimeout(() => onSent(), 0);
        return;
      }
      setFeedback("success");
    } catch {
      setFeedback("error");
    } finally {
      setSending(false);
    }
  }

  async function handleTriggerClick() {
    if (onBeforeOpen) {
      const ok = await onBeforeOpen();
      if (!ok) return;
    }
    if (defaultSubject) setSubject(defaultSubject);
    if (defaultMessage) setMessage(defaultMessage);
    setOpen(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetForm();
        }
      }}
    >
      {variant === "link" ? (
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:opacity-80",
            className
          )}
          onClick={() => void handleTriggerClick()}
        >
          <Mail className="h-4 w-4" />
          <EditableText path={labelPath} as="span" />
        </button>
      ) : (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            className={className}
            onClick={(e) => {
              if (onBeforeOpen) {
                e.preventDefault();
                void handleTriggerClick();
              }
            }}
          >
            <Mail className="h-4 w-4" />
            <EditableText path={labelPath} as="span" />
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <EditableText path="contact.title" as="span" />
          </DialogTitle>
          <DialogDescription>
            <EditableText path="contact.subtitle" as="span" />
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Honeypot — hidden from users, bots often fill it */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
          >
            <label htmlFor="contact-leave-blank">Leave blank</label>
            <input
              id="contact-leave-blank"
              name="leave_blank"
              type="text"
              tabIndex={-1}
              autoComplete="new-password"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-name">
              <EditableText path="contact.nameLabel" as="span" />
            </Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-email">
              <EditableText path="contact.emailLabel" as="span" />
            </Label>
            <Input
              id="contact-email"
              type="email"
              dir="ltr"
              className="text-right"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-subject">
              <EditableText path="contact.subjectLabel" as="span" />
            </Label>
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-message">
              <EditableText path="contact.messageLabel" as="span" />
            </Label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {feedback === "success" && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
              {getTextByPath(texts, "contact.success")}
            </p>
          )}
          {feedback === "error" && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
              {errorDetail || getTextByPath(texts, "contact.error")}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={sending} size="lg">
              <Send className="h-4 w-4" />
              {sending
                ? getTextByPath(texts, "contact.sending")
                : getTextByPath(texts, "contact.sendButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
