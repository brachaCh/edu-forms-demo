"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONFIDENTIALITY_WAIVER_FORM_ID } from "@/lib/confidentiality-waiver-gate";
import { loadStudentFormFill } from "@/lib/mock-store";
import {
  loadSimpleSignSubmissions,
  resendSimpleSignEmail,
} from "@/lib/simplesign-signature-request";
import {
  expiredWaiverSignerKeys,
  formatWaiverSignerStatusMessage,
  getWaiverSignerProgress,
  missingWaiverSignerKeys,
  resendableWaiverSignerKeys,
  waiverSignerResendLabel,
  type WaiverSignerKey,
} from "@/lib/waiver-signer-status";

interface WaiverSignerLockedStatusProps {
  studentId: string;
}

export function WaiverSignerLockedStatus({
  studentId,
}: WaiverSignerLockedStatusProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [formFillId, setFormFillId] = useState<string | null>(null);
  const [resendKeys, setResendKeys] = useState<WaiverSignerKey[]>([]);
  const [expiredKeys, setExpiredKeys] = useState<Set<WaiverSignerKey>>(new Set());
  const [resending, setResending] = useState<WaiverSignerKey | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function applyProgress() {
      const progress = getWaiverSignerProgress(studentId);
      setStatusMessage(formatWaiverSignerStatusMessage(progress));
      setFormFillId(progress.formFillId);
      return progress;
    }

    const initial = applyProgress();
    const initialMissing = missingWaiverSignerKeys(initial);
    if (!initial.formFillId || initialMissing.length === 0) {
      setResendKeys([]);
      setExpiredKeys(new Set());
    }

    void (async () => {
      await loadStudentFormFill(studentId, CONFIDENTIALITY_WAIVER_FORM_ID);
      if (cancelled) return;
      const progress = applyProgress();
      const missing = missingWaiverSignerKeys(progress);
      if (!progress.formFillId || missing.length === 0) {
        setResendKeys([]);
        setExpiredKeys(new Set());
        return;
      }
      const listed = await loadSimpleSignSubmissions(progress.formFillId);
      if (cancelled) return;
      if (!listed.ok) {
        setResendKeys([]);
        setExpiredKeys(new Set());
        return;
      }
      setResendKeys(resendableWaiverSignerKeys(missing, listed.submissions));
      setExpiredKeys(new Set(expiredWaiverSignerKeys(missing, listed.submissions)));
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function handleResend(fieldKey: WaiverSignerKey) {
    if (!formFillId) return;
    setResending(fieldKey);
    setFeedback(null);
    setError(null);
    try {
      const result = await resendSimpleSignEmail({
        formFillId,
        signatureFieldKey: fieldKey,
      });
      if (!result.ok) {
        throw new Error(result.error || "שליחת מייל חוזרת נכשלה");
      }
      const wasExpired = expiredKeys.has(fieldKey);
      setFeedback(wasExpired ? "קישור חדש נוצר ונשלח" : "קישור החתימה נשלח שוב");
      if (wasExpired) {
        setExpiredKeys((prev) => {
          const next = new Set(prev);
          next.delete(fieldKey);
          return next;
        });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message.trim() : "";
      setError(raw || "שליחת מייל חוזרת נכשלה");
    } finally {
      setResending(null);
    }
  }

  if (!statusMessage) return null;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p role="status" className="text-sm font-medium text-ink">
        {statusMessage}
      </p>
      {resendKeys.map((key) => {
        const isExpired = expiredKeys.has(key);
        const Icon = isExpired ? RefreshCw : Mail;
        return (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={isExpired ? "default" : "outline"}
            disabled={resending === key}
            onClick={() => void handleResend(key)}
          >
            <Icon className="h-4 w-4" />
            {resending === key ? "שולח..." : waiverSignerResendLabel(key, isExpired)}
          </Button>
        );
      })}
      {feedback ? (
        <p className="text-sm font-medium text-brand-700">{feedback}</p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
