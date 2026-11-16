"use client";

/**
 * כפתור הקלטה קולית לשדות טקסט ארוכים בתיק תלמיד.
 * - הדפדפן מתמלל עברית באמצעות Web Speech API (חינם, ללא מפתח).
 * - בסיום (ברירת מחדל), התמלול הגולמי נשלח ל-/api/ai/refine-transcript
 *   שם Claude מסדר את הטקסט ומחזיר טקסט מסודר לשדה.
 * - עם refineTranscript={false}: נשמר התמלול הגולמי בלי סידור AI
 *   (למשל שאלון הורים).
 * - אם AI לא זמין: התמלול הגולמי נשמר כפי שהוא.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { cn } from "@/lib/utils";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";

// ------- טיפוסי Web Speech API (חסרים ב-lib.dom.d.ts) -------

interface SpeechAlternative {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  0: SpeechAlternative;
  [index: number]: SpeechAlternative;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ------- הרכיב -------

type RecordState = "idle" | "recording" | "refining";

export interface VoiceRecordButtonProps {
  value: string;
  onInsert: (text: string) => void;
  fieldLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  /** false = רק תמלול גולמי, בלי סידור AI (למשל שאלון הורים) */
  refineTranscript?: boolean;
  /** מגדר, טופס ושם למיסוך/שחזור בשרת — השם עצמו לא נשלח למודל */
  refineContext?: VoiceRefineContext;
  /** נקרא אחרי שהתמלול נכנס לשדה (כולל אחרי סידור AI) */
  onAfterInsert?: (text: string) => void | Promise<void>;
}

