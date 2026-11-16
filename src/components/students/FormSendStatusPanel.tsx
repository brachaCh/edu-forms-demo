"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Mail, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadFormFillHistory,
  type FormFillHistoryItem,
} from "@/lib/form-fill-request";
import { cn } from "@/lib/utils";

interface FormSendStatusPanelProps {
  formFillId: string | undefined;
  className?: string;
  refreshTrigger?: number;
}

function statusLabel(status: FormFillHistoryItem["status"]): string {
  switch (status) {
    case "pending":
      return "ממתין למילוי";
    case "submitted":
      return "הוחזר מלא";
    case "expired":
      return "פג תוקף";
    case "revoked":
      return "בוטל";
    default:
      return status;
  }
}

function StatusIcon({ status }: { status: FormFillHistoryItem["status"] }) {
  switch (status) {
    case "submitted":
      return <Check className="h-4 w-4 text-emerald-600" />;
    case "pending":
      return <Clock className="h-4 w-4 text-amber-600" />;
    case "expired":
    case "revoked":
      return <X className="h-4 w-4 text-gray-400" />;
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FormSendStatusPanel({
  formFillId,
  className,
  refreshTrigger,
}: FormSendStatusPanelProps) {
  const [history, setHistory] = useState<FormFillHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    if (!formFillId) return;
    setLoading(true);
    try {
      const result = await loadFormFillHistory(formFillId);
      if (result.ok) {
        setHistory(result.history);
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (formFillId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch pattern
      void refresh();
    } else {
      setHistory([]);
      setLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formFillId, refreshTrigger]);

  if (!formFillId || (!loaded && !loading)) {
    return null;
  }

  if (loading && history.length === 0) {
    return (
      <div className={cn("text-center text-sm text-pink", className)}>
        טוען היסטוריית שליחות...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-pink",
          className
        )}
      >
        <Mail className="mx-auto mb-1 h-5 w-5 text-gray-400" />
        טרם נשלח קישור למילוי להורים
      </div>
    );
  }

  const hasPending = history.some((h) => h.status === "pending");
  const hasSubmitted = history.some((h) => h.status === "submitted");

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        hasSubmitted
          ? "border-emerald-200 bg-emerald-50/60"
          : hasPending
            ? "border-amber-200 bg-amber-50/60"
            : "border-gray-200 bg-gray-50",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-bold text-ink">סטטוס שליחה להורים</h4>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => void refresh()}
          className="h-7 px-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <ul className="space-y-2">
        {history.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm"
          >
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  dir="ltr"
                  className="font-medium text-ink"
                >
                  {item.recipientEmail}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    item.status === "submitted"
                      ? "bg-emerald-100 text-emerald-800"
                      : item.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  )}
                >
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-pink">
                נשלח: {formatDate(item.createdAt)}
                {item.submittedAt ? (
                  <> · הוחזר: {formatDate(item.submittedAt)}</>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
