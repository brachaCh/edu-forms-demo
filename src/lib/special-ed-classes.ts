/** כיתות במסגרות חינוך מיוחד — מפתח מחרוזת (class_name) + בעל תל"כ לכל כיתה */

import {
  CLASS_CURRICULUM_CLASS_KEY,
  CLASS_CURRICULUM_NOTE_MARKER,
  classCurriculumDisplayName,
  isClassCurriculumStudent,
} from "@/lib/special-ed-mode";
import {
  DEFAULT_SPECIAL_ED_CLASS_NAME,
  canonicalSpecialEdClassName,
  findClassCurriculumOwnerInList,
  normalizeSpecialEdClassName,
  specialEdClassKeyFromStudent,
  specialEdClassMatchKey,
  uniqueSpecialEdClassNames,
} from "@/lib/special-ed-class-key";
import { getStudents, saveStudent, deleteStudent, getUser } from "@/lib/mock-store";
import { isBillingExemptProfile } from "@/lib/billing-access";
import { isFreeAccessMode } from "@/lib/free-access";
import { checkClassCreateAllowed, PlanLimitError } from "@/lib/plan-limits";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { Category, Student } from "@/lib/supabase/types";

const KNOWN_CLASSES_KEY = "matoah.special-ed-classes";

export {
  DEFAULT_SPECIAL_ED_CLASS_NAME,
  canonicalSpecialEdClassName,
  fallbackSpecialEdClassWhenQuotaBlocks,
  findClassCurriculumOwnerInList,
  liveSpecialEdClassHasKey,
  normalizeSpecialEdClassName,
  resolveSpecialEdImportClassAssignment,
  shouldWriteSpecialEdClassName,
  specialEdClassKeyFromStudent,
  specialEdClassMatchKey,
  uniqueSpecialEdClassNames,
} from "@/lib/special-ed-class-key";
export type { SpecialEdImportClassAssignment } from "@/lib/special-ed-class-key";

function knownClassesStorageKey(category: Category | null | undefined): string {
  return `${KNOWN_CLASSES_KEY}.${category ?? "schools"}`;
}

function readKnownClassNames(category: Category | null | undefined): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(knownClassesStorageKey(category));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueSpecialEdClassNames(
      parsed.map((item) => String(item ?? ""))
    );
  } catch {
    return [];
  }
}

function writeKnownClassNames(
  category: Category | null | undefined,
  names: string[]
): void {
  if (typeof window === "undefined") return;
  try {
    const unique = uniqueSpecialEdClassNames(names).sort((a, b) =>
      a.localeCompare(b, "he")
    );
    window.localStorage.setItem(
      knownClassesStorageKey(category),
      JSON.stringify(unique)
    );
  } catch {
    // ignore
  }
}

export function rememberSpecialEdClassName(
  className: string,
  category: Category | null | undefined = "schools"
): void {
  const name = normalizeSpecialEdClassName(className);
  const current = readKnownClassNames(category);
  const key = specialEdClassMatchKey(name);
  if (current.some((item) => specialEdClassMatchKey(item) === key)) return;
  writeKnownClassNames(category, [...current, name]);
}

export function forgetSpecialEdClassName(
  className: string,
  category: Category | null | undefined = "schools"
): void {
  const key = specialEdClassMatchKey(className);
  writeKnownClassNames(
    category,
    readKnownClassNames(category).filter(
      (item) => specialEdClassMatchKey(item) !== key
    )
  );
}

/** מוחק כיתה ריקה (בלי תלמידים) — כולל בעל תל"כ */
export async function removeEmptySpecialEdClass(
  className: string,
  category: Category | null | undefined = "schools"
): Promise<boolean> {
  if (countStudentsInSpecialEdClass(className, category) > 0) return false;
  forgetSpecialEdClassName(className, category);
  const owner = findClassCurriculumOwner(className, category);
  if (owner) await deleteStudent(owner.id);
  return true;
}

function matchesCategory(
  student: Student,
  category: Category | null | undefined
): boolean {
  if (!category) return true;
  return student.category === category;
}


