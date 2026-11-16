"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CheckCircle2, KeyRound, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GreenSignatureField } from "@/components/students/GreenSignatureField";
import {
  loadPublicSignatureRequest,
  requestFormSignatureOtp,
  submitPublicSignature,
  verifyFormSignatureOtp,
  type PublicSignatureRequest,
} from "@/lib/form-signature-request";
import { snapshotHtmlWithoutBlockedImages } from "@/lib/green-signature";

/** ב-iframe עם sandbox, נתיבים יחסיים ל-/brand לא נטענים — הופכים למוחלטים */
function absolutizeBrandAssetUrls(html: string): string {
  if (typeof window === "undefined") return html;
  const origin = window.location.origin.replace(/\/$/, "");
  return html.replace(
    /(\bsrc=["'])(\/brand\/[^"']+)(["'])/gi,
    `$1${origin}$2$3`
  );
}

function printSnapshotHtml(html: string, title: string): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  const safeTitle = title.replace(/</g, "");
  printWindow.document.open();
  printWindow.document.write(
    `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><title>${safeTitle}</title><style>
      @page { margin: 12mm; }
      body { margin: 0; font-family: Arial, sans-serif; }
      img { max-width: 100%; height: auto; }
    </style></head><body>${html}</body></html>`
  );
  printWindow.document.close();
  const runPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore
    }
  };
  if (printWindow.document.readyState === "complete") {
    window.setTimeout(runPrint, 250);
  } else {
    printWindow.addEventListener("load", () => window.setTimeout(runPrint, 250));
  }
}

