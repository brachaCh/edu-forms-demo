"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUserWithOtp, requestLoginOtp } from "@/lib/mock-store";
import { postLoginHref } from "@/lib/auth-navigation";
import { EditableText } from "@/components/editable/EditableText";
import type { UserProfile } from "@/lib/supabase/types";

const otpEmailSchema = z.object({
  email: z.string().email("כתובת מייל לא תקינה"),
});

const otpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "יש להזין קוד בן 6 ספרות"),
});

type OtpEmailValues = z.infer<typeof otpEmailSchema>;
type OtpCodeValues = z.infer<typeof otpCodeSchema>;

export function LoginForm() {
  const router = useRouter();
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);

  const otpEmailForm = useForm<OtpEmailValues>({
    resolver: zodResolver(otpEmailSchema),
    defaultValues: { email: "" },
  });
  const otpCodeForm = useForm<OtpCodeValues>({
    resolver: zodResolver(otpCodeSchema),
    defaultValues: { code: "" },
  });

  async function goAfterLogin(profile: UserProfile) {
    const next =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("next");
    let isPlatformAdmin = false;
    let hasMultipleInstitutions = false;
    try {
      const response = await fetch("/api/auth/session");
      if (response.ok) {
        const data = (await response.json()) as {
          isPlatformAdmin?: boolean;
          hasMultipleInstitutions?: boolean;
        };
        isPlatformAdmin = data.isPlatformAdmin === true;
        hasMultipleInstitutions = data.hasMultipleInstitutions === true;
      }
    } catch {
      isPlatformAdmin = false;
    }

    // TZ-17: אם יש כמה מוסדות — לבורר המוסדות (אלא אם platform admin)
    if (hasMultipleInstitutions && !isPlatformAdmin) {
      // Preserve the `next` param through the picker for post-pick redirect
      const pickerUrl = next
        ? `/select-institution?next=${encodeURIComponent(next)}`
        : "/select-institution";
      router.push(pickerUrl);
      return;
    }

    router.push(postLoginHref(profile, next, { isPlatformAdmin }));
  }

  async function onOtpRequest(values: OtpEmailValues) {
    setOtpInfo(null);
    try {
      await requestLoginOtp(values.email);
      setOtpEmail(values.email.trim().toLowerCase());
      setOtpSent(true);
      otpCodeForm.reset({ code: "" });
      setOtpInfo(
        "אם קיים חשבון עם כתובת מייל זו, נשלח אליה קוד כניסה. בדקו גם את תיקיית הספאם."
      );
    } catch (error) {
      const msg =
        error instanceof Error && error.message === "RATE_LIMITED"
          ? "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות."
          : error instanceof Error && error.message === "EMAIL_SEND_FAILED"
            ? "שליחת המייל נכשלה. נסו שוב מאוחר יותר."
            : "לא ניתן לשלוח קוד כניסה כרגע. נסו שוב מאוחר יותר.";
      otpEmailForm.setError("root", { message: msg });
    }
  }

  async function onOtpVerify(values: OtpCodeValues) {
    setOtpInfo(null);
    try {
      const profile = await loginUserWithOtp(otpEmail, values.code);
      goAfterLogin(profile);
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "INVALID_CREDENTIALS";
      const message =
        code === "OTP_EXPIRED"
          ? "הקוד פג תוקף. בקשו קוד חדש."
          : code === "OTP_LOCKED"
            ? "הקוד נחסם אחרי יותר מדי ניסיונות. בקשו קוד חדש."
            : code === "OTP_UNAVAILABLE" || code === "LOGIN_FAILED"
              ? "שגיאת שרת בכניסה. בקשו קוד חדש ונסו שוב."
              : "הקוד שגוי. בדקו את המייל ונסו שוב.";
      otpCodeForm.setError("root", { message });
    }
  }

  if (!otpSent) {
    return (
      <form
        onSubmit={otpEmailForm.handleSubmit(onOtpRequest)}
        className="flex flex-col gap-5"
      >
        <p className="text-sm text-muted-foreground">
          <EditableText path="auth.otpSubtitle" as="span" />
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp_email" className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-brand-500" />
            <EditableText path="auth.emailLabel" />
          </Label>
          <Input
            id="otp_email"
            type="email"
            autoComplete="email"
            dir="ltr"
            className="text-right"
            {...otpEmailForm.register("email")}
          />
          {otpEmailForm.formState.errors.email && (
            <p className="text-xs font-medium text-destructive">
              {otpEmailForm.formState.errors.email.message}
            </p>
          )}
        </div>

        {otpEmailForm.formState.errors.root && (
          <p className="text-xs font-medium text-destructive">
            {otpEmailForm.formState.errors.root.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={otpEmailForm.formState.isSubmitting}
          className="mt-2"
        >
          <EditableText path="auth.otpSendButton" />
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={otpCodeForm.handleSubmit(onOtpVerify)}
      className="flex flex-col gap-5"
    >
      {otpInfo && (
        <p className="rounded-md bg-muted/60 px-4 py-3 text-sm text-foreground">
          {otpInfo}
        </p>
      )}
      <p className="text-sm text-muted-foreground" dir="ltr">
        {otpEmail}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="otp_code" className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.otpCodeLabel" />
        </Label>
        <Input
          id="otp_code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          className="text-center tracking-[0.35em]"
          {...otpCodeForm.register("code")}
        />
        {otpCodeForm.formState.errors.code && (
          <p className="text-xs font-medium text-destructive">
            {otpCodeForm.formState.errors.code.message}
          </p>
        )}
      </div>

      {otpCodeForm.formState.errors.root && (
        <p className="text-xs font-medium text-destructive">
          {otpCodeForm.formState.errors.root.message}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={otpCodeForm.formState.isSubmitting}
        className="mt-2"
      >
        <EditableText path="auth.otpVerifyButton" />
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="flex flex-col gap-2 text-center text-sm">
        <button
          type="button"
          className="font-medium text-brand-600 hover:opacity-80 disabled:opacity-50"
          disabled={otpEmailForm.formState.isSubmitting}
          onClick={() => {
            void (async () => {
              setOtpInfo(null);
              otpCodeForm.clearErrors("root");
              try {
                await requestLoginOtp(otpEmail);
                otpCodeForm.reset({ code: "" });
                setOtpInfo(
                  "נשלח קוד חדש למייל (אם החשבון קיים). בדקו גם את תיקיית הספאם."
                );
              } catch (error) {
                const message =
                  error instanceof Error && error.message === "RATE_LIMITED"
                    ? "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות."
                    : "לא ניתן לשלוח קוד כניסה כרגע. נסו שוב מאוחר יותר.";
                otpCodeForm.setError("root", { message });
              }
            })();
          }}
        >
          <EditableText path="auth.otpResend" as="span" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            setOtpSent(false);
            setOtpInfo(null);
            otpCodeForm.reset({ code: "" });
          }}
        >
          <EditableText path="auth.otpChangeEmail" as="span" />
        </button>
      </div>
    </form>
  );
}
