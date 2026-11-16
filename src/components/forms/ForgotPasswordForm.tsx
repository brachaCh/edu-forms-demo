"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schema = z.object({
  email: z.string().email("כתובת מייל לא תקינה"),
});

type FormValues = z.infer<typeof schema>;

async function requestReset(email: string): Promise<{
  ok: boolean;
  status: number;
}> {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return { ok: response.ok, status: response.status };
}

function errorMessage(status: number): string {
  if (status === 429) return "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.";
  if (status === 400) return "כתובת מייל לא תקינה.";
  if (status === 502 || status === 503) {
    return "לא הצלחנו לשלוח את המייל כרגע. נסו שוב בעוד רגע.";
  }
  return "שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.";
}

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const loginEmail = (searchParams.get("email") ?? "").trim().toLowerCase();
  const fromLogin = EMAIL_RE.test(loginEmail);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(fromLogin);
  const autoSent = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: fromLogin ? loginEmail : "" },
  });

  async function sendTo(email: string) {
    setSending(true);
    try {
      const result = await requestReset(email);
      if (!result.ok) {
        setError("root", { message: errorMessage(result.status) });
        return;
      }
      setDone(true);
    } catch {
      setError("root", {
        message: "שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.",
      });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!fromLogin || autoSent.current) return;
    autoSent.current = true;
    void sendTo(loginEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLogin, loginEmail]);

  if (done) {
    return (
      <p className="rounded-md bg-muted/60 px-4 py-3 text-sm text-foreground">
        <EditableText path="auth.forgotSuccess" as="span" />
      </p>
    );
  }

  if (fromLogin) {
    return (
      <div className="flex flex-col gap-4">
        {sending ? (
          <p className="text-sm text-muted-foreground">
            <EditableText path="auth.forgotSending" as="span" />
          </p>
        ) : null}
        {errors.root ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-destructive">
              {errors.root.message}
            </p>
            <Button
              type="button"
              size="lg"
              disabled={sending}
              onClick={() => void sendTo(loginEmail)}
            >
              <EditableText path="auth.forgotSubmitButton" />
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((values) => sendTo(values.email.trim().toLowerCase()))}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot_email" className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.emailLabel" />
        </Label>
        <Input
          id="forgot_email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className="text-right"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs font-medium text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p className="text-xs font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting || sending} className="mt-2">
        <EditableText path="auth.forgotSubmitButton" />
        <ArrowLeft className="h-5 w-5" />
      </Button>
    </form>
  );
}