export function getKnownSpecialEdClassNames(
  category: Category | null | undefined = "schools",
  options?: { includePlaceholder?: boolean }
): string[] {
  const fromStorage = readKnownClassNames(category);
  const fromStudents: string[] = [];
  const liveClassKeys = new Set<string>();

  for (const student of getStudents()) {
    if (student.archived_at) continue;
    if (student.status !== "special-ed-class") continue;
    if (!matchesCategory(student, category)) continue;
    const name = specialEdClassKeyFromStudent(student);
    fromStudents.push(name);
    liveClassKeys.add(specialEdClassMatchKey(name));
  }

  // Drop stale sample aliases (e.g. «ד») once real classes exist; keep empty
  // registered classes that still have a class-curriculum owner.
  const storageNames =
    liveClassKeys.size > 0
      ? fromStorage.filter((name) => {
          const key = specialEdClassMatchKey(name);
          if (liveClassKeys.has(key)) return true;
          return findClassCurriculumOwner(name, category) !== undefined;
        })
      : fromStorage;

  const unique = uniqueSpecialEdClassNames([...storageNames, ...fromStudents]);

  // UI lists keep a default "כיתה" row when the institution has none.
  // Quota / import must not treat that placeholder as a real used class.
  if (unique.length === 0 && options?.includePlaceholder !== false) {
    return [DEFAULT_SPECIAL_ED_CLASS_NAME];
  }

  return unique.sort((a, b) => a.localeCompare(b, "he"));
}

export function countStudentsInSpecialEdClass(
  className: string,
  category: Category | null | undefined = "schools"
): number {
  return listStudentsInSpecialEdClass(className, category).length;
}

/** תלמידי כיתה (ללא בעל תל"כ) — לפי סדר שם */
export function listStudentsInSpecialEdClass(
  className: string,
  category: Category | null | undefined = "schools"
): Student[] {
  const key = specialEdClassMatchKey(className);
  return getStudents()
    .filter((student) => {
      if (student.archived_at) return false;
      if (student.status !== "special-ed-class") return false;
      if (isClassCurriculumStudent(student)) return false;
      if (!matchesCategory(student, category)) return false;
      return specialEdClassMatchKey(specialEdClassKeyFromStudent(student)) === key;
    })
    .sort((a, b) =>
      formatStudentDisplayName(a.full_name).localeCompare(
        formatStudentDisplayName(b.full_name),
        "he"
      )
    );
}

/**
 * יוצר כיתה חדשה (בעל תל"כ) אם עדיין אין.
 * מחזיר את שם הכיתה המנורמל.
 */
export async function addSpecialEdClass(
  className: string,
  category: Category = "schools"
): Promise<string> {
  const name = (className ?? "").trim();
  if (!name) {
    throw new Error("CLASS_NAME_REQUIRED");
  }
  const key = normalizeSpecialEdClassName(name);
  const known = getKnownSpecialEdClassNames(category, {
    includePlaceholder: false,
  });
  const existing = canonicalSpecialEdClassName(key, known);
  if (
    known.some(
      (item) => specialEdClassMatchKey(item) === specialEdClassMatchKey(key)
    )
  ) {
    rememberSpecialEdClassName(existing, category);
    await ensureClassCurriculumOwner(existing, category);
    return existing;
  }
  if (!isFreeAccessMode()) {
    const user = getUser();
    if (user?.plan_id && !isBillingExemptProfile(user)) {
      const violation = checkClassCreateAllowed({
        planId: user.plan_id,
        institutionType: user.institution_type ?? category,
        educationFramework: user.education_framework ?? null,
        students: getStudents(),
        className: key,
        knownClassNames: getKnownSpecialEdClassNames(category, {
          includePlaceholder: false,
        }),
        planCustomClasses: user.plan_custom_classes ?? null,
        planCustomStudents: user.plan_custom_students ?? null,
      });
      if (violation) throw new PlanLimitError(violation);
    }
  }
  rememberSpecialEdClassName(key, category);
  await ensureClassCurriculumOwner(key, category);
  return key;
}

export function findClassCurriculumOwner(
  classKey: string,
  category: Category | null | undefined = "schools"
): Student | undefined {
  return findClassCurriculumOwnerInList(getStudents(), classKey, category);
}

