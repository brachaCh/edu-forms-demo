/**
 * ייבוא / סנכרון בין רשימת תלמידי כיתה לבין טופס תל"כ «רשימת תלמידים».
 */

import { ensureClassCurriculumStudent } from "@/lib/class-curriculum-store";
import {
  FORM_TABLE_DEFS,
  resolveTableRowCount,
  tableCellKey,
  tableRowCountKey,
} from "@/lib/form-table-grids";
import { mergeFormFillStatus } from "@/lib/form-fill-status";
import {
  getCanAssignTeachers,
  getStudents,
  loadStudentFormFill,
  saveStudent,
  saveStudentFormFill,
} from "@/lib/mock-store";
import { teacherNameForWrite } from "@/lib/teacher-assignment";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import {
  formatStudentDisplayName,
  normalizePersonName,
} from "@/lib/person-name";
import {
  listStudentsInSpecialEdClass,
  normalizeSpecialEdClassName,
  specialEdClassKeyFromStudent,
} from "@/lib/special-ed-classes";
import { idNumberMatchKey } from "@/lib/student-excel-import";
import type { Category, Student } from "@/lib/supabase/types";

export interface ClassCurriculumSyncResult {
  created: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export const CLASS_STUDENT_LIST_FORM_ID = "class-student-list";
export const CLASS_STUDENTS_TABLE_ID = "class-students";

export interface ClassCurriculumImportRow {
  full_name: string;
  characterization: string;
  functioning: string;
  class_name: string | null;
  id_number?: string | null;
  /** כבר קיים ברשימת התלמידים של הכיתה */
  duplicate: boolean;
}

export interface ClassCurriculumImportPreview {
  rows: ClassCurriculumImportRow[];
  formTeacherName: string | null;
  formClassName: string | null;
}

function cell(
  data: Record<string, string>,
  rowIndex: number,
  columnKey: string
): string {
  return (data[tableCellKey(CLASS_STUDENTS_TABLE_ID, rowIndex, columnKey)] ?? "")
    .trim();
}

/** חילוץ שורות עם שם מתוך נתוני טופס רשימת תלמידים */
export function extractClassStudentRows(
  data: Record<string, string>
): Array<{
  full_name: string;
  characterization: string;
  functioning: string;
  id_number: string | null;
}> {
  const rowCount = resolveTableRowCount(CLASS_STUDENTS_TABLE_ID, data);
  const rows: Array<{
    full_name: string;
    characterization: string;
    functioning: string;
    id_number: string | null;
  }> = [];
  const seen = new Set<string>();

  for (let r = 0; r < rowCount; r += 1) {
    const full_name = cell(data, r, "name");
    if (!full_name) continue;
    const key = normalizePersonName(full_name);
    if (seen.has(key)) continue;
    seen.add(key);
    const rawId = cell(data, r, "id_number");
    rows.push({
      full_name,
      characterization: cell(data, r, "characterization"),
      functioning: cell(data, r, "functioning"),
      id_number: rawId || null,
    });
  }

  return rows;
}

function parseNotesMeta(notes: string | null | undefined): {
  characterization: string;
  functioning: string;
} {
  const text = (notes ?? "").trim();
  if (!text) return { characterization: "", functioning: "" };
  let characterization = "";
  let functioning = "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const charMatch = trimmed.match(/^אפיון:\s*(.*)$/);
    if (charMatch) {
      characterization = charMatch[1]?.trim() ?? "";
      continue;
    }
    const funcMatch = trimmed.match(/^תפקוד:\s*(.*)$/);
    if (funcMatch) {
      functioning = funcMatch[1]?.trim() ?? "";
    }
  }
  return { characterization, functioning };
}

function rosterNameKey(fullName: string): string {
  return normalizePersonName(formatStudentDisplayName(fullName));
}

