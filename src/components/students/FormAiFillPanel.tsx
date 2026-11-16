"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { VoiceRecordButton } from "@/components/students/VoiceRecordButton";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  buildAiFillFieldDescriptors,
  flattenAiFillPatch,
  mergeAiFillIntoCurrentData,
} from "@/lib/form-ai-fill";
import {
  createFormAiFillSession,
  recordFormAiFillApply,
  type FormAiFillSession,
} from "@/lib/form-ai-fill-session";
import {
  loadSharedAiExamples,
  pickBestSharedExamples,
  resolveAiExampleKind,
  subscribeSharedAiExamples,
  type SharedAiExample,
} from "@/lib/ai-shared-examples";
import { getUser } from "@/lib/mock-store";
import type { FormSchema } from "@/lib/form-schemas";
import { cn } from "@/lib/utils";

const MAX_EXAMPLE_CHARS = 12_000;
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

type FormData = Record<string, string>;

interface FormAiFillPanelProps {
  schema: FormSchema;
  data: FormData;
  studentContext: Record<string, string>;
  onApply: (next: FormData | ((current: FormData) => FormData)) => void;
  className?: string;
  /** בכניסה חופשית — השרת יאשר רק שאלון הפניה */
  freeAccess?: boolean;
  /** שם מהכרטיס — למיסוך בשרת בלבד, לא מוצג ולא נשלח למודל */
  studentName?: string;
  /** מונה מילוי/refine — בדף מילוי צוות נשמר ברמת הדף כדי שלא יתאפס אחרי שמירה אוטומטית */
  fillSessionRef?: MutableRefObject<FormAiFillSession>;
}

/** תח"י / תל"א — זרימת מילוי AI לתוכנית עבודה (לפי מזהה טופס בלבד, לא לפי תיקייה) */
const TACHI_WORKPLAN_FORM_IDS = new Set([
  "tachi",
  "tachi-integrative",
  "tachi-prep",
  "tla",
  "tla-integrative",
  "tla-prep",
]);

function isTachiSchema(schema: FormSchema): boolean {
  return TACHI_WORKPLAN_FORM_IDS.has(schema.id);
}

function isTachiIntegrativeSchema(schema: FormSchema): boolean {
  return (
    schema.id === "tachi-integrative" || schema.id === "tla-integrative"
  );
}

function isTlaSchema(schema: FormSchema): boolean {
  return (
    schema.id === "tla" ||
    schema.id === "tla-integrative" ||
    schema.id === "tla-prep"
  );
}

function isPrepSchema(schema: FormSchema): boolean {
  return schema.id === "tachi-prep" || schema.id === "tla-prep";
}

