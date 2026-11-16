"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildAiFillFieldDescriptors,
  flattenAiFillPatch,
  mergeAiFillIntoCurrentData,
} from "@/lib/form-ai-fill";
import {
  createFormAiFillSession,
  recordFormAiFillApply,
} from "@/lib/form-ai-fill-session";
import type { FormSchema } from "@/lib/form-schemas";
import { cn } from "@/lib/utils";

type FormData = Record<string, string>;

interface PublicFormAiFillPanelProps {
  token: string;
  schema: FormSchema;
  data: FormData;
  onApply: (next: FormData | ((current: FormData) => FormData)) => void;
  className?: string;
}

const PREP_FORM_IDS = new Set(["tachi-prep", "tla-prep"]);

export function PublicFormAiFillPanel({
  token,
  schema,
  data,
  onApply,
  className,
}: PublicFormAiFillPanelProps) {
  const prep = PREP_FORM_IDS.has(schema.id);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fillSessionRef = useRef(createFormAiFillSession());

  async function handleFill() {
    setError(null);
    setSuccess(null);
    if (prep && !notes.trim()) {
      setError("הקלידו תיאור קצר של התלמיד/ה לפני מילוי AI");
      return;
    }
    setLoading(true);
    const baseline = { ...dataRef.current };
    const session = fillSessionRef.current;
    try {
      const descriptors = buildAiFillFieldDescriptors(schema, baseline);
      const fields = descriptors.map((descriptor) => ({
        key: descriptor.key,
        currentValue: baseline[descriptor.key] ?? "",
      }));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 115_000);
      let res: Response;
      try {
        res = await fetch("/api/fill/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token,
            fields,
            teacherNotes: notes.trim() || undefined,
            refine:
              (session.aiFillCount > 0 && Boolean(notes.trim())) || undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!res.ok) {
        if (res.status === 401) {
          setError("יש לאמת את הקישור בקוד שנשלח למייל כדי להשתמש ב-AI");
        } else if (res.status === 429) {
          setError("יותר מדי בקשות — נסו שוב בעוד רגע");
        } else if (res.status === 503) {
          setError("AI לא זמין כרגע");
        } else if (res.status === 403) {
          setError("מילוי AI לא זמין לטופס זה");
        } else if (res.status === 504) {
          setError("המילוי ארך יותר מדי — נסו שוב בעוד רגע");
        } else {
          setError("מילוי הטופס נכשל — נסו שוב");
        }
        return;
      }

      const body = (await res.json()) as { fields?: Record<string, unknown> };
      const allowed = new Set(descriptors.map((descriptor) => descriptor.key));
      const labelToKey = Object.fromEntries(
        descriptors.map((descriptor) => [descriptor.label, descriptor.key] as const)
      );
      const patch = flattenAiFillPatch(body.fields ?? {}, allowed, labelToKey);
      const refine = session.aiFillCount > 0 && Boolean(notes.trim());
      const { lastAiValues } = session;
      const applyToCurrent = (current: FormData) =>
        mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
          refine,
          lastAiValues,
        });
      const merged = applyToCurrent(dataRef.current);
      const beforeApply = dataRef.current;
      const changedCount = Object.keys(merged).filter(
        (key) =>
          allowed.has(key) &&
          (merged[key] ?? "").trim() !== (beforeApply[key] ?? "").trim()
      ).length;
      onApply(applyToCurrent);
      const appliedFromMerged: FormData = {};
      for (const key of Object.keys(patch)) {
        if (allowed.has(key) && merged[key] !== beforeApply[key]) {
          appliedFromMerged[key] = merged[key];
        }
      }
      recordFormAiFillApply(session, appliedFromMerged);
      setSuccess(
        changedCount > 0
          ? "הטיוטה מולאה — עברו על השדות, תקנו לפי הצורך ושמרו"
          : "לא התקבלו הצעות חדשות — אפשר להוסיף הנחיה קצרה"
      );
    } catch (caught) {
      const aborted =
        caught instanceof DOMException
          ? caught.name === "AbortError"
          : caught instanceof Error &&
            (caught.name === "AbortError" || /aborted|timeout/i.test(caught.message));
      setError(
        aborted
          ? "המילוי ארך יותר מדי — נסו שוב בעוד רגע"
          : "מילוי הטופס נכשל — נסו שוב"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5",
        className
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-base font-bold text-ink">מילוי המסמך בעזרת AI</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {prep
              ? "כתבו תיאור קצר של התלמיד/ה — ה-AI ינסח את שדות דף ההכנה. אין גישה לכרטיס התלמיד מעבר לטופס זה."
              : "לחצו כדי לקבל טיוטה לשדות הריקים. אפשר להוסיף הנחיה קצרה. ה-AI רואה רק את הטופס שנשלח אליכם."}
          </p>
        </div>
      </div>

      <label
        htmlFor="public-ai-notes"
        className="mb-1 block text-xs font-medium text-slate-600"
      >
        {prep ? "תיאור התלמיד/ה ל-AI" : "הנחיה ל-AI (אופציונלי)"}
      </label>
      <textarea
        id="public-ai-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={prep ? 3 : 2}
        disabled={loading}
        placeholder={
          prep
            ? "למשל: רקע משפחתי מורכב, אבחון ADHD, חוזקות בקריאה חברתית..."
            : "למשל: התלמיד מתקשה בקריאה, דגש על ויסות רגשי..."
        }
        className="mb-3 min-h-[56px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="lg"
          disabled={loading}
          onClick={() => void handleFill()}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          {loading ? "ממלאת את המסמך..." : "מילוי בעזרת AI"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-center text-sm font-medium text-brand-700">
          {success}
        </p>
      ) : null}

      <p className="mt-4 border-t border-brand-100 pt-3 text-center text-xs leading-relaxed text-slate-500">
        מילוי זה הוא הצעה בלבד בעזרת בינה מלאכותית. האחריות לתוכן המסמך מוטלת על
        ממלא/ת הטופס. יש לעבור על כל השדות ולתקן לפי הצורך לפני שליחה.
      </p>
    </div>
  );
}