/** Active special-ed student in the institution — by ת.ז. first, then שם מלא. */
export function findExistingStudentForClassRoster(
  existing: Student[],
  category: Category,
  input: { full_name: string; id_number?: string | null }
): Student | null {
  const rowIdKey = idNumberMatchKey(input.id_number);
  if (rowIdKey) {
    const byId = existing.find(
      (s) =>
        !s.archived_at &&
        s.category === category &&
        s.status === "special-ed-class" &&
        !isClassCurriculumStudent(s) &&
        idNumberMatchKey(s.id_number) === rowIdKey
    );
    if (byId) return byId;
  }

  const needle = rosterNameKey(input.full_name);
  if (!needle) return null;

  return (
    existing.find((s) => {
      if (s.archived_at) return false;
      if (s.category !== category) return false;
      if (s.status !== "special-ed-class") return false;
      if (isClassCurriculumStudent(s)) return false;
      return rosterNameKey(s.full_name) === needle;
    }) ?? null
  );
}

export function formatClassRosterExistingStudentWarning(
  rowName: string,
  existing: Student
): string {
  const classLabel =
    existing.class_name?.trim() ||
    specialEdClassKeyFromStudent(existing) ||
    "ללא כיתה";
  return `לא נוצר תיק חדש עבור «${rowName.trim()}» — כבר קיים תלמיד «${formatStudentDisplayName(existing.full_name)}» בכיתה «${classLabel}».`;
}

function isDuplicateInList(
  fullName: string,
  existing: Student[],
  category: Category,
  options?: {
    teacherName?: string | null;
    className?: string | null;
  }
): boolean {
  const needle = fullName.trim().toLowerCase();
  if (!needle) return false;
  const classKey = options?.className?.trim()
    ? normalizeSpecialEdClassName(options.className)
    : "";
  const teacherKey = options?.teacherName?.trim() ?? "";
  return existing.some((s) => {
    if (s.category !== category) return false;
    if (s.status !== "special-ed-class") return false;
    if (isClassCurriculumStudent(s)) return false;
    if (classKey) {
      if (specialEdClassKeyFromStudent(s) !== classKey) return false;
    } else if (teacherKey && (s.teacher_name?.trim() ?? "") !== teacherKey) {
      return false;
    }
    return formatStudentDisplayName(s.full_name).toLowerCase() === needle;
  });
}

/** מנעול סנכרון — מונע יצירת תיקים כפולים כששמירה ופתיחת הרשימה רצות במקביל */
const syncStudentsLocks = new Map<string, Promise<unknown>>();

function syncStudentsLockKey(options: {
  category: Category;
  className?: string | null;
  teacherName?: string | null;
}): string {
  const classKey = normalizeSpecialEdClassName(
    options.className || options.teacherName || ""
  );
  return `${options.category}::${classKey}`;
}

async function withSyncStudentsLock<T>(
  key: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = syncStudentsLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => gate);
  syncStudentsLocks.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    release();
    if (syncStudentsLocks.get(key) === chained) {
      syncStudentsLocks.delete(key);
    }
  }
}