export function FormAiFillPanel({
  schema,
  data,
  studentContext,
  onApply,
  className,
  freeAccess = false,
  studentName,
  fillSessionRef,
}: FormAiFillPanelProps) {
  const { texts } = useSiteText();
  const t = (path: string, fallback: string) =>
    getTextByPath(texts, path) || fallback;

  const tachi = useMemo(() => isTachiSchema(schema), [schema]);
  const tachiIntegrative = useMemo(
    () => isTachiIntegrativeSchema(schema),
    [schema]
  );
  const tla = useMemo(() => isTlaSchema(schema), [schema]);
  const prep = useMemo(() => isPrepSchema(schema), [schema]);
  const planLabel = tla ? 'תל״א' : "תח״י";
  const fileRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });
  const exampleKind = useMemo(() => resolveAiExampleKind(schema), [schema]);

  const [notes, setNotes] = useState("");
  const [personalTemplate, setPersonalTemplate] = useState("");
  const [personalName, setPersonalName] = useState<string | null>(null);
  const [sharedExamples, setSharedExamples] = useState<SharedAiExample[]>([]);
  const [selectedSharedId, setSelectedSharedId] = useState<string | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const localFillSessionRef = useRef<FormAiFillSession>(createFormAiFillSession());
  const fillSession = fillSessionRef ?? localFillSessionRef;

  useEffect(() => {
    const user = getUser();
    const scope = {
      institutionId: user?.institution_id ?? null,
      institutionCode: user?.institution_code ?? null,
    };

    let cancelled = false;
    function applyList(list: SharedAiExample[]) {
      const matched = pickBestSharedExamples(list, exampleKind);
      setSharedExamples(matched);
      setSelectedSharedId((prev) => {
        if (prev && matched.some((e) => e.id === prev)) return prev;
        return matched[0]?.id ?? null;
      });
    }

    void (async () => {
      const list = await loadSharedAiExamples(scope);
      if (!cancelled) applyList(list);
    })();

    const unsub = subscribeSharedAiExamples(() => {
      void loadSharedAiExamples(scope).then((list) => {
        if (!cancelled) applyList(list);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [exampleKind]);

  const selectedShared = useMemo(
    () => sharedExamples.find((e) => e.id === selectedSharedId) ?? null,
    [sharedExamples, selectedSharedId]
  );

  const activeExampleTemplate = personalTemplate.trim()
    ? personalTemplate.trim()
    : (selectedShared?.text.trim() ?? "");

  const activeExampleName = personalName
    ? personalName
    : selectedShared
      ? selectedShared.name
      : null;

  async function handleExampleFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_EXAMPLE_FILE_BYTES) {
      setError(
        t("formAiFill.exampleTooLarge", "הקובץ גדול מדי (עד 4MB)")
      );
      return;
    }

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      setError(
        t(
          "formAiFill.exampleDocLegacy",
          "קבצי .doc ישנים לא נתמכים — שמרי כ-.docx או PDF או TXT"
        )
      );
      return;
    }

    setExampleLoading(true);
    try {
      // טקסט פשוט — קריאה מקומית
      if (
        lower.endsWith(".txt") ||
        lower.endsWith(".md") ||
        lower.endsWith(".csv") ||
        file.type.startsWith("text/")
      ) {
        const text = (await file.text()).trim();
        if (!text) {
          setError(
            t(
              "formAiFill.exampleEmpty",
              "הקובץ ריק — נסי קובץ עם דוגמת מילוי"
            )
          );
          return;
        }
        setPersonalTemplate(text.slice(0, MAX_EXAMPLE_CHARS));
        setPersonalName(file.name);
        return;
      }

      // Word / PDF — חילוץ בשרת
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

      if (!res.ok) {
        if (res.status === 415) {
          setError(
            t(
              "formAiFill.exampleUnsupported",
              "סוג קובץ לא נתמך — העלי Word (.docx), PDF או TXT"
            )
          );
        } else if (res.status === 413) {
          setError(
            t("formAiFill.exampleTooLarge", "הקובץ גדול מדי (עד 4MB)")
          );
        } else if (res.status === 422) {
          setError(
            t(
              "formAiFill.exampleEmpty",
              "לא נמצא טקסט בקובץ — נסי קובץ אחר"
            )
          );
        } else {
          setError(
            t(
              "formAiFill.exampleReadFailed",
              "לא הצלחתי לקרוא את הקובץ — נסי שוב או העלי TXT"
            )
          );
        }
        return;
      }

      const body = (await res.json()) as { text?: string };
      const text = (body.text ?? "").trim();
      if (!text) {
        setError(
          t(
            "formAiFill.exampleEmpty",
            "לא נמצא טקסט בקובץ — נסי קובץ אחר"
          )
        );
        return;
      }
      setPersonalTemplate(text.slice(0, MAX_EXAMPLE_CHARS));
      setPersonalName(file.name);
    } catch {
      setError(
        t(
          "formAiFill.exampleReadFailed",
          "לא הצלחתי לקרוא את הקובץ — נסי שוב או העלי TXT"
        )
      );
    } finally {
      setExampleLoading(false);
    }
  }

  function clearPersonalExample() {
    setPersonalTemplate("");
    setPersonalName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFill() {
    setError(null);
    setSuccess(null);
    if (prep && !notes.trim()) {
      setError(
        t(
          "formAiFill.prepNotesRequired",
          "הקליטי או כתבי תיאור קצר של התלמיד/ה לפני מילוי AI"
        )
      );
      return;
    }
    setLoading(true);
    const baseline = { ...dataRef.current };
    const session = fillSession.current;
    try {
      const descriptors = buildAiFillFieldDescriptors(schema, baseline);
      const fields = descriptors.map((d) => ({
        ...d,
        currentValue: baseline[d.key] ?? "",
      }));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 115_000);
      let res: Response;
      try {
        res = await fetch("/api/ai/fill-form", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            formId: schema.id,
            formTitle: schema.title,
            categoryFolder: schema.categoryFolder,
            fields,
            studentContext,
            teacherNotes: notes.trim() || undefined,
            exampleTemplate: activeExampleTemplate || undefined,
            studentName: studentName?.trim() || undefined,
            freeAccess: freeAccess || undefined,
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
          setError(t("formAiFill.unauthorized", "יש להתחבר כדי להשתמש ב-AI"));
        } else if (res.status === 429) {
          setError(
            t("formAiFill.rateLimited", "יותר מדי בקשות — נסי שוב בעוד רגע")
          );
        } else if (res.status === 503) {
          setError(t("formAiFill.unavailable", "AI לא זמין כרגע"));
        } else if (res.status === 403) {
          setError(t("formAiFill.notAllowed", "מילוי AI לא זמין לטופס זה"));
        } else if (res.status === 504) {
          setError(
            t("formAiFill.timeout", "המילוי ארך יותר מדי — נסי שוב בעוד רגע")
          );
        } else {
          setError(t("formAiFill.failed", "מילוי הטופס נכשל — נסי שוב"));
        }
        return;
      }

      const body = (await res.json()) as { fields?: Record<string, unknown> };
      const allowed = new Set(descriptors.map((d) => d.key));
      const labelToKey = Object.fromEntries(
        descriptors.map((d) => [d.label, d.key] as const)
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
      const appliedFromMerged: Record<string, string> = {};
      for (const key of Object.keys(patch)) {
        if (allowed.has(key) && merged[key] !== beforeApply[key]) {
          appliedFromMerged[key] = merged[key];
        }
      }
      recordFormAiFillApply(session, appliedFromMerged);
      setSuccess(
        changedCount > 0
          ? t(
              "formAiFill.success",
              "הטיוטה מולאה — עברי על השדות, תקני לפי הצורך ושמרי"
            )
          : t(
              "formAiFill.emptyResult",
              "לא התקבלו הצעות חדשות — נסי להוסיף הנחיה קצרה"
            )
      );
    } catch (error) {
      const aborted =
        error instanceof DOMException
          ? error.name === "AbortError"
          : error instanceof Error &&
            (error.name === "AbortError" || /aborted|timeout/i.test(error.message));
      setError(
        aborted
          ? t("formAiFill.timeout", "המילוי ארך יותר מדי — נסי שוב בעוד רגע")
          : t("formAiFill.failed", "מילוי הטופס נכשל — נסי שוב")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "mt-2 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5",
        className
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-base font-bold text-ink">
            {t("formAiFill.title", "מילוי המסמך בעזרת AI")}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {prep
              ? t(
                  "formAiFill.prepSubtitle",
                  "הקליטי בקול תיאור קצר של התלמיד/ה — ה-AI ינסח את הפרופיל ההוליסטי ואת שאר השדות בדף ההכנה"
                )
              : tachiIntegrative
              ? t(
                  tla
                    ? "formAiFill.tlaIntegrativeSubtitle"
                    : "formAiFill.tachiIntegrativeSubtitle",
                  "מלאי תחום, קו בסיס ומטרות על — ה-AI יציע תוכנית עבודה ודרכי הוראה לצוות"
                )
              : tachi
                ? t(
                    tla
                      ? "formAiFill.tlaSubtitle"
                      : "formAiFill.tachiSubtitle",
                    `כתבי מצב נוכחי ומטרת על, ואז בקשי מה-AI להציע תוכנית עבודה — ותקני לפי הצורך`
                  )
                : t(
                    "formAiFill.subtitle",
                    "לחצי כדי לקבל טיוטה מלאה לשדות הריקים — אפשר גם להוסיף הנחיה קצרה למטה"
                  )}
          </p>
        </div>
      </div>

      {tachi ? (
        <div className="mb-3 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm leading-6 text-ink">
          <p className="font-bold text-brand-800">
            {prep
              ? t(
                  "formAiFill.prepHowTitle",
                  `איך ממלאים דף הכנה ל${planLabel} עם AI`
                )
              : tachiIntegrative
              ? t(
                  tla
                    ? "formAiFill.tlaIntegrativeHowTitle"
                    : "formAiFill.tachiIntegrativeHowTitle",
                  `איך ממלאים ${planLabel} אינטגרטיבי עם AI`
                )
              : t(
                  tla ? "formAiFill.tlaHowTitle" : "formAiFill.tachiHowTitle",
                  `איך ממלאים ${planLabel} עם AI`
                )}
          </p>
          <ol className="mt-1 list-decimal pr-5 text-slate-700">
            <li>
              {prep
                ? t(
                    "formAiFill.prepStep1",
                    "הקליטי בקול (או כתבי) בקצרה מה יודעים על התלמיד/ה"
                  )
                : tachiIntegrative
                ? t(
                    "formAiFill.tachiIntegrativeStep1",
                    "מלאי «תחום», «קו בסיס» ו«מטרות על» בטופס"
                  )
                : t(
                    "formAiFill.tachiStep1",
                    "כתבי «מצב נוכחי» ו«מטרת על» בטופס"
                  )}
            </li>
            <li>
              {prep
                ? t(
                    "formAiFill.prepStep2",
                    "לחצי על מילוי AI — הוא ינסח נתונים סביבתיים, רקע מוגבלות, מוקדי כוח ומוקדים לחיזוק"
                  )
                : tachiIntegrative
                ? t(
                    "formAiFill.tachiIntegrativeStep2",
                    "לחצי על מילוי AI — הוא יציע תוכנית עבודה ודרכי הוראה למחנכת, מורת שילוב, מנחת התנהגות, סייעת ומטפחת רגשית"
                  )
                : t(
                    "formAiFill.tachiStep2",
                    "לחצי על מילוי AI — הוא יציע תוכנית עבודה (יעדים / דרכי הוראה / מעקב)"
                  )}
            </li>
            <li>
              {t(
                "formAiFill.tachiStep3",
                "תקני לפי הצורך ושמרי"
              )}
            </li>
          </ol>
        </div>
      ) : null}

      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-right">
          <label className="block text-xs font-medium text-slate-600">
            {prep
              ? t("formAiFill.prepNotesLabel", "תיאור התלמיד/ה ל-AI")
              : t("formAiFill.notesLabel", "הנחיה ל-AI (אופציונלי)")}
          </label>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            {prep
              ? t(
                  "formAiFill.prepNotesVoiceHint",
                  "לחצי על הרמקול והקליטי — אפשר גם לתקן את הטקסט אחרי ההקלטה"
                )
              : t(
                  "formAiFill.notesVoiceHint",
                  "אפשר גם להקליט הנחיה בקול — לחצי על המיקרופון"
                )}
            {tachi ? (
              <>
                <br />
                {t(
                  "formAiFill.refineFollowUpHint",
                  `אחרי שה${planLabel} מתמלא, אפשר לכתוב ל־AI הנחיה חדשה כדי לעדכן את הניסוח`
                )}
              </>
            ) : null}
          </p>
        </div>
        <VoiceRecordButton
          value={notes}
          fieldLabel={
            prep
              ? t("formAiFill.prepNotesLabel", "תיאור התלמיד/ה ל-AI")
              : t("formAiFill.notesLabel", "הנחיה ל-AI (אופציונלי)")
          }
          onInsert={setNotes}
          disabled={loading}
          size="sm"
          className="self-end sm:self-auto"
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={prep ? 3 : 2}
        disabled={loading}
        placeholder={
          prep
            ? t(
                "formAiFill.prepNotesPlaceholder",
                "למשל: רקע משפחתי מורכב, אבחון ADHD, חוזקות בקריאה חברתית..."
              )
            : tachiIntegrative
            ? t(
                "formAiFill.tachiIntegrativeNotesPlaceholder",
                "למשל: תחום ויסות רגשי; דגש על שיתוף פעולה בין המחנכת למורת השילוב..."
              )
            : tachi
              ? t(
                  "formAiFill.tachiNotesPlaceholder",
                  "למשל: דגש על קריאה וויסות רגשי; הצעי 3–4 יעדים מעשיים..."
                )
              : t(
                  "formAiFill.notesPlaceholder",
                  "למשל: התלמיד מתקשה בקריאה, דגש על ויסות רגשי..."
                )
        }
        className="mb-3 min-h-[56px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
      />

      {!prep ? (
        <div className="mb-3 rounded-lg border border-dashed border-brand-300 bg-white/80 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">
            {t(
              "formAiFill.exampleLabel",
              "דוגמת מילוי ל-AI (אופציונלי)"
            )}
          </p>
          <p className="mb-2 text-[11px] leading-5 text-slate-500">
            {t(
              "formAiFill.exampleHint",
              "הדוגמה מלמדת את ה-AI איך למלא — סגנון, מבנה ורמת פירוט. אם הועלתה דוגמה באזור האישי היא נבחרת אוטומטית"
            )}
          </p>

          <div className="mb-3 rounded-md border border-brand-100 bg-brand-50/60 px-2.5 py-2">
            <p className="mb-1 text-[11px] font-medium text-brand-800">
              {t("formAiFill.exampleSharedLabel", "דוגמה שמורה ל-AI")}
            </p>
            {sharedExamples.length > 0 ? (
              <>
                <p className="mb-2 text-[11px] leading-5 text-slate-500">
                  {t(
                    "formAiFill.exampleSharedHint",
                    "ה-AI משתמש בדוגמה זו כדי למלא טוב יותר — לא להעתקת פרטים אישיים מהדוגמה"
                  )}
                </p>
                {sharedExamples.length === 1 ? (
                  <p className="text-xs font-medium text-ink">
                    {sharedExamples[0].name}
                    {personalName ? " (מוחלפת זמנית)" : ""}
                  </p>
                ) : (
                  <select
                    value={selectedSharedId ?? ""}
                    disabled={loading || Boolean(personalName)}
                    onChange={(e) =>
                      setSelectedSharedId(e.target.value || null)
                    }
                    className="w-full rounded-md border border-brand-200 bg-white px-2 py-1.5 text-xs"
                    aria-label={t(
                      "formAiFill.exampleSharedSelect",
                      "בחירת דוגמה ל-AI"
                    )}
                  >
                    {sharedExamples.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                {t(
                  "formAiFill.exampleSharedNone",
                  "אין עדיין דוגמה לטופס זה — ניתן להעלות באזור האישי"
                )}
              </p>
            )}
          </div>

          <p className="mb-2 text-[11px] font-medium text-slate-600">
            {t(
              "formAiFill.examplePersonalOverride",
              "החלפה זמנית בדוגמה אחרת למילוי זה"
            )}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={EXAMPLE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void handleExampleFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || exampleLoading}
              onClick={() => fileRef.current?.click()}
            >
              {exampleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {exampleLoading
                ? t("formAiFill.exampleReading", "קוראת קובץ...")
                : t("formAiFill.exampleUpload", "העלאת דוגמה למילוי זה")}
            </Button>
            {personalName ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800">
                {personalName}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-brand-200"
                  aria-label="הסרת דוגמה"
                  onClick={clearPersonalExample}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : activeExampleName && !personalName ? (
              <span className="text-[11px] text-slate-500">
                בשימוש: {activeExampleName}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

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
          {loading
            ? t("formAiFill.loading", "ממלאת את המסמך...")
            : prep
              ? t("formAiFill.prepButton", "מילוי בעזרת AI")
              : tachiIntegrative
                ? t(
                    "formAiFill.tachiIntegrativeButton",
                    "הציעי תוכנית עבודה ודרכי הוראה לצוות"
                  )
                : tachi
                  ? t(
                      "formAiFill.tachiButton",
                      "הציעי תוכנית עבודה בעזרת AI"
                    )
                  : t("formAiFill.button", "מלאי את כל המסמך בעזרת AI")}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-center text-sm font-medium text-brand-700">
          {success}
        </p>
      )}

      <p className="mt-4 border-t border-brand-100 pt-3 text-center text-xs leading-relaxed text-slate-500">
        {t(
          "formAiFill.disclaimer",
          "מילוי זה הוא הצעה בלבד בעזרת בינה מלאכותית. האחריות לתוכן המסמך, לדיוקו ולהתאמתו לתלמיד/ה ולמציאות בשטח מוטלת על המורה והצוות הממלאים. יש לעבור על כל השדות, לתקן לפי הצורך ולאשר לפני שמירה."
        )}
      </p>
    </div>
  );
}
