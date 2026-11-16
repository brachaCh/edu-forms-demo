"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFormAiFillPanel } from "@/components/students/PublicFormAiFillPanel";
import { PublicFormFields } from "@/components/students/PublicFormFields";
import { formSupportsPublicLinkAiFill } from "@/lib/form-ai-fill";
import {
  loadPublicFormFill,
  requestFormFillOtp,
  savePublicFormFill,
  verifyFormFillOtp,
  type PublicFormFillRequest,
} from "@/lib/form-fill-request";
import { getFormSchema } from "@/lib/form-schemas";
import { isHomeroomFillForm } from "@/lib/homeroom-fill-forms";
import {
  isParentQuestionnaireForm,
  STAFF_ONLY_FIELD_KEYS,
} from "@/lib/parent-questionnaire-email";
import {
  applyStoredLocalFill,
  clearPublicFormOtpRecovery,
  mergeParkedPublicFormOtpRecovery,
  persistPublicFormOtpRecovery,
  readPublicFormOtpRecovery,
  type PublicFormOtpRecovery,
  type PublicFormPendingAction,
} from "@/lib/public-form-fill-otp-recovery";

export function PublicFormFillPage({ token }: { token: string }) {
  const [request, setRequest] = useState<PublicFormFillRequest | null>(null);
  const [data, setData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [otpGate, setOtpGate] = useState<{
    maskedEmail: string;
    info: string | null;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const dataRef = useRef(data);
  const draftAutosaveBusyRef = useRef(false);
  const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastAutosavedJsonRef = useRef<string | null>(null);
  const autosaveBaselineReadyRef = useRef(false);
  const otpRecoveryRef = useRef<PublicFormOtpRecovery | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  function parkOtpRecovery(
    pendingAction: PublicFormPendingAction | null,
    values?: Record<string, string>
  ) {
    const latest = { ...(values ?? {}), ...dataRef.current };
    const recovery = mergeParkedPublicFormOtpRecovery(otpRecoveryRef.current, {
      data: latest,
      pendingAction,
    });
    otpRecoveryRef.current = recovery;
    persistPublicFormOtpRecovery(token, recovery);
  }

  const openFill = useCallback(async () => {
    const result = await loadPublicFormFill(token);
    if (result.ok && result.data) {
      setOtpGate(null);
      setRequest(result.data);
      const serverData = result.data.data ?? {};
      if (!otpRecoveryRef.current) {
        otpRecoveryRef.current = readPublicFormOtpRecovery(token);
      }
      const recovery = otpRecoveryRef.current;
      if (recovery) {
        const applied = applyStoredLocalFill({ serverData, recovery });
        setData(applied.data);
        dataRef.current = applied.data;
        setError(null);
        autosaveBaselineReadyRef.current = true;
        lastAutosavedJsonRef.current = JSON.stringify(serverData);
        clearPublicFormOtpRecovery(token);
        // Never let a restored park linger past this load; only onVerifyOtp
        // may act on the returned pendingAction, exactly once.
        otpRecoveryRef.current = null;
        return applied;
      }
      setData(serverData);
      dataRef.current = serverData;
      setError(null);
      autosaveBaselineReadyRef.current = false;
      lastAutosavedJsonRef.current = null;
      return { data: serverData, pendingAction: null };
    }
    if (result.error === "OTP_REQUIRED") {
      const maskedEmail = result.maskedEmail || "***";
      setOtpGate({
        maskedEmail,
        info: `נשלח קוד אימות למייל ${maskedEmail}. בדקו גם את תיקיית הספאם.`,
      });
      const sentKey = `form-fill-otp-sent:${token}`;
      if (sessionStorage.getItem(sentKey) !== "1") {
        const sent = await requestFormFillOtp(token);
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
    setLoading(true);
    void openFill()
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינת הטופס");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openFill]);

  function setField(key: string, value: string) {
    setData((current) => ({ ...current, [key]: value }));
  }

  const persistDraftAutosave = useCallback(
    async (nextData: Record<string, string>) => {
      if (draftAutosaveBusyRef.current || done) return;
      const json = JSON.stringify(nextData);
      if (json === lastAutosavedJsonRef.current) return;

      draftAutosaveBusyRef.current = true;
      setAutoSaveStatus("saving");
      const result = await savePublicFormFill(token, nextData, false);
      draftAutosaveBusyRef.current = false;
      if (!result.ok) {
        if (result.error === "OTP_REQUIRED") {
          parkOtpRecovery(null);
          setAutoSaveStatus("idle");
          setError(null);
          sessionStorage.removeItem(`form-fill-otp-sent:${token}`);
          setOtpGate({
            maskedEmail: "***",
            info: "תוקף האימות פג — יש לאמת שוב כדי לשמור",
          });
          setRequest(null);
          void openFill();
          return;
        }
        setAutoSaveStatus("error");
        if (result.error) setError(result.error);
        return;
      }
      lastAutosavedJsonRef.current = json;
      setAutoSaveStatus("saved");
    },
    [token, done, openFill]
  );

  useEffect(() => {
    if (loading || !request || done) return;

    const json = JSON.stringify(data);
    if (!autosaveBaselineReadyRef.current) {
      lastAutosavedJsonRef.current = json;
      autosaveBaselineReadyRef.current = true;
      return;
    }
    if (json === lastAutosavedJsonRef.current) return;
    if (saving) return;

    if (draftAutosaveTimerRef.current) {
      clearTimeout(draftAutosaveTimerRef.current);
    }
    draftAutosaveTimerRef.current = setTimeout(() => {
      draftAutosaveTimerRef.current = null;
      void persistDraftAutosave(dataRef.current);
    }, 1500);

    return () => {
      if (draftAutosaveTimerRef.current) {
        clearTimeout(draftAutosaveTimerRef.current);
        draftAutosaveTimerRef.current = null;
      }
    };
  }, [data, loading, request, done, saving, persistDraftAutosave]);

  async function persist(
    complete: boolean,
    override?: Record<string, string>
  ) {
    const payload = override ?? dataRef.current;
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await savePublicFormFill(token, payload, complete);
    setSaving(false);
    if (!result.ok) {
      if (result.error === "OTP_REQUIRED") {
        parkOtpRecovery(complete ? "submit" : "draft", payload);
        setRequest(null);
        sessionStorage.removeItem(`form-fill-otp-sent:${token}`);
        setOtpGate({
          maskedEmail: "***",
          info: "תוקף האימות פג — יש לאמת שוב כדי לשמור",
        });
        void openFill();
        return;
      }
      setError(result.error || "שמירת הטופס נכשלה");
      return;
    }
    otpRecoveryRef.current = null;
    clearPublicFormOtpRecovery(token);
    lastAutosavedJsonRef.current = JSON.stringify(payload);
    setAutoSaveStatus("saved");
    if (complete) {
      setDone(true);
      return;
    }
    setMessage("הטיוטה נשמרה");
  }

  async function onVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setOtpBusy(true);
    setError(null);
    const result = await verifyFormFillOtp(token, otpCode);
    if (!result.ok) {
      setError(
        result.error === "OTP_EXPIRED"
          ? "הקוד פג תוקף. בקשו קוד חדש."
          : result.error === "OTP_LOCKED"
            ? "הקוד נחסם אחרי יותר מדי ניסיונות. בקשו קוד חדש."
            : "הקוד שגוי. בדקו את המייל ונסו שוב."
      );
      setOtpBusy(false);
      return;
    }
    setOtpCode("");
    const opened = await openFill();
    const action = opened?.pendingAction ?? null;
    otpRecoveryRef.current = null;
    if (action && opened) {
      await persist(action === "submit", opened.data);
    }
    setOtpBusy(false);
  }

  async function onResendOtp() {
    setOtpBusy(true);
    setError(null);
    const sent = await requestFormFillOtp(token);
    sessionStorage.setItem(`form-fill-otp-sent:${token}`, "1");
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
          <h1 className="text-2xl font-bold">אימות למילוי הטופס</h1>
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
            <Label htmlFor="form_fill_otp_code" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-500" />
              קוד בן 6 ספרות
            </Label>
            <Input
              id="form_fill_otp_code"
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
            {otpBusy ? "מאמת..." : "אימות והמשך לטופס"}
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
        <h1 className="text-2xl font-bold">הטופס התקבל בהצלחה</h1>
        <p>תודה. אפשר לסגור את החלון.</p>
      </main>
    );
  }
  if (!request) return null;

  const schema = getFormSchema(request.formId);
  if (!schema || !(isHomeroomFillForm(schema) || isParentQuestionnaireForm(schema))) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center text-destructive">
        הטופס אינו זמין למילוי בקישור זה.
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{request.formTitle}</h1>
        {request.studentName ? (
          <p className="text-sm text-pink">{request.studentName}</p>
        ) : null}
        <p className="mt-1 text-xs text-pink/80">
          {isParentQuestionnaireForm(schema) ? "מילוי על ידי ההורים" : "מילוי על ידי איש צוות"}
        </p>
      </header>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-white p-4">
        <PublicFormFields
          schema={schema}
          data={data}
          onChange={setField}
          hiddenKeys={isParentQuestionnaireForm(schema) ? STAFF_ONLY_FIELD_KEYS : undefined}
        />
      </div>

      {formSupportsPublicLinkAiFill(schema) ? (
        <PublicFormAiFillPanel
          token={token}
          schema={schema}
          data={data}
          onApply={setData}
        />
      ) : null}

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-center text-sm font-medium text-brand-700">
          {message}
        </p>
      ) : null}
      {autoSaveStatus !== "idle" ? (
        <p
          className={`text-center text-xs ${
            autoSaveStatus === "error"
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
          aria-live="polite"
        >
          {autoSaveStatus === "saving"
            ? "שומר אוטומטית…"
            : autoSaveStatus === "saved"
              ? "נשמר אוטומטית"
              : "השמירה האוטומטית נכשלה — אפשר לשמור ידנית"}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2 pb-8">
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={saving}
          onClick={() => void persist(false)}
        >
          {saving ? "שומר..." : "שמירת טיוטה"}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={saving}
          onClick={() => void persist(true)}
        >
          {saving ? "שולח..." : "סיום ושליחה"}
        </Button>
      </div>
    </main>
  );
}