export function VoiceRecordButton({
  value,
  onInsert,
  fieldLabel,
  disabled = false,
  className,
  size = "md",
  refineTranscript = true,
  refineContext,
  onAfterInsert,
}: VoiceRecordButtonProps) {
  const { texts } = useSiteText();
  const t = useCallback(
    (key: string, fallback: string) =>
      getTextByPath(texts, `voiceRecorder.${key}`) || fallback,
    [texts]
  );

  const [state, setState] = useState<RecordState>("idle");
  // מתחילים false בשרת ובלקוח (מונע hydration mismatch) — לאחר mount
  // מזהים בפועל אם הדפדפן תומך ומעדכנים.
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");
  /** בסיס השדה בתחילת ההקלטה — לא משתנה בגלל תצוגה חיה (מונע כפילות) */
  const sessionBaseRef = useRef<string>("");
  const interimRef = useRef<string>("");
  // מעקב אחרי הטקסט האחרון שאנחנו הזרקנו לשדה — משמש לזיהוי כתיבה
  // ידנית של המשתמש בזמן ההקלטה, כדי לא לדרוס אותה.
  const lastInsertedRef = useRef<string>("");
  // ref מסונכרן ל-value האחרון (prop) — נדרש כי startRecording נסגר על
  // הערך של הפעם הראשונה, בזמן ש-flushLive ורפיין קוראים באמצע ההקלטה.
  const valueRef = useRef<string>(value);
  const pendingInterimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastFinalChunkRef = useRef<string>("");

  // סנכרן את ה-ref בכל render, בלי לגרום ל-re-render של startRecording.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    // בדיקת תמיכה רק בלקוח — נמנע מ-hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      if (pendingInterimTimerRef.current) {
        clearTimeout(pendingInterimTimerRef.current);
        pendingInterimTimerRef.current = null;
      }
    };
  }, []);

  const liveTranscript = useCallback((): string => {
    return `${finalTranscriptRef.current} ${interimRef.current}`.trim();
  }, []);

  /**
   * מרכיב את ערך השדה מ־בסיס תחילת ההקלטה + התמלול.
   * לא מוסיפים את התמלול מעל טקסט שכבר כולל את התצוגה החיה — זה גרם לכפילות.
   */
  const composeCurrent = useCallback((extra: string): string => {
    const current = valueRef.current;
    const live = liveTranscript();

    // המשתמש ערך ידנית בזמן ההקלטה
    if (current !== lastInsertedRef.current) {
      if (live && current.endsWith(live)) {
        sessionBaseRef.current = current
          .slice(0, current.length - live.length)
          .trimEnd();
      } else {
        sessionBaseRef.current = current;
      }
    }

    const base = sessionBaseRef.current;
    const sep = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
    const next = `${base}${sep}${extra}`.trimEnd();
    lastInsertedRef.current = next;
    return next;
  }, [liveTranscript]);

  const refine = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setState("idle");
        return;
      }
      const composed = composeCurrent(trimmed);

      async function commit(finalText: string) {
        if (valueRef.current !== finalText) {
          onInsert(finalText);
        }
        await onAfterInsert?.(finalText);
      }

      if (!refineTranscript) {
        await commit(composed);
        setState("idle");
        return;
      }
      setState("refining");
      setHint(null);
      try {
        const res = await fetch("/api/ai/refine-transcript", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            fieldLabel,
            studentName: refineContext?.studentName,
            studentGender: refineContext?.studentGender,
            formId: refineContext?.formId,
            formTitle: refineContext?.formTitle,
          }),
        });
        if (!res.ok) {
          if (res.status === 401) {
            setHint(t("aiUnauthorized", "יש להתחבר כדי להשתמש ב-AI"));
          } else if (res.status === 429) {
            setHint(t("aiRateLimited", "יותר מדי בקשות — נסה שוב בעוד רגע"));
          } else if (res.status === 503) {
            setHint(
              t(
                "aiUnavailable",
                "AI לא זמין — נשמר תמלול גולמי (חסר מפתח בשרת)"
              )
            );
          } else if (res.status === 504) {
            setHint(
              t("aiTimeout", "סידור AI ארך יותר מדי — נשמר תמלול גולמי")
            );
          } else {
            setHint(t("aiUnavailable", "AI לא זמין — נשמר תמלול גולמי"));
          }
          await commit(valueRef.current.trim() || composed);
          setState("idle");
          return;
        }
        const data = (await res.json()) as { text?: string };
        const cleaned = (data.text ?? "").trim();
        if (cleaned) {
          await commit(composeCurrent(cleaned));
        } else {
          await commit(valueRef.current.trim() || composed);
        }
      } catch {
        setHint(t("aiUnavailable", "AI לא זמין — נשמר תמלול גולמי"));
        await commit(valueRef.current.trim() || composed);
      } finally {
        setState("idle");
      }
    },
    [
      composeCurrent,
      fieldLabel,
      onAfterInsert,
      onInsert,
      refineContext,
      refineTranscript,
      t,
    ]
  );

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const startRecording = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(t("browserUnsupported", "ההקלטה לא נתמכת בדפדפן זה"));
      return;
    }
    setError(null);
    setHint(null);
    finalTranscriptRef.current = "";
    interimRef.current = "";
    lastFinalChunkRef.current = "";
    // הבסיס להקלטה = מה שהמשתמש כבר הקליד בשדה עד רגע הלחיצה.
    sessionBaseRef.current = valueRef.current;
    lastInsertedRef.current = valueRef.current;
    if (pendingInterimTimerRef.current) {
      clearTimeout(pendingInterimTimerRef.current);
      pendingInterimTimerRef.current = null;
    }

    const recognition = new Ctor();
    recognition.lang = "he-IL";
    recognition.continuous = true;
    recognition.interimResults = true;

    /**
     * דוחה עדכון interim (תוצאה זמנית) בכ-180ms כדי שלא נכתוב עשרות
     * setState בשנייה על כל תו שדפדפן מזהה.
     */
    const flushLive = () => {
      pendingInterimTimerRef.current = null;
      const live = liveTranscript();
      if (live) onInsert(composeCurrent(live));
    };

    recognition.onresult = (event) => {
      let interim = "";
      let gotFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          const piece = alt.transcript.trim();
          // Chrome לפעמים שולח את אותו משפט סופי פעמיים ב־continuous
          if (
            piece &&
            piece !== lastFinalChunkRef.current &&
            !finalTranscriptRef.current.endsWith(piece)
          ) {
            finalTranscriptRef.current =
              `${finalTranscriptRef.current} ${piece}`.trim();
            lastFinalChunkRef.current = piece;
            gotFinal = true;
          }
        } else {
          interim = `${interim} ${alt.transcript}`.trim();
        }
      }
      interimRef.current = interim;

      // final → מעדכנים מיד (הטקסט התייצב).
      // interim → מדחים ל-180ms כדי להימנע מסטריטים של עדכונים.
      if (gotFinal) {
        if (pendingInterimTimerRef.current) {
          clearTimeout(pendingInterimTimerRef.current);
          pendingInterimTimerRef.current = null;
        }
        flushLive();
      } else if (!pendingInterimTimerRef.current) {
        pendingInterimTimerRef.current = setTimeout(flushLive, 180);
      }
    };

    recognition.onerror = (event) => {
      const code = event.error || "";
      if (code === "no-speech") {
        setHint(t("noSpeech", "לא זוהה דיבור"));
      } else if (code === "not-allowed" || code === "service-not-allowed") {
        setError(t("micNotAllowed", "אין הרשאה למיקרופון"));
      } else if (code === "audio-capture") {
        setError(t("micMissing", "לא נמצא מיקרופון"));
      } else if (code === "aborted") {
        // המשתמש עצר — לא צריך להראות שגיאה
      } else if (code) {
        setError(t("genericError", "שגיאה בהקלטה"));
      }
    };

    recognition.onend = () => {
      if (pendingInterimTimerRef.current) {
        clearTimeout(pendingInterimTimerRef.current);
        pendingInterimTimerRef.current = null;
      }
      const raw = liveTranscript();
      recognitionRef.current = null;
      if (raw) {
        void refine(raw);
      } else {
        setState("idle");
      }
    };

    recognition.onstart = () => {
      setState("recording");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError(t("genericError", "שגיאה בהקלטה"));
      recognitionRef.current = null;
      setState("idle");
    }
    // אין תלות ב-`value` — משתמשים ב-valueRef כדי לא ליצור מחדש את
    // הפונקציה בכל הקשה.
  }, [composeCurrent, liveTranscript, onInsert, refine, t]);

  if (!supported) {
    return null;
  }

  const isRecording = state === "recording";
  const isRefining = state === "refining";
  const compact = size === "sm";

  const actionLabel = isRecording
    ? t("stopRecording", "עצירה")
    : isRefining
      ? t("refining", "מסדרת לך את הטקסט...")
      : t("startRecording", "הקליטי");
  const slogan = t("slogan", "הקליטי — ותהני");
  const idleLabel = compact ? actionLabel : slogan;

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        compact ? "items-center" : "items-stretch sm:items-end",
        className
      )}
    >
      <button
        type="button"
        title={isRecording || isRefining ? actionLabel : idleLabel}
        aria-label={isRecording || isRefining ? actionLabel : idleLabel}
        disabled={disabled || isRefining}
        onClick={() => {
          if (isRecording) stopRecording();
          else if (state === "idle") startRecording();
        }}
        className={cn(
          "inline-flex items-center justify-center transition-all disabled:opacity-50",
          compact
            ? "h-8 w-8 shrink-0 rounded-full shadow-sm"
            : "min-h-11 gap-2 rounded-xl px-3.5 py-2 text-sm font-bold shadow-sm sm:min-h-12 sm:px-4",
          isRecording
            ? "animate-pulse bg-red-600 text-white ring-2 ring-red-300"
            : isRefining
              ? "bg-red-400 text-white"
              : "bg-red-600 text-white hover:bg-red-500 hover:shadow-md"
        )}
      >
        {isRefining ? (
          <Loader2
            className={cn("animate-spin", compact ? "h-4 w-4" : "h-5 w-5")}
          />
        ) : isRecording ? (
          <Square
            className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")}
            fill="currentColor"
          />
        ) : (
          <Mic className={cn(compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={2.4} />
        )}
        {!compact && (
          <span className="leading-tight">
            {isRecording || isRefining ? actionLabel : slogan}
          </span>
        )}
      </button>
      {(error || hint) && (
        <span
          className={cn(
            "max-w-[8rem] text-[10px] leading-tight",
            error ? "text-red-600" : "text-slate-500"
          )}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

/** באנר שיווקי בראש טופס — מדגיש את המקליט */
export function VoiceRecorderPromoBanner({
  className,
}: {
  className?: string;
}) {
  const { texts } = useSiteText();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  if (!supported) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 border-red-200 bg-gradient-to-l from-red-600 via-red-500 to-rose-500 px-4 py-3 text-white shadow-lg sm:px-5 sm:py-4",
        className
      )}
    >
      <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-red-600 shadow-md sm:h-16 sm:w-16">
          <Mic className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-lg font-black tracking-tight sm:text-2xl">
            {getTextByPath(texts, "voiceRecorder.promoTitle") ||
              "הקליטי — ותהני 🎙️"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-white/90 sm:text-sm">
            {getTextByPath(texts, "voiceRecorder.promoSubtitle") ||
              "לחצי על המיקרופון האדום ליד שדה טקסט — דברי בעברית, ואנחנו נסדר את הניסוח בשבילך"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ------- כפתור ניסוח לטקסט מוקלד -------

export interface TypedTextRefineButtonProps {
  value: string;
  onInsert: (text: string) => void;
  fieldLabel?: string;
  disabled?: boolean;
  className?: string;
  refineContext?: VoiceRefineContext;
  onAfterInsert?: (text: string) => void | Promise<void>;
}

const REFINE_MAX_CHARS = 2000;

export function TypedTextRefineButton({
  value,
  onInsert,
  fieldLabel,
  disabled = false,
  className,
  refineContext,
  onAfterInsert,
}: TypedTextRefineButtonProps) {
  const { texts } = useSiteText();
  const t = useCallback(
    (key: string, fallback: string) =>
      getTextByPath(texts, `voiceRecorder.${key}`) || fallback,
    [texts]
  );

  const [isRefining, setIsRefining] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const valueRef = useRef<string>(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const refine = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (trimmed.length > REFINE_MAX_CHARS) {
      setHint(
        t("refineTooLong", "הטקסט ארוך מדי לניסוח — עד 2000 תווים")
      );
      return;
    }

    const sentText = trimmed;
    setIsRefining(true);
    setHint(null);

    try {
      const res = await fetch("/api/ai/refine-transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          fieldLabel,
          studentName: refineContext?.studentName,
          studentGender: refineContext?.studentGender,
          formId: refineContext?.formId,
          formTitle: refineContext?.formTitle,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setHint(t("aiUnauthorized", "יש להתחבר כדי להשתמש ב-AI"));
        } else if (res.status === 429) {
          setHint(t("aiRateLimited", "יותר מדי בקשות — נסה שוב בעוד רגע"));
        } else if (res.status === 503) {
          setHint(t("refineTypedUnavailable", "הניסוח לא זמין כרגע"));
        } else if (res.status === 504) {
          setHint(
            t("refineTypedTimeout", "הניסוח ארך יותר מדי — נסה שוב")
          );
        } else {
          setHint(t("refineTypedFailed", "הניסוח נכשל — נסה שוב"));
        }
        return;
      }

      const data = (await res.json()) as { text?: string };
      const cleaned = (data.text ?? "").trim();

      if (!cleaned) {
        setHint(t("refineTypedEmpty", "לא התקבלו שינויים מה-AI"));
        return;
      }

      const currentValue = valueRef.current.trim();
      if (currentValue !== sentText) {
        setHint(
          t("refineTypedChanged", "השדה השתנה בזמן הניסוח — לא הוחלף")
        );
        return;
      }

      onInsert(cleaned);
      await onAfterInsert?.(cleaned);
    } catch {
      setHint(t("refineTypedFailed", "הניסוח נכשל — נסה שוב"));
    } finally {
      setIsRefining(false);
    }
  }, [value, fieldLabel, refineContext, onInsert, onAfterInsert, t]);

  const hasContent = value.trim().length > 0;
  const tooLong = value.trim().length > REFINE_MAX_CHARS;

  return (
    <div className={cn("flex flex-col gap-1 items-end", className)}>
      <button
        type="button"
        aria-label={t("refineTyped", "נסחי לי")}
        disabled={disabled || isRefining || !hasContent || tooLong}
        title={
          tooLong
            ? t("refineTooLong", "הטקסט ארוך מדי לניסוח — עד 2000 תווים")
            : t("refineTyped", "נסחי לי")
        }
        onClick={refine}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
          "bg-brand-100 text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        )}
      >
        {isRefining ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        <span>{isRefining ? t("refining", "מנסח...") : t("refineTyped", "נסחי לי")}</span>
      </button>
      {hint && (
        <span className="max-w-[14rem] text-end text-[10px] leading-tight text-slate-500">
          {hint}
        </span>
      )}
    </div>
  );
}