export function PublicFormSignaturePage({ token }: { token: string }) {
  const [request, setRequest] = useState<PublicSignatureRequest | null>(null);
  const [signature, setSignature] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpGate, setOtpGate] = useState<{
    maskedEmail: string;
    info: string | null;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const signatureCardRef = useRef<HTMLDivElement>(null);

  const openSignature = useCallback(async () => {
    const result = await loadPublicSignatureRequest(token);
    if (result.ok && result.data) {
      setOtpGate(null);
      setRequest(result.data);
      setIdNumber(result.data.companionIdField?.value?.trim() || "");
      setError(null);
      return;
    }
    if (result.error === "OTP_REQUIRED") {
      const maskedEmail = result.maskedEmail || "***";
      setOtpGate({
        maskedEmail,
        info: `נשלח קוד אימות למייל ${maskedEmail}. בדקו גם את תיקיית הספאם.`,
      });
      const sentKey = `form-signature-otp-sent:${token}`;
      if (sessionStorage.getItem(sentKey) !== "1") {
        const sent = await requestFormSignatureOtp(token);
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
      return;
    }
    setError(result.error || "הקישור אינו תקין או שפג תוקפו");
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void openSignature()
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינת בקשת החתימה");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSignature]);

  const viewHtml = useMemo(() => {
    if (!request) return "";
    return absolutizeBrandAssetUrls(
      snapshotHtmlWithoutBlockedImages(request.snapshotHtml)
    );
  }, [request]);

  const expiresLabel = useMemo(() => {
    if (!request?.expiresAt) return null;
    const d = new Date(request.expiresAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("he-IL");
  }, [request?.expiresAt]);

  async function onVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setOtpBusy(true);
    setError(null);
    const result = await verifyFormSignatureOtp(token, otpCode);
    if (!result.ok) {
      setError(
        result.error === "OTP_EXPIRED"
          ? "הקוד פג תוקף. בקשו קוד חדש."
          : result.error === "OTP_LOCKED"
            ? "הקוד נחסם אחרי יותר מדי ניסיונות. בקשו קוד חדש."
            : result.error === "RATE_LIMITED"
              ? "נשלחו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות."
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
    const sent = await requestFormSignatureOtp(token);
    sessionStorage.setItem(`form-signature-otp-sent:${token}`, "1");
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

  async function submit() {
    if (request?.companionIdField && !idNumber.trim()) {
      setError(`נא למלא ${request.companionIdField.label}`);
      return;
    }
    if (!signature) {
      setError("יש לחתום לפני השליחה");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitPublicSignature(
      token,
      signature,
      request?.companionIdField ? idNumber.trim() : undefined
    );
    setSubmitting(false);
    if (!result.ok) {
      if (result.error === "OTP_REQUIRED") {
        setRequest(null);
        sessionStorage.removeItem(`form-signature-otp-sent:${token}`);
        void openSignature();
        return;
      }
      setError(result.error || "שמירת החתימה נכשלה");
      return;
    }
    setSigned(true);
  }

  if (loading) {
    return <main className="p-8 text-center">טוען את הטופס...</main>;
  }
  if (otpGate && !request) {
    return (
      <main
        dir="rtl"
        className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6"
      >
        <header className="text-center">
          <h1 className="text-2xl font-bold">אימות לחתימה</h1>
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
            <Label htmlFor="form_signature_otp_code" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-500" />
              קוד בן 6 ספרות
            </Label>
            <Input
              id="form_signature_otp_code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              className="text-center tracking-[0.35em]"
              value={otpCode}
              onChange={(event) =>
                setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
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
  if (signed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-brand-600" />
        <h1 className="text-2xl font-bold">החתימה התקבלה בהצלחה</h1>
        <p>אפשר לסגור את החלון.</p>
      </main>
    );
  }
  if (!request) return null;

  const companion = request.companionIdField;
  const canSubmit =
    Boolean(signature) && (!companion || Boolean(idNumber.trim()));

  const scrollToSignature = () => {
    signatureCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <main dir="rtl" className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-28 sm:p-8 sm:pb-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{request.formTitle}</h1>
        {request.studentName ? (
          <p className="text-sm text-pink">{request.studentName}</p>
        ) : null}
        {expiresLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">
            הקישור תקף עד {expiresLabel}
          </p>
        ) : null}
      </header>

      <section
        aria-label="הנחיות לחתימה"
        className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900"
      >
        <p className="font-semibold">
          התבקשתם לחתום בשדה «{request.fieldLabel}». כך עושים זאת:
        </p>
        <ol className="flex flex-col gap-1.5 pr-5 marker:font-bold [list-style-type:decimal]">
          <li>קראו את המסמך המוצג למטה. המסמך לצפייה בלבד — לא ממלאים בו כלום.</li>
          <li>
            גללו לתיבת החתימה הירוקה שמתחת למסמך
            {companion ? `, מלאו ${companion.label}` : ""} וחתמו בתוכה באצבע או
            בעכבר.
          </li>
          <li>לחצו על «אישור ושליחת החתימה».</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
            onClick={scrollToSignature}
          >
            <ArrowDown className="ml-1 h-4 w-4" />
            מעבר ישירות לתיבת החתימה
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => printSnapshotHtml(viewHtml, request.formTitle)}
          >
            <Printer className="h-4 w-4" />
            הדפסה
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          תצוגת המסמך (לקריאה בלבד)
        </p>
        <iframe
          title="תצוגת הטופס לחתימה"
          srcDoc={viewHtml}
          sandbox=""
          className="h-[40vh] w-full rounded-xl border border-border bg-white sm:h-[55vh]"
        />
      </div>

      <div
        ref={signatureCardRef}
        className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border-2 border-emerald-400 bg-white p-4 shadow-[0_0_0_4px_rgba(16,185,129,0.12)] sm:p-5"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {companion ? "2" : "✓"}
          </span>
          <h2 className="text-lg font-bold text-emerald-900">כאן חותמים</h2>
        </div>

        {companion ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-parent-id">{companion.label}</Label>
            <Input
              id="public-parent-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="מספר תעודת זהות"
              dir="ltr"
              className="text-left"
              required
            />
            <p className="text-xs text-pink">נא למלא את מספר תעודת הזהות לפני החתימה.</p>
          </div>
        ) : null}

        <GreenSignatureField
          id="public-signature"
          label={request.fieldLabel}
          required
          size="large"
          value={signature}
          onChange={setSignature}
        />
        {!signature ? (
          <p className="text-xs text-muted-foreground">
            אחרי החתימה יופעל כפתור «אישור ושליחת החתימה».
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            החתימה נקלטה — אפשר לשלוח.
          </p>
        )}
      </div>

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={submitting || !canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? "שומר..." : "אישור ושליחת החתימה"}
        </Button>
      </div>
    </main>
  );
}
