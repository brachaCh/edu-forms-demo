"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, KeyRound, Lock, Mail, Phone } from "lucide-react";
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
import { EditableText } from "@/components/editable/EditableText";
import { loginUserWithOtp, requestLoginOtp } from "@/lib/mock-store";
import {
  decideTeacherInviteRegisterNext,
  teacherInviteExistingLoginHref,
} from "@/lib/teacher-invite-register-next";
import { cn } from "@/lib/utils";

type InvitePreview = {
  teacherName: string;
  email: string;
  phone: string | null;
  redirectHref: string;
  existsInOtherInstitution?: boolean;
  sessionEmailMatches?: boolean;
  acceptAction?: string;
};

type WizardStep = 1 | 2 | 3;

const detailsSchema = z.object({
  phone: z
    .string()
    .min(9, "מספר טלפון לא תקין")
    .regex(/^[\d\-+\s()]+$/u, "מספר טלפון לא תקין"),
  email: z.string().email("כתובת מייל לא תקינה"),
});

const securitySchema = z
  .object({
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirm_password: z.string().min(1, "יש לאמת את הסיסמה"),
    terms_accepted: z
      .boolean()
      .refine((value) => value, { message: "יש לאשר את תנאי השימוש" }),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirm_password"],
  });

const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "יש להזין קוד בן 6 ספרות"),
});

type DetailsValues = z.infer<typeof detailsSchema>;
type SecurityValues = z.infer<typeof securitySchema>;
type OtpValues = z.infer<typeof otpSchema>;

function inviteErrorMessage(code?: string): string {
  switch (code) {
    case "TOKEN_EXPIRED":
      return "פג תוקף הקישור. בקשו מהמוסד לשלוח הזמנה חדשה.";
    case "INVITE_USED":
      return "הקישור כבר נוצל. אם כבר נרשמתם — התחברו עם כתובת המייל.";
    case "EMAIL_EXISTS":
      return "כבר קיים חשבון עם כתובת מייל זו. התחברי דרך דף הכניסה עם אותו מייל.";
    case "EXISTING_ACCOUNT_LOGIN_REQUIRED":
      return "יש לך כבר חשבון — התחברי כדי לצרף את בית הספר החדש";
    case "SESSION_EMAIL_MISMATCH":
      return "כתובת המייל המחוברת לא תואמת להזמנה. התנתקי והתחברי עם המייל הנכון.";
    case "WEAK_PASSWORD":
      return "הסיסמה חייבת להכיל לפחות 8 תווים";
    case "INVALID_PHONE":
      return "יש להזין מספר טלפון תקין";
    case "TERMS_REQUIRED":
      return "יש לאשר את תנאי השימוש";
    case "OTP_UNAVAILABLE":
      return "לא ניתן לשלוח קוד אימות כרגע. נסו שוב מאוחר יותר.";
    case "REGISTER_FAILED":
      return "לא ניתן להשלים את הרישום כרגע. נסו שוב או פנו למוסד.";
    case "SERVER_UNAVAILABLE":
      return "השרת אינו זמין כרגע. נסו שוב בעוד מספר דקות.";
    default:
      return "לא ניתן להמשיך עם הקישור. בקשו הזמנה חדשה מהמוסד או התחברו עם המייל.";
  }
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { n: 1 as const, label: "auth.inviteStep1Label" },
    { n: 2 as const, label: "auth.inviteStep2Label" },
    { n: 3 as const, label: "auth.inviteStep3Label" },
  ];

  return (
    <ol className="mb-6 flex items-center justify-between gap-2">
      {steps.map(({ n, label }) => (
        <li
          key={n}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 text-center text-xs font-medium",
            current >= n ? "text-brand-700" : "text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm",
              current >= n
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-border bg-white"
            )}
          >
            {n}
          </span>
          <EditableText path={label} as="span" />
        </li>
      ))}
    </ol>
  );
}

