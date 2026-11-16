"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GreenSignatureField } from "@/components/students/GreenSignatureField";
import {
  loadPublicExternalSignature,
  requestExternalSignatureOtp,
  submitExternalSignature,
  verifyExternalSignatureOtp,
  type PublicExternalSignatureRequest,
} from "@/lib/external-signature-public";

export function PublicExternalSignaturePage({ token }: { token: string }) {
  const [request, setRequest] = useState<PublicExternalSignatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState("");
  const [otpGate, setOtpGate] = useState<{
    maskedEmail: string;
    info: string | null;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  const openSignature = useCallback(async () => {
    const result = await loadPublicExternalSignature(token);
    if (result.ok && result.data) {
      setOtpGate(null);
      setRequest(result.data);
      setError(null);
      return result.data;
    }
    if (result.error === "OTP_REQUIRED") {
      const maskedEmail = result.maskedEmail || "***";
      setOtpGate({
        maskedEmail,
        info: `נשלח קוד אימות למייל ${maskedEmail}. בדקו גם את תיקיית הספאם.`,
      });
      const sentKey = `external-sig-otp-sent:${token}`;
      if (sessionStorage.getItem(sentKey) !== "1") {
        const sent = await requestExternalSignatureOtp(token);
        if (sent.ok) {
          sessionStorage.setItem(sentKey, "1");
        }
        if (sent.maskedEmail) {
          setOtpGate({
            maskedEmail: sent.maskedEmail,
            info: `נשלח קוד אימות למייל ${sent.maskedEmail}. בדקו גם את תיקיית הספאם.`,
          });
        }
        if (!sent.ok && sent.error === "RATE_LIMITED") {
          setOtpGate({
            maskedEmail,
            info: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.",
          });
        } else if (!sent.ok && sent.error === "EMAIL_SEND_FAILED") {
          setOtpGate({
            maskedEmail,
            info: "שליחת המייל נכשלה. נסו לשלוח קוד חדש.",
          });
        }
      }
      return null;
    }
    setError(result.error || "הקישור אינו תקין או שפג תוקפו");
    return null;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch pattern
    void openSignature()
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינת המסמך");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSignature]);

  async function onVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setOtpBusy(true);
    setError(null);
    const result = await verifyExternalSignatureOtp(token, otpCode);
    if (!result.ok) {
      setError(
        result.error === "RATE_LIMITED"
          ? "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות."
          : result.error === "OTP_EXPIRED"
            ? "הקוד פג תוקף. בקשו קוד חדש."
            : result.error === "OTP_LOCKED"
              ? "הקוד נחסם אחרי יותר מדי ניסיונות. בקשו קוד חדש."
              : "הקוד שגוי. בדקו את המייל ונסו שוב."
      );
      setOtpBusy(false);
      return;
    }
    setOtpCode("");
    await openSignature();
    setOtpBusy(false);
  }

  async function onResendOtp() {
    setOtpBusy(true);
    setError(null);
    const sent = await requestExternalSignatureOtp(token);
    sessionStorage.setItem(`external-sig-otp-sent:${token}`, "1");
    if (!sent.ok && sent.error === "RATE_LIMITED") {
      setError("נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.");
    } else {
      const maskedEmail = sent.maskedEmail || otpGate?.maskedEmail || "***";
      setOtpGate({
        maskedEmail,
        info: `נשלח קוד חדש למייל ${maskedEmail}. בדקו גם את תיקיית הספאם.`,
      });
      setOtpCode("");
    }
    setOtpBusy(false);
  }

  async function onSubmitSignature() {
    if (!signatureData.trim()) {
      setError("יש לחתום לפני השליחה");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitExternalSignature(token, signatureData);
    setSubmitting(false);
    if (!result.ok) {
      if (result.error === "OTP_REQUIRED") {
        setRequest(null);
        sessionStorage.removeItem(`external-sig-otp-sent:${token}`);
        setOtpGate({
          maskedEmail: "***",
          info: "תוקף האימות פג — יש לאמת שוב כדי לחתום",
        });
        void openSignature();
        return;
      }
      setError(result.error || "שמירת החתימה נכשלה");
      return;
    }
    setDone(true);
  }

  if (loading) {
    return <main className="p-8 text-center">טוען את המסמך...</main>;
  }

  if (otpGate && !request) {
    return (
      <main
        dir="rtl"
        className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6"
      >
        <header className="text-center">
          <h1 className="text-2xl font-bold">אימות לחתימה על מסמך</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            נשלח קוד חד־פעמי למייל שהוגדר.
          </p>
        </header>
        {otpGate.info ? (
          <p className="rounded-md bg-muted/60 px-4 py-3 text-sm">{otpGate.info}</p>
        ) : null}
        <p className="text-center text-sm text-muted-foreground" dir="ltr">
          {otpGate.maskedEmail}
        </p>
        <form onSubmit={(event) => void onVerifyOtp(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="external_sig_otp_code" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-500" />
              קוד בן 6 ספרות
            </Label>
            <Input
              id="external_sig_otp_code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              className="text-center tracking-[0.35em]"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {error ? (
            <p className="text-center text-sm font-medium text-destructive">{error}</p>
          ) : null}
          <Button type="submit" size="lg" disabled={otpBusy || otpCode.length !== 6}>
            {otpBusy ? "מאמת..." : "אימות והמשך לחתימה"}
          </Button>
        </form>
        <button
          type="button"
          className="text-center text-sm font-medium text-brand-600 hover:opacity-80 disabled:opacity-50"
          disabled={otpBusy}
          onClick={() => void onResendOtp()}
        >
          שליחת קוד חדש
        </button>
      </main>
    );
  }

  if (error && !request) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center text-destructive">
        {error}
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-brand-600" />
        <h1 className="text-2xl font-bold">החתימה נקלטה בהצלחה</h1>
        <p>תודה. אפשר לסגור את החלון.</p>
      </main>
    );
  }

  if (!request) return null;

  return (
    <main dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{request.documentName}</h1>
        <p className="mt-1 text-sm text-pink">
          התבקשתם לחתום בתור: <strong>{request.signerLabel}</strong>
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span>המסמך לחתימה</span>
        </div>
        <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg border border-border bg-gray-50">
          <iframe
            src={request.documentUrl}
            className="absolute inset-0 h-full w-full"
            title={request.documentName}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          אם המסמך אינו מוצג — <a href={request.documentUrl} target="_blank" rel="noopener noreferrer" className="underline">לחצו כאן לפתיחה בחלון חדש</a>
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4">
        <GreenSignatureField
          id="external_signature"
          label="חתימה"
          required
          value={signatureData}
          onChange={setSignatureData}
          size="large"
          placeholder="חתמו כאן באצבע או בעכבר"
        />
      </section>

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-center pb-8">
        <Button
          type="button"
          size="lg"
          disabled={submitting || !signatureData.trim()}
          onClick={() => void onSubmitSignature()}
        >
          {submitting ? "שולח..." : "אישור ושליחת החתימה"}
        </Button>
      </div>
    </main>
  );
}
