/** מפתחות כיתת חינוך מיוחד — פונקציות טהורות בלי תלות ב־mock-store */

import {
  CLASS_CURRICULUM_CLASS_KEY,
  isClassCurriculumStudent,
} from "@/lib/special-ed-mode";
import type { Category, Student } from "@/lib/supabase/types";

export const DEFAULT_SPECIAL_ED_CLASS_NAME = CLASS_CURRICULUM_CLASS_KEY;

export function normalizeSpecialEdClassName(
  value: string | null | undefined
): string {
  const trimmed = (value ?? "").trim();
  return trimmed || DEFAULT_SPECIAL_ED_CLASS_NAME;
}

/**
 * Equality key for special-ed class names.
 * "ד", "ד'", "ד׳", "ד״" and "כיתה ד" all collapse to the same key so an
 * existing class is not counted as a new one during import / quota checks.
 * Display names stay as stored — this is matching only.
 */
export function specialEdClassMatchKey(
  value: string | null | undefined
): string {
  const stripped = (value ?? "")
    .trim()
    .replace(/['`ʹʻʼˈ׳״"“”′]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(כיתה|כתה)\s+/u, "")
    .replace(/\s+/g, "");
  return stripped || DEFAULT_SPECIAL_ED_CLASS_NAME;
}

/** First known display name that matches `value`, otherwise the trimmed name. */
export function canonicalSpecialEdClassName(
  value: string | null | undefined,
  knownNames: Iterable<string>
): string {
  const display = normalizeSpecialEdClassName(value);
  const key = specialEdClassMatchKey(display);
  for (const name of knownNames) {
    if (specialEdClassMatchKey(name) === key) {
      return normalizeSpecialEdClassName(name);
    }
  }
  return display;
}

export interface SpecialEdImportClassAssignment {
  className: string | null;
  /** Excel class label when it was remapped onto an existing / selected class. */
  mappedFrom: string | null;
}

/**
 * Decide which class an import row belongs to.
 *
 * Known aliases (ד / כיתה ד׳) stay on that class. An unknown Excel name is
 * assigned to `defaultClassName` when the user is importing into a specific
 * class — sample files ship with «ד» while the school class may be «איידי».
 */
/** True when a non-archived special-ed row already uses this class match key. */
export function liveSpecialEdClassHasKey(
  students: Pick<
    Student,
    | "archived_at"
    | "status"
    | "notes"
    | "full_name"
    | "teacher_name"
    | "class_name"
  >[],
  classKey: string
): boolean {
  return students.some((student) => {
    if (student.archived_at) return false;
    if (student.status !== "special-ed-class") return false;
    return specialEdClassMatchKey(specialEdClassKeyFromStudent(student)) === classKey;
  });
}

/** Exact display-name match only — not grade/alias keys (א ≠ כיתה א). */
function findExactKnownClassName(
  rawExcel: string,
  names: Iterable<string>
): string | null {
  const trimmed = rawExcel.trim();
  if (!trimmed) return null;
  for (const name of names) {
    if (name.trim() === trimmed) {
      return normalizeSpecialEdClassName(name);
    }
  }
  return null;
}

/**
 * Whether an import/form may change a special-ed student's stored class_name.
 * Blocks grade-level / alias keys from moving students between classes.
 */
export function shouldWriteSpecialEdClassName(input: {
  existingClassName: string | null | undefined;
  incomingClassName: string | null | undefined;
  defaultClassName?: string | null;
  knownClassNames?: Iterable<string>;
}): boolean {
  const incoming = (input.incomingClassName ?? "").trim();
  if (!incoming) return false;
  const existing = (input.existingClassName ?? "").trim();
  if (!existing) return true;

  if (incoming === existing) return true;

  const inKey = specialEdClassMatchKey(incoming);
  const exKey = specialEdClassMatchKey(existing);
  if (inKey === exKey) return true;

  if (input.knownClassNames) {
    const exact = findExactKnownClassName(incoming, input.knownClassNames);
    if (exact) return true;
  }

  if (input.defaultClassName?.trim()) {
    const defKey = specialEdClassMatchKey(input.defaultClassName);
    if (inKey === defKey) return true;
    return false;
  }

  return false;
}

export function resolveSpecialEdImportClassAssignment(input: {
  excelClassName: string | null | undefined;
  defaultClassName: string | null | undefined;
  knownClassNames: Iterable<string>;
  /** When set, only these names count as an existing class (stale localStorage ignored). */
  liveClassNames?: Iterable<string>;
}): SpecialEdImportClassAssignment {
  const known = Array.from(input.knownClassNames);
  const liveKnown = input.liveClassNames
    ? Array.from(input.liveClassNames)
    : known;
  const rawExcel = (input.excelClassName ?? "").trim();
  const defaultRaw = (input.defaultClassName ?? "").trim();
  const defaultDisplay = defaultRaw
    ? canonicalSpecialEdClassName(defaultRaw, known)
    : null;

  if (!rawExcel) {
    return { className: defaultDisplay, mappedFrom: null };
  }

  const excelDisplay = canonicalSpecialEdClassName(rawExcel, known);
  const excelKey = specialEdClassMatchKey(excelDisplay);

  // Import from a specific class page: never route rows to another class
  // because the «כיתה» cell holds a grade (א/ב) or a sample alias (ד).
  if (defaultDisplay) {
    const exact = findExactKnownClassName(rawExcel, liveKnown);
    if (exact) {
      return { className: exact, mappedFrom: null };
    }
    if (specialEdClassMatchKey(defaultDisplay) === excelKey) {
      return { className: defaultDisplay, mappedFrom: null };
    }
    return { className: defaultDisplay, mappedFrom: rawExcel };
  }

  if (liveKnown.some((name) => specialEdClassMatchKey(name) === excelKey)) {
    return { className: excelDisplay, mappedFrom: null };
  }

  return { className: excelDisplay, mappedFrom: null };
}

/**
 * When creating the Excel class would exceed the package quota and exactly
 * one real class already exists, put the rows in that class instead of
 * rejecting the file (Giti's 1-class package + sample column «ד»).
 */
export function fallbackSpecialEdClassWhenQuotaBlocks(input: {
  requestedClassName: string | null | undefined;
  knownClassNames: Iterable<string>;
}): string | null {
  const unique = uniqueSpecialEdClassNames(input.knownClassNames);
  if (unique.length !== 1) return null;
  const only = unique[0];
  const requested = (input.requestedClassName ?? "").trim();
  if (
    requested &&
    specialEdClassMatchKey(only) === specialEdClassMatchKey(requested)
  ) {
    return null;
  }
  return only;
}

/**
 * Collapse equivalent spellings (ד / כיתה ד׳) to the first display name.
 * List, remember, forget, and add must share this so aliases cannot split quota.
 */
export function uniqueSpecialEdClassNames(
  names: Iterable<string>
): string[] {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const display = normalizeSpecialEdClassName(name);
    const key = specialEdClassMatchKey(display);
    if (!byKey.has(key)) {
      byKey.set(key, display);
    }
  }
  return Array.from(byKey.values());
}

function matchesCategory(
  student: Pick<Student, "category">,
  category: Category | null | undefined
): boolean {
  if (!category) return true;
  return student.category === category;
}

/** מפתח כיתה מבעל תל"כ או מתלמיד */
export function specialEdClassKeyFromStudent(
  student: Pick<Student, "notes" | "full_name" | "teacher_name" | "class_name">
): string {
  if (isClassCurriculumStudent(student)) {
    const fromTeacher = student.teacher_name?.trim();
    if (fromTeacher) return normalizeSpecialEdClassName(fromTeacher);
    const fromClass = student.class_name?.trim();
    if (fromClass) return normalizeSpecialEdClassName(fromClass);
    return DEFAULT_SPECIAL_ED_CLASS_NAME;
  }
  const fromClass = student.class_name?.trim();
  if (fromClass) return normalizeSpecialEdClassName(fromClass);
  const fromTeacher = student.teacher_name?.trim();
  if (fromTeacher) return normalizeSpecialEdClassName(fromTeacher);
  return DEFAULT_SPECIAL_ED_CLASS_NAME;
}

export function findClassCurriculumOwnerInList(
  students: Student[],
  classKey: string,
  category: Category | null | undefined = "schools"
): Student | undefined {
  const key = specialEdClassMatchKey(classKey);
  return students.find((student) => {
    if (!isClassCurriculumStudent(student)) return false;
    if (!matchesCategory(student, category)) return false;
    return specialEdClassMatchKey(specialEdClassKeyFromStudent(student)) === key;
  });
}