function buildNotes(
  characterization: string,
  functioning: string
): string | null {
  const parts: string[] = [];
  if (characterization) parts.push(`אפיון: ${characterization}`);
  if (functioning) parts.push(`תפקוד: ${functioning}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * בונה נתוני טופס «רשימת תלמידים» מתלמידי הכיתה.
 * שומר אפיון/תפקוד קיימים בטופס (או מהערות הכרטיס) לפי שם.
 * שורות שקיימות רק בטופס (עדיין בלי תיק) — נשמרות ולא נמחקות כשהרוסטר ריק.
 */
export function buildClassStudentListDataFromRoster(options: {
  className: string;
  students: Student[];
  existingData?: Record<string, string> | null;
  teacherName?: string | null;
}): Record<string, string> {
  const classKey = normalizeSpecialEdClassName(options.className);
  const existing = options.existingData ?? {};
  const prevRows = extractClassStudentRows(existing);
  const prevByName = new Map(
    prevRows.map((row) => [row.full_name.toLowerCase(), row])
  );

  const rows: Array<{
    name: string;
    characterization: string;
    functioning: string;
  }> = [];
  const seen = new Set<string>();

  for (const student of options.students) {
    const full_name = formatStudentDisplayName(student.full_name);
    const key = full_name.toLowerCase();
    if (!full_name || seen.has(key)) continue;
    seen.add(key);
    const prev = prevByName.get(key);
    const fromNotes = parseNotesMeta(student.notes);
    rows.push({
      name: full_name,
      characterization:
        prev?.characterization ||
        (student.characterization ?? "").trim() ||
        fromNotes.characterization ||
        "",
      functioning: prev?.functioning || fromNotes.functioning || "",
    });
  }

  // שמות שמילאו בטופס ועדיין אין להם תיק ברוסטר — לא למחוק בסנכרון
  for (const prev of prevRows) {
    const key = prev.full_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name: prev.full_name,
      characterization: prev.characterization,
      functioning: prev.functioning,
    });
  }

  const def = FORM_TABLE_DEFS[CLASS_STUDENTS_TABLE_ID];
  const minRows = def?.defaultRows ?? 8;
  const rowCount = Math.max(rows.length, minRows);

  const next: Record<string, string> = {
    class_name: (existing.class_name ?? "").trim() || classKey,
    school_year: existing.school_year ?? "",
    teacher_name:
      (options.teacherName ?? "").trim() ||
      (existing.teacher_name ?? "").trim() ||
      "",
    [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: String(rowCount),
  };

  for (let r = 0; r < rowCount; r += 1) {
    const row = rows[r];
    next[tableCellKey(CLASS_STUDENTS_TABLE_ID, r, "name")] = row?.name ?? "";
    next[tableCellKey(CLASS_STUDENTS_TABLE_ID, r, "characterization")] =
      row?.characterization ?? "";
    next[tableCellKey(CLASS_STUDENTS_TABLE_ID, r, "functioning")] =
      row?.functioning ?? "";
  }

  return next;
}

/**
 * מעדכן את טופס רשימת התלמידים בתל"כ לפי תלמידי הכיתה שהוגדרו.
 */
export async function syncClassStudentListFromRoster(options: {
  category: Category;
  className?: string | null;
  teacherName?: string | null;
}): Promise<Record<string, string>> {
  const classKey = normalizeSpecialEdClassName(options.className);
  const owner = await ensureClassCurriculumStudent(classKey, {
    category: options.category,
  });
  const roster = listStudentsInSpecialEdClass(classKey, options.category);
  const existing = await loadStudentFormFill(
    owner.id,
    CLASS_STUDENT_LIST_FORM_ID
  );
  const data = buildClassStudentListDataFromRoster({
    className: classKey,
    students: roster,
    existingData: existing?.data,
    teacherName: options.teacherName,
  });
  await saveStudentFormFill({
    studentId: owner.id,
    formId: CLASS_STUDENT_LIST_FORM_ID,
    data,
    status: mergeFormFillStatus(existing?.status, "draft"),
    documentId: existing?.document_id,
  });
  return data;
}

/**
 * קורא את רשימת התלמידים מתל"כ (בעל תל"כ כיתתי + רשומות ישנות אם יש)
 * ומכין תצוגה מקדימה לייבוא לרשימת תיק תלמיד כיתה.
 */
export async function previewImportFromClassCurriculum(options: {
  category: Category;
  teacherName?: string | null;
  className?: string | null;
}): Promise<ClassCurriculumImportPreview> {
  const { category, teacherName, className } = options;
  const existing = getStudents();

  await ensureClassCurriculumStudent(className ?? null, { category });
  const owners = getStudents().filter((s) => {
    if (!isClassCurriculumStudent(s) || s.category !== category) return false;
    if (!className?.trim()) return true;
    const key = className.trim();
    return (
      s.teacher_name?.trim() === key ||
      s.class_name?.trim() === key ||
      s.full_name.includes(key)
    );
  });

  const byName = new Map<
    string,
    {
      full_name: string;
      characterization: string;
      functioning: string;
      class_name: string | null;
    }
  >();
  let formTeacherName: string | null = null;
  let formClassName: string | null = null;

  for (const owner of owners) {
    const fill = await loadStudentFormFill(owner.id, CLASS_STUDENT_LIST_FORM_ID);
    const data = fill?.data ?? {};
    if (!formTeacherName) {
      const t = (data.teacher_name ?? "").trim();
      if (t) formTeacherName = t;
    }
    if (!formClassName) {
      const c = (data.class_name ?? "").trim();
      if (c) formClassName = c;
    }
    for (const row of extractClassStudentRows(data)) {
      const key = row.full_name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, {
          ...row,
          class_name: formClassName,
        });
      }
    }
  }

  const rows: ClassCurriculumImportRow[] = Array.from(byName.values()).map(
    (row) => ({
      full_name: row.full_name,
      characterization: row.characterization,
      functioning: row.functioning,
      class_name: row.class_name,
      duplicate: isDuplicateInList(row.full_name, existing, category, {
        teacherName: teacherName || className,
        className: className || teacherName,
      }),
    })
  );

  return { rows, formTeacherName, formClassName };
}

export async function importStudentsFromClassCurriculum(options: {
  category: Category;
  teacherName?: string | null;
  className?: string | null;
  rows: ClassCurriculumImportRow[];
}): Promise<ClassCurriculumSyncResult> {
  const { category, teacherName, className, rows } = options;
  const classKey = normalizeSpecialEdClassName(
    className || teacherName || ""
  );
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const warnings: string[] = [];
  const seenInBatch = new Set<string>();

  for (const row of rows) {
    const fullName = row.full_name.trim();
    if (!fullName) {
      skipped += 1;
      continue;
    }
    const nameKey = fullName.toLowerCase();
    if (seenInBatch.has(nameKey) || row.duplicate) {
      skipped += 1;
      continue;
    }
    const liveStudents = getStudents();
    // בדיקה חיה — גם אם סנכרון קודם כבר יצר את התיק (או רץ במקביל)
    if (
      isDuplicateInList(fullName, liveStudents, category, {
        teacherName: teacherName || classKey,
        className: classKey,
      })
    ) {
      skipped += 1;
      continue;
    }
    const institutionMatch = findExistingStudentForClassRoster(
      liveStudents,
      category,
      {
        full_name: fullName,
        id_number: row.id_number ?? null,
      }
    );
    if (institutionMatch) {
      skipped += 1;
      warnings.push(formatClassRosterExistingStudentWarning(fullName, institutionMatch));
      continue;
    }
    seenInBatch.add(nameKey);
    try {
      await saveStudent({
        category,
        full_name: fullName,
        status: "special-ed-class",
        teacher_name: teacherNameForWrite(
          teacherName?.trim() || classKey || null,
          getCanAssignTeachers()
        ),
        class_name: row.class_name?.trim() || classKey || null,
        notes: buildNotes(row.characterization, row.functioning),
        phone: null,
        father_name: null,
        mother_name: null,
        id_number: row.id_number?.trim() || null,
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
      created += 1;
    } catch {
      failed += 1;
      seenInBatch.delete(nameKey);
    }
  }

  return { created, skipped, failed, warnings };
}

/**
 * סנכרון אוטומטי: מוסיף לרשימת «תיק תלמיד כיתה» תלמידים חדשים
 * מרשימת תל"כ (דולג על קיימים).
 * אפשר להעביר `formData` מיד אחרי שמירה — בלי טעינה חוזרת מהשרת.
 */
export async function syncStudentsFromClassCurriculum(options: {
  category: Category;
  teacherName?: string | null;
  className?: string | null;
  formData?: Record<string, string> | null;
}): Promise<ClassCurriculumSyncResult> {
  const { category, teacherName, className, formData } = options;
  const classKey = normalizeSpecialEdClassName(
    className || teacherName || ""
  );

  return withSyncStudentsLock(
    syncStudentsLockKey({ category, className: classKey, teacherName }),
    async () => {
      if (formData) {
        const existing = getStudents();
        const rows = extractClassStudentRows(formData).map((row) => ({
          ...row,
          class_name:
            (formData.class_name ?? "").trim() || classKey || null,
          duplicate: isDuplicateInList(row.full_name, existing, category, {
            teacherName: teacherName || classKey,
            className: classKey || className,
          }),
        }));
        if (rows.length === 0) {
          return { created: 0, skipped: 0, failed: 0, warnings: [] };
        }
        return importStudentsFromClassCurriculum({
          category,
          teacherName: teacherName || classKey || null,
          className: classKey || className,
          rows,
        });
      }

      const preview = await previewImportFromClassCurriculum(options);
      if (preview.rows.length === 0) {
        return { created: 0, skipped: 0, failed: 0, warnings: [] };
      }
      return importStudentsFromClassCurriculum({
        category,
        teacherName: teacherName || classKey || null,
        className: classKey || className,
        rows: preview.rows.map((row) => ({
          ...row,
          class_name: row.class_name || classKey || className || null,
        })),
      });
    }
  );
}