export function TeacherInviteRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(
    () => (searchParams.get("token") ?? "").trim(),
    [searchParams]
  );

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [accessNoticeOpen, setAccessNoticeOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [redirectHref, setRedirectHref] = useState("/personal-area");
  const [otpPhase, setOtpPhase] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [resumedExistingAccount, setResumedExistingAccount] = useState(false);
  const [autoAccepting, setAutoAccepting] = useState(false);

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { phone: "", email: "" },
  });

  const securityForm = useForm<SecurityValues>({
    resolver: zodResolver(securitySchema),
    defaultValues: {
      password: "",
      confirm_password: "",
      terms_accepted: false,
    },
  });

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    if (!token) {
      setLoadError(inviteErrorMessage("INVALID_TOKEN"));
      setLoadingPreview(false);
      return;
    }

    let cancelled = false;
    async function loadPreview() {
      setLoadingPreview(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/auth/teacher-invite?token=${encodeURIComponent(token)}`
        );
        const data = (await response.json().catch(() => null)) as
          | (InvitePreview & { ok?: boolean; error?: string })
          | null;

        if (cancelled) return;

        if (response.ok && data?.ok) {
          setPreview({
            teacherName: data.teacherName,
            email: data.email,
            phone: data.phone,
            redirectHref: data.redirectHref,
            existsInOtherInstitution: data.existsInOtherInstitution,
            sessionEmailMatches: data.sessionEmailMatches,
            acceptAction: data.acceptAction,
          });
          setRedirectHref(data.redirectHref);
          detailsForm.reset({
            phone: data.phone ?? "",
            email: data.email,
          });

          if (data.acceptAction === "session_mismatch") {
            setLoadError(inviteErrorMessage("SESSION_EMAIL_MISMATCH"));
            return;
          }

          if (data.existsInOtherInstitution && data.sessionEmailMatches) {
            setAutoAccepting(true);
            try {
              const acceptResponse = await fetch("/api/auth/teacher-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token,
                  existingUserAccept: true,
                }),
              });
              const acceptData = (await acceptResponse.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
                redirectHref?: string;
                multiInstitution?: boolean;
              } | null;

              if (cancelled) return;

              if (acceptResponse.ok && acceptData?.ok) {
                router.push(acceptData.redirectHref ?? "/select-institution");
                return;
              }

              if (acceptData?.error === "SESSION_EMAIL_MISMATCH") {
                setLoadError(inviteErrorMessage(acceptData.error));
                setAutoAccepting(false);
                return;
              }

              if (acceptData?.error === "EXISTING_ACCOUNT_LOGIN_REQUIRED") {
                setLoginRequired(true);
                setAutoAccepting(false);
                return;
              }

              setAutoAccepting(false);
              setLoadError(inviteErrorMessage(acceptData?.error));
            } catch {
              if (!cancelled) {
                setAutoAccepting(false);
                setLoadError("שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.");
              }
            }
            return;
          }

          if (data.existsInOtherInstitution) {
            setLoginRequired(true);
            return;
          }

          setAccessNoticeOpen(true);
          return;
        }

        setLoadError(inviteErrorMessage(data?.error));
      } catch {
        if (!cancelled) {
          setLoadError("שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token, detailsForm, router]);

  async function onDetailsSubmit(values: DetailsValues) {
    setStep(2);
    securityForm.clearErrors("root");
    void values;
  }

  async function onSecuritySubmit(values: SecurityValues) {
    if (!token || !preview) return;

    setRegistering(true);
    securityForm.clearErrors("root");

    try {
      const response = await fetch("/api/auth/teacher-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: values.password,
          phone: detailsForm.getValues("phone").trim(),
          terms_accepted: values.terms_accepted,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        redirectHref?: string;
        needsOtp?: boolean;
        multiInstitution?: boolean;
        resumed?: boolean;
      } | null;

      if (response.ok && data?.ok) {
        const next = decideTeacherInviteRegisterNext(data);
        if (next?.action === "otp") {
          if (next.redirectHref) setRedirectHref(next.redirectHref);
          setOtpPhase(true);
          otpForm.reset({ code: "" });
          return;
        }
        if (next?.action === "redirect") {
          router.push(next.href);
          return;
        }
        if (next?.action === "existing_login") {
          setRedirectHref(next.href);
          setResumedExistingAccount(true);
          setLoginRequired(true);
          return;
        }
        return;
      }

      if (data?.error === "EXISTING_ACCOUNT_LOGIN_REQUIRED") {
        setLoginRequired(true);
        securityForm.setError("root", {
          message: inviteErrorMessage(data.error),
        });
        return;
      }

      securityForm.setError("root", {
        message: inviteErrorMessage(data?.error),
      });
    } catch {
      securityForm.setError("root", {
        message: "שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.",
      });
    } finally {
      setRegistering(false);
    }
  }

  async function onResendOtp() {
    if (!preview) return;
    setResendingOtp(true);
    otpForm.clearErrors("root");
    setOtpInfo(null);
    try {
      await requestLoginOtp(preview.email);
      setOtpInfo("קוד חדש נשלח לכתובת המייל.");
    } catch {
      otpForm.setError("root", {
        message: "לא ניתן לשלוח קוד חדש כרגע. נסו שוב מאוחר יותר.",
      });
    } finally {
      setResendingOtp(false);
    }
  }

  async function onOtpSubmit(values: OtpValues) {
    if (!preview) return;

    otpForm.clearErrors("root");
    setOtpInfo(null);
    try {
      await loginUserWithOtp(preview.email, values.code);
      setStep(3);
      router.push(redirectHref);
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "INVALID_CREDENTIALS";
      const message =
        code === "OTP_EXPIRED"
          ? "הקוד פג תוקף. חזרו לשלב הקודם ושלחו קוד חדש."
          : code === "OTP_LOCKED"
            ? "הקוד נחסם אחרי יותר מדי ניסיונות. חזרו לשלב הקודם."
            : "הקוד שגוי. בדקו את המייל ונסו שוב.";
      otpForm.setError("root", { message });
    }
  }

  if (!token) {
    return (
      <p className="text-sm font-medium text-destructive">
        <EditableText path="auth.inviteMissingToken" as="span" />
      </p>
    );
  }

  if (loadingPreview || autoAccepting) {
    return (
      <p className="text-sm text-muted-foreground">
        <EditableText path="auth.inviteLoading" as="span" />
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-destructive">{loadError}</p>
        <Link
          href="/login"
          className="text-sm font-medium text-brand-600 hover:opacity-80"
        >
          <EditableText path="auth.backToLogin" />
        </Link>
      </div>
    );
  }

  if (!preview) return null;

  if (loginRequired || preview.existsInOtherInstitution) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink">
          <EditableText path="auth.inviteExistingLoginTitle" as="span" />
        </p>
        <p className="text-sm text-muted-foreground">
          <EditableText
            path={
              resumedExistingAccount
                ? "auth.inviteResumedLoginHint"
                : "auth.inviteExistingLoginHint"
            }
            as="span"
          />
        </p>
        <Link
          href={teacherInviteExistingLoginHref({
            token,
            nextHref: redirectHref,
            resumed: resumedExistingAccount,
          })}
          className="text-sm font-medium text-brand-600 hover:opacity-80"
        >
          <EditableText path="auth.inviteExistingLoginButton" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={accessNoticeOpen} onOpenChange={setAccessNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="auth.inviteAccessNoticeTitle" as="span" />
            </DialogTitle>
            <DialogDescription>
              <EditableText path="auth.inviteAccessNotice" as="span" />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setAccessNoticeOpen(false)}>
              <EditableText path="auth.inviteAccessNoticeClose" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StepIndicator current={step} />

      {preview.teacherName ? (
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          שלום {preview.teacherName}, הוזמנת להצטרף לפרוטוקל.
        </div>
      ) : null}

      {step === 1 ? (
        <form
          onSubmit={detailsForm.handleSubmit(onDetailsSubmit)}
          className="flex flex-col gap-5"
        >
          <p className="text-sm text-muted-foreground">
            <EditableText path="auth.inviteStep1Hint" as="span" />
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite_phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-brand-500" />
              <EditableText path="auth.phoneLabel" />
            </Label>
            <Input
              id="invite_phone"
              autoComplete="tel"
              dir="ltr"
              className="text-right"
              {...detailsForm.register("phone")}
            />
            {detailsForm.formState.errors.phone && (
              <p className="text-xs font-medium text-destructive">
                {detailsForm.formState.errors.phone.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite_email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-500" />
              <EditableText path="auth.emailLabel" />
            </Label>
            <Input
              id="invite_email"
              type="email"
              readOnly
              dir="ltr"
              className="text-right bg-muted/40"
              {...detailsForm.register("email")}
            />
          </div>

          <Button type="submit" size="lg" className="mt-2">
            <EditableText path="auth.inviteContinueButton" />
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </form>
      ) : null}

      {step === 2 && !otpPhase ? (
        <form
          onSubmit={securityForm.handleSubmit(onSecuritySubmit)}
          className="flex flex-col gap-5"
        >
          <p className="text-sm text-muted-foreground">
            <EditableText path="auth.inviteStep2Hint" as="span" />
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite_password" className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-500" />
              <EditableText path="auth.passwordLabel" />
            </Label>
            <Input
              id="invite_password"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="text-right"
              {...securityForm.register("password")}
            />
            {securityForm.formState.errors.password && (
              <p className="text-xs font-medium text-destructive">
                {securityForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="invite_confirm_password"
              className="flex items-center gap-2"
            >
              <Lock className="h-4 w-4 text-brand-500" />
              <EditableText path="auth.confirmPasswordLabel" />
            </Label>
            <Input
              id="invite_confirm_password"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="text-right"
              {...securityForm.register("confirm_password")}
            />
            {securityForm.formState.errors.confirm_password && (
              <p className="text-xs font-medium text-destructive">
                {securityForm.formState.errors.confirm_password.message}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-brand-50 p-4">
            <Controller
              name="terms_accepted"
              control={securityForm.control}
              render={({ field }) => (
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    id="invite_terms_accepted"
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(Boolean(value))}
                  />
                  <span className="text-sm leading-snug text-brand-800">
                    <EditableText path="auth.termsCheckbox" as="span" />{" "}
                    <span className="inline-flex flex-wrap gap-x-2 gap-y-1 text-teal">
                      <Link href="/terms" className="underline underline-offset-2">
                        תקנון שימוש
                      </Link>
                      <span aria-hidden>·</span>
                      <Link href="/privacy" className="underline underline-offset-2">
                        מדיניות פרטיות
                      </Link>
                      <span aria-hidden>·</span>
                      <Link
                        href="/accessibility"
                        className="underline underline-offset-2"
                      >
                        הצהרת נגישות
                      </Link>
                    </span>
                  </span>
                </label>
              )}
            />
            {securityForm.formState.errors.terms_accepted && (
              <p className="mt-2 text-xs font-medium text-destructive">
                {securityForm.formState.errors.terms_accepted.message}
              </p>
            )}
          </div>

          {securityForm.formState.errors.root && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-destructive">
                {securityForm.formState.errors.root.message}
              </p>
              {loginRequired && (
                <Link
                  href={`/login?next=${encodeURIComponent(`/register/invite?token=${token}`)}`}
                  className="text-sm font-medium text-brand-600 hover:opacity-80"
                >
                  התחברי לחשבון הקיים
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={registering}
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText path="common.back" />
            </Button>
            <Button type="submit" size="lg" disabled={registering || loginRequired}>
              <EditableText path="auth.inviteSendOtpButton" />
              <KeyRound className="h-5 w-5" />
            </Button>
          </div>
        </form>
      ) : null}

      {step === 2 && otpPhase ? (
        <form
          onSubmit={otpForm.handleSubmit(onOtpSubmit)}
          className="flex flex-col gap-5"
        >
          <p className="text-sm text-muted-foreground">
            <EditableText path="auth.inviteOtpHint" as="span" />{" "}
            <span dir="ltr" className="font-medium text-ink">
              {preview.email}
            </span>
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite_otp" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-500" />
              <EditableText path="auth.otpCodeLabel" />
            </Label>
            <Input
              id="invite_otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              className="text-center text-lg tracking-[0.35em]"
              maxLength={6}
              {...otpForm.register("code")}
            />
            {otpForm.formState.errors.code && (
              <p className="text-xs font-medium text-destructive">
                {otpForm.formState.errors.code.message}
              </p>
            )}
          </div>

          {otpInfo ? (
            <p className="text-xs font-medium text-brand-700">{otpInfo}</p>
          ) : null}

          {otpForm.formState.errors.root && (
            <p className="text-xs font-medium text-destructive">
              {otpForm.formState.errors.root.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void onResendOtp()}
              disabled={otpForm.formState.isSubmitting || resendingOtp}
            >
              <EditableText path="auth.otpResend" />
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={otpForm.formState.isSubmitting}
            >
              <EditableText path="auth.inviteVerifyButton" />
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <p className="text-sm text-muted-foreground">
          <EditableText path="auth.inviteRedirecting" as="span" />
        </p>
      ) : null}
    </div>
  );
}
