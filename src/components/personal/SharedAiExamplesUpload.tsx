"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  AI_EXAMPLE_KINDS,
  AI_EXAMPLE_KIND_LABELS,
  addSharedAiExample,
  listSharedAiExamplesForScope,
  loadSharedAiExamples,
  removeSharedAiExample,
  subscribeSharedAiExamples,
  type AiExampleKind,
  type AiExamplesScopeInput,
  type SharedAiExample,
} from "@/lib/ai-shared-examples";

const EXAMPLE_ACCEPT =
  ".txt,.md,.csv,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_EXAMPLE_FILE_BYTES = 4 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("read_failed"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

interface SharedAiExamplesUploadProps {
  scope: AiExamplesScopeInput;
}

export function SharedAiExamplesUpload({ scope }: SharedAiExamplesUploadProps) {
  const { texts } = useSiteText();
  const { guestDemo } = useDataStore();
  const t = (path: string, fallback: string) =>
    getTextByPath(texts, path) || fallback;

  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AiExampleKind>("tachi");
  const [examples, setExamples] = useState<SharedAiExample[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadSharedAiExamples(scope);
      if (!cancelled) setExamples(list);
    })();
    const unsub = subscribeSharedAiExamples(() => {
      setExamples(listSharedAiExamplesForScope(scope));
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when identity changes
  }, [scope.institutionId, scope.institutionCode]);

  async function extractText(file: File): Promise<string> {
    const lower = file.name.toLowerCase();
    if (file.size > MAX_EXAMPLE_FILE_BYTES) {
      throw new Error("too_large");
    }
    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      throw new Error("legacy_doc");
    }

    if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".csv") ||
      file.type.startsWith("text/")
    ) {
      return (await file.text()).trim();
    }

    const contentBase64 = await fileToBase64(file);
    const res = await fetch("/api/ai/extract-example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || undefined,
        contentBase64,
      }),
    });
    if (res.status === 415) throw new Error("unsupported");
    if (res.status === 413) throw new Error("too_large");
    if (res.status === 422) throw new Error("empty");
    if (!res.ok) throw new Error("read_failed");
    const body = (await res.json()) as { text?: string };
    return (body.text ?? "").trim();
  }

  async function handleFile(file: File | null) {
    setError(null);
    setSuccess(null);
    if (!file) return;
    setLoading(true);
    try {
      const text = await extractText(file);
      if (!text) {
        setError(
          t("formAiFill.exampleEmpty", "לא נמצא טקסט בקובץ — נסי קובץ אחר")
        );
        return;
      }
      await addSharedAiExample(scope, {
        kind,
        name: file.name,
        text,
      });
      setExamples(listSharedAiExamplesForScope(scope));
      setSuccess(
        t(
          "personalArea.aiExamplesSaved",
          "הדוגמה נשמרה — ה-AI ישתמש בה למילוי טוב יותר"
        )
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "too_large") {
        setError(t("formAiFill.exampleTooLarge", "הקובץ גדול מדי (עד 4MB)"));
      } else if (code === "legacy_doc") {
        setError(
          t(
            "formAiFill.exampleDocLegacy",
            "קבצי .doc ישנים לא נתמכים — שמרי כ-.docx או PDF או TXT"
          )
        );
      } else if (code === "unsupported") {
        setError(
          t(
            "formAiFill.exampleUnsupported",
            "סוג קובץ לא נתמך — העלי Word (.docx), PDF או TXT"
          )
        );
      } else if (code === "empty") {
        setError(
          t("formAiFill.exampleEmpty", "לא נמצא טקסט בקובץ — נסי קובץ אחר")
        );
      } else {
        setError(
          t(
            "formAiFill.exampleReadFailed",
            "לא הצלחתי לקרוא את הקובץ — נסי שוב או העלי TXT"
          )
        );
      }
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    setSuccess(null);
    setBusyId(id);
    try {
      await removeSharedAiExample(scope, id);
      setExamples(listSharedAiExamplesForScope(scope));
    } catch {
      setError(
        t("personalArea.aiExamplesRemoveFailed", "מחיקת הדוגמה נכשלה — נסי שוב")
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="menu-box shrink-0 space-y-3 p-3">
      <p className="text-center text-sm font-bold text-ink">
        <EditableText path="personalArea.aiExamplesTitle" />
      </p>
      <p className="text-center text-xs leading-5 text-pink/70">
        <EditableText path="personalArea.aiExamplesHint" />
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="text-xs font-medium text-slate-600">
          {t("personalArea.aiExamplesKindLabel", "סוג טופס")}
        </label>
        <select
          value={kind}
          disabled={loading || guestDemo}
          onChange={(e) => setKind(e.target.value as AiExampleKind)}
          className="rounded-md border border-brand-200 bg-white px-2 py-1.5 text-sm"
        >
          {AI_EXAMPLE_KINDS.filter((k) => k !== "general").map((k) => (
            <option key={k} value={k}>
              {AI_EXAMPLE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {!guestDemo ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={EXAMPLE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0] ?? null);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {loading
                ? t("formAiFill.exampleReading", "קוראת קובץ...")
                : t(
                    "personalArea.aiExamplesUpload",
                    "העלאת דוגמה ל-AI"
                  )}
            </Button>
          </>
        ) : null}
      </div>

      {examples.length === 0 ? (
        <p className="text-center text-xs text-slate-500">
          {t(
            "personalArea.aiExamplesEmpty",
            "עדיין אין דוגמה ל-AI — העלי דוגמת מילוי אחת"
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {examples.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center justify-between gap-2 rounded-md border border-brand-100 bg-white/80 px-2.5 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{ex.name}</p>
                <p className="text-[11px] text-slate-500">
                  {AI_EXAMPLE_KIND_LABELS[ex.kind]}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={guestDemo || busyId === ex.id}
                aria-label={t("personalArea.aiExamplesRemove", "מחיקה")}
                onClick={() => void handleRemove(ex.id)}
              >
                {busyId === ex.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">{error}</p>
      ) : null}
      {success ? (
        <p className="text-center text-sm font-medium text-brand-700">
          {success}
        </p>
      ) : null}
    </div>
  );
}
