import {
  STUDENT_PLACEHOLDER,
  studentNamePartsForAi,
  studentNameTokenPromptLines,
} from "@/lib/ai-student-placeholder";

/** הקשר לסידור תמלול קולי — מגדר, טופס, ושם למיסוך/שחזור בשרת בלבד */

export type VoiceRefineContext = {
  studentGender?: string;
  formId?: string;
  formTitle?: string;
  /**
   * שם מהכרטיס — נשלח רק ל־/api/ai/refine-transcript לצורך מיסוך ושחזור שם פרטי.
   * לא נכנס לפרומפט ולא נשלח למודל.
   */
  studentName?: string;
};

export function buildVoiceRefineContext(input: {
  studentName?: string | null;
  studentGender?: string | null;
  formId?: string | null;
  formTitle?: string | null;
}): VoiceRefineContext | undefined {
  const studentName = input.studentName?.trim() ?? "";
  const studentGender = input.studentGender?.trim() ?? "";
  const formId = input.formId?.trim() ?? "";
  const formTitle = input.formTitle?.trim() ?? "";
  if (!studentName && !studentGender && !formId && !formTitle) return undefined;
  return {
    studentName: studentName || undefined,
    studentGender: studentGender || undefined,
    formId: formId || undefined,
    formTitle: formTitle || undefined,
  };
}

/**
 * מצב האסימון כשיש שם פרטי או משפחה למיסוך.
 * בלי שם בר-שימוש — נשארים על «התלמיד/ה» ולא טוענים ששמות הוסוו
 * (טלפון/ת.ז. עדיין מנוקים ב־prepareTranscriptForAi).
 */
export function voiceRefineUsesPlaceholder(
  ctx?: Pick<VoiceRefineContext, "studentName">
): boolean {
  const parts = studentNamePartsForAi(ctx?.studentName);
  return Boolean(parts.firstName || parts.lastName);
}

/** הוראות נוספות ל-system prompt של refine-transcript — בלי שם אמיתי */
export function voiceRefinePromptLines(ctx?: VoiceRefineContext): string[] {
  if (!ctx) return [];
  const lines: string[] = [];
  const usePlaceholder = voiceRefineUsesPlaceholder(ctx);

  if (usePlaceholder) {
    lines.push(
      ...studentNameTokenPromptLines(),
      "אל תכתוב בגוף ראשון כאילו התלמיד/ה מדבר/ת בעצמו/ה."
    );
  } else {
    lines.push(
      "כל התייחסות לתלמיד/ה תהיה ב«התלמיד» / «התלמידה» בגוף שלישי מקצועי — בלי שם פרטי.",
      "אם בתמלול מופיע שם או פרט מזהה — החלף ב«התלמיד/ה» ואל תעתיק את הפרט המזהה.",
      "אל תכתוב בגוף ראשון כאילו התלמיד/ה מדבר/ת בעצמו/ה."
    );
  }

  if (ctx.studentGender === "ז") {
    lines.push(
      usePlaceholder
        ? `התאם פעלים ותארים לזכר (למשל "${STUDENT_PLACEHOLDER} מפגין").`
        : 'התאם פעלים ותארים לזכר ("התלמיד", "מפגין").'
    );
  } else if (ctx.studentGender === "נ") {
    lines.push(
      usePlaceholder
        ? `התאם פעלים ותארים לנקבה (למשל "${STUDENT_PLACEHOLDER} מפגינה").`
        : 'התאם פעלים ותארים לנקבה ("התלמידה", "מפגינה").'
    );
  }

  if (ctx.formId === "expert-guidance") {
    lines.push(
      "זהו סיכום הדרכת מומחית תחום — נסח כתיעוד מקצועי של ההדרכה על התלמיד/ה, מנקודת מבט של הצוות/המומחית, לא מנקודת מבטו/ה של התלמיד/ה."
    );
  } else if (
    ctx.formId === "staff-meetings" ||
    ctx.formId === "parent-conversations" ||
    ctx.formId === "external-correspondence"
  ) {
    lines.push(
      "נסח כתיעוד מקצועי של ישיבה/שיחה/תכתוב — מנקודת מבט של הצוות, לא מנקודת מבט התלמיד/ה."
    );
  }

  if (ctx.formTitle) {
    lines.push(`הטופס: ${ctx.formTitle}.`);
  }

  return lines;
}
