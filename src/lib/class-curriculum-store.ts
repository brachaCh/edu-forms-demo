/**
 * רשומת «בעל תל"כ» ברמת הכיתה — מאחסנת טפסי תל"כ בלי להופיע ברשימת התלמידים.
 */

import {
  DEFAULT_SPECIAL_ED_CLASS_NAME,
  ensureClassCurriculumOwner,
} from "@/lib/special-ed-classes";
import type { Category, Student } from "@/lib/supabase/types";

/**
 * מחזיר בעל תל"כ לכיתה.
 * @param classKeyOrTeacher — שם כיתה (או מפתח ישן); ברירת מחדל «כיתה»
 */
export async function ensureClassCurriculumStudent(
  classKeyOrTeacher?: string | null,
  opts?: { category?: Category | null }
): Promise<Student> {
  const category = opts?.category ?? null;
  const classKey =
    (classKeyOrTeacher ?? "").trim() || DEFAULT_SPECIAL_ED_CLASS_NAME;
  return ensureClassCurriculumOwner(classKey, category);
}