/** בעל תל"כ לכיתה ספציפית */
export async function ensureClassCurriculumOwner(
  classKey: string,
  category: Category | null | undefined = "schools"
): Promise<Student> {
  const key = normalizeSpecialEdClassName(classKey);
  const display = classCurriculumDisplayName(key);
  const existing = findClassCurriculumOwner(key, category);
  if (existing) {
    rememberSpecialEdClassName(key, category);
    return existing;
  }

  // תאימות: בעל תל"כ גלובלי ישן ("כיתה") בלי class_name
  if (key === DEFAULT_SPECIAL_ED_CLASS_NAME) {
    const legacy = getStudents().find(
      (student) =>
        isClassCurriculumStudent(student) &&
        matchesCategory(student, category) &&
        (student.teacher_name?.trim() === CLASS_CURRICULUM_CLASS_KEY ||
          !student.class_name?.trim())
    );
    if (legacy) {
      rememberSpecialEdClassName(key, category);
      return legacy;
    }
  }

  const created = await saveStudent({
    category: category ?? "schools",
    full_name: display,
    teacher_name: key,
    class_name: key,
    status: "special-ed-class",
    notes: CLASS_CURRICULUM_NOTE_MARKER,
    phone: null,
    father_name: null,
    mother_name: null,
    id_number: null,
    birth_date: null,
    gender: null,
    home_address: null,
    city: null,
    father_mobile: null,
    mother_mobile: null,
    email: null,
    calendar_year: null,
    integration_frequency: null,
  });
  rememberSpecialEdClassName(key, category);
  return created;
}

export function studentMatchesSpecialEdClass(
  student: Student,
  className: string
): boolean {
  return (
    specialEdClassMatchKey(specialEdClassKeyFromStudent(student)) ===
    specialEdClassMatchKey(className)
  );
}

export type SpecialEdClassOperationResult =
  | { ok: true }
  | { ok: false; failures: string[] };

export interface SpecialEdClassOperationDeps {
  deleteStudent: (id: string) => Promise<void>;
  archiveStudentFile?: (student: Student) => Promise<{ ok: boolean }>;
}

/**
 * מוחק כיתת חינוך מיוחד עם תלמידים.
 * מוחק קודם את כל התלמידים, ורק בהצלחה מלאה מוחק את בעל התל״כ ושוכח את שם הכיתה.
 * בכישלון חלקי — לא מוחק את הבעלים ולא שוכח את השם.
 */
export async function deleteSpecialEdClassWithStudents(
  className: string,
  category: Category | null | undefined,
  deps: SpecialEdClassOperationDeps
): Promise<SpecialEdClassOperationResult> {
  const cat = category ?? "schools";
  const students = listStudentsInSpecialEdClass(className, cat);
  const failures: string[] = [];

  for (const student of students) {
    try {
      await deps.deleteStudent(student.id);
    } catch {
      failures.push(student.full_name ?? student.id);
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const owner = findClassCurriculumOwner(className, cat);
  if (owner) {
    try {
      await deps.deleteStudent(owner.id);
    } catch {
      return { ok: false, failures: ["בעל תל״כ"] };
    }
  }

  forgetSpecialEdClassName(className, cat);
  return { ok: true };
}

/**
 * מעביר כיתת חינוך מיוחד לארכיון.
 * מעביר קודם את כל התלמידים לארכיון, ורק בהצלחה מלאה מוחק את בעל התל״כ ושוכח את שם הכיתה.
 * בכישלון חלקי — לא מוחק את הבעלים ולא שוכח את השם.
 */
export async function archiveSpecialEdClass(
  className: string,
  category: Category | null | undefined,
  deps: SpecialEdClassOperationDeps
): Promise<SpecialEdClassOperationResult> {
  if (!deps.archiveStudentFile) {
    return { ok: false, failures: ["archiveStudentFile not provided"] };
  }
  const cat = category ?? "schools";
  const students = listStudentsInSpecialEdClass(className, cat);
  const failures: string[] = [];

  for (const student of students) {
    const result = await deps.archiveStudentFile(student);
    if (!result.ok) {
      failures.push(student.full_name ?? student.id);
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const owner = findClassCurriculumOwner(className, cat);
  if (owner) {
    try {
      await deps.deleteStudent(owner.id);
    } catch {
      return { ok: false, failures: ["בעל תל״כ"] };
    }
  }

  forgetSpecialEdClassName(className, cat);
  return { ok: true };
}
