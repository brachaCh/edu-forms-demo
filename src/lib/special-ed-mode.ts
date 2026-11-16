/** מצבי ניהול כיתת חינוך מיוחד — לפי תרשים: תיק תלמיד | תל"כ */

import type { Student } from "@/lib/supabase/types";

export const SPECIAL_ED_MODES = ["student", "curriculum"] as const;
export type SpecialEdMode = (typeof SPECIAL_ED_MODES)[number];

/** סימון ב-notes של רשומת «בעל תל"כ» — לא מוצגת ברשימת תלמידים */
export const CLASS_CURRICULUM_NOTE_MARKER = "__matoah_class_curriculum__";

/** בעל תל"כ ברמת הכיתה (בלי בחירת מחנכת) */
export const CLASS_CURRICULUM_CLASS_KEY = "כיתה";

export function isSpecialEdMode(value: string): value is SpecialEdMode {
  return (SPECIAL_ED_MODES as readonly string[]).includes(value);
}

export function isClassCurriculumStudent(
  student: Pick<Student, "notes" | "full_name"> | null | undefined
): boolean {
  if (!student) return false;
  if (student.notes?.includes(CLASS_CURRICULUM_NOTE_MARKER)) return true;
  const name = student.full_name?.trim() ?? "";
  return name.startsWith('תל"כ —') || name.startsWith("תל״כ —");
}

export function classCurriculumDisplayName(
  ownerKey: string = CLASS_CURRICULUM_CLASS_KEY
): string {
  return `תל"כ — ${ownerKey.trim() || CLASS_CURRICULUM_CLASS_KEY}`;
}
