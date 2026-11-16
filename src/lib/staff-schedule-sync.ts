/**
 * סנכרון מערכת שעות של איש צוות → מערכות אישיות של תלמידים מקושרים.
 * חד־כיווני בלבד; תא תפוס (מטא של מורה אחרת או תוכן קיים שאינו של המורה הנוכחית) לא נדרס.
 */

import {
  SCHEDULE_DAYS,
  scheduleCellKey,
  schedulePeriodsForVariant,
  scheduleSubCellKey,
} from "@/lib/form-table-grids";
import {
  getStudents,
  loadStudentFormFill,
  saveStudentFormFill,
} from "@/lib/mock-store";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import {
  formatStudentDisplayName,
  normalizePersonName,
  personNamesMatch,
} from "@/lib/person-name";
import type { PersonalSector } from "@/lib/personal-sector";
import type { Student, StudentStatus } from "@/lib/supabase/types";

export type StaffScheduleConflict = {
  dayKey: string;
  dayLabel: string;
  period: number;
  studentName: string;
  filledByTeacher: string;
};

export type StaffScheduleSyncResult = {
  updatedStudentIds: string[];
  conflicts: StaffScheduleConflict[];
  unmatchedNames: string[];
  /** שמות שהופיעו בטופס אך לא ניתן לסנכרן (למשל סטטוס בלי מערכת שעות) */
  skippedUnsupported: string[];
};

export { normalizePersonName };

/** מטא: מי סינכרן את התא אצל התלמיד */
export function scheduleSyncedByKey(dayKey: string, period: number): string {
  return `sched_${dayKey}_p${period}_synced_by`;
}

export function targetScheduleFormId(
  status: StudentStatus | null | undefined
): "schedule" | "personal-schedule" | null {
  if (status === "integration") return "schedule";
  if (status === "personal-basket") return "personal-schedule";
  return null;
}

/** טפסי מערכת שעות של תלמיד — שילוב / סל אישי (כולל מזהה ישן schedule-detailed) */
export const STUDENT_SCHEDULE_SOURCE_FORM_IDS = [
  "personal-schedule",
  "schedule-detailed",
  "schedule",
] as const;

export function isStudentScheduleFormId(formId: string): boolean {
  return (STUDENT_SCHEDULE_SOURCE_FORM_IDS as readonly string[]).includes(
    formId
  );
}

/**
 * Shared TZ-75 merge keys: main cell + synced_by only.
 * Never copies «בכיתה» / «אחר» (`*_in_class` / `*_other`).
 */
export const PERSONAL_SCHEDULE_CELL_KEY_RE = /^sched_[a-z]+_p\d+$/;
export const PERSONAL_SCHEDULE_MERGE_KEY_RE =
  /^sched_[a-z]+_p\d+(?:_synced_by)?$/;

export function isPersonalScheduleCellKey(key: string): boolean {
  return PERSONAL_SCHEDULE_CELL_KEY_RE.test(key);
}

export function isPersonalScheduleMergeKey(key: string): boolean {
  return PERSONAL_SCHEDULE_MERGE_KEY_RE.test(key);
}

export type PersonalBasketScheduleSource = {
  form_id: string;
  data?: Record<string, string> | null;
} | null | undefined;

/**
 * Existing personal-basket schedule fill: `personal-schedule`, else
 * legacy `schedule-detailed`. Shiluv `schedule` is not a personal-basket fill.
 */
export function pickPersonalBasketScheduleFill<
  T extends { form_id: string },
>(fills: Array<T | null | undefined>): T | null {
  const present = fills.filter((fill): fill is T => Boolean(fill));
  return (
    present.find((fill) => fill.form_id === "personal-schedule") ??
    present.find((fill) => fill.form_id === "schedule-detailed") ??
    null
  );
}

/**
 * TZ-75: מעתיק תאי מערכת שעות ממקורות אחים לתאים שמעולם לא הוגדרו.
 * מפתח שכבר קיים ביעד — גם אם ריק אחרי שהמורה רוקנה אותו — לא מתמלא מחדש.
 * רק תא ראשי / synced_by — בלי סימוני בכיתה/אחר.
 */
export function mergeEmptyScheduleCells(
  target: Record<string, string>,
  sources: Array<Record<string, string> | null | undefined>
): Record<string, string> {
  let next: Record<string, string> | null = null;
  for (const source of sources) {
    if (!source) continue;
    for (const [key, raw] of Object.entries(source)) {
      if (!isPersonalScheduleMergeKey(key)) continue;
      const value = String(raw ?? "").trim();
      if (!value) continue;
      const bucket = next ?? target;
      if (Object.prototype.hasOwnProperty.call(bucket, key)) continue;
      if (!next) next = { ...target };
      next[key] = String(raw);
    }
  }
  return next ?? target;
}

/**
 * Personal-basket schedule base for open / staff-sync / transfer:
 * existing personal-schedule or schedule-detailed (including empty cells),
 * otherwise merge shiluv `schedule` with the shared rule.
 */
export function personalBasketScheduleBase(input: {
  personal?: PersonalBasketScheduleSource;
  detailed?: PersonalBasketScheduleSource;
  simple?: PersonalBasketScheduleSource;
}): Record<string, string> {
  const existing = pickPersonalBasketScheduleFill([
    input.personal,
    input.detailed,
  ]);
  if (existing) return { ...(existing.data ?? {}) };
  return mergeEmptyScheduleCells({}, [input.simple?.data]);
}

function dayLabel(dayKey: string): string {
  return SCHEDULE_DAYS.find((d) => d.key === dayKey)?.label ?? dayKey;
}

export function findLinkedStudentByName(
  linked: Student[],
  studentNameRaw: string
): Student | null {
  const needle = normalizePersonName(studentNameRaw);
  if (!needle) return null;
  return (
    linked.find((s) =>
      personNamesMatch(formatStudentDisplayName(s.full_name), studentNameRaw)
    ) ?? null
  );
}

export function cellDisplayValue(teacherName: string, subject: string): string {
  const t = teacherName.trim();
  const sub = subject.trim();
  if (t && sub) return `${t}\n${sub}`;
  return t || sub;
}

/**
 * פיצול שמות תלמידים מתא בודד — תומך בפסיקים (כולל פסיק ערבי ،) ושורות חדשות.
 * מחזיר רשימת שמות מנורמלים (ריקים מסוננים).
 */
export function splitStudentNames(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[,،\n]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function asSector(value: string | null | undefined): PersonalSector | undefined {
  if (
    value === "schools" ||
    value === "kindergartens" ||
    value === "high-schools"
  ) {
    return value;
  }
  return undefined;
}

type StudentWork = {
  student: Student;
  formId: "schedule" | "personal-schedule";
  data: Record<string, string>;
  dirty: boolean;
};

/**
 * כל תלמיד עם מערכת שעות באותה קטגוריה — לא רק teacher_name.
 * מאפשר סנכרון מכל אנשי צוות החינוך המיוחד (מטפלת רגשית וכו').
 */
export function getStudentsForStaffScheduleSync(
  category?: PersonalSector
): Student[] {
  return getStudents()
    .filter((s) => {
      if (s.archived_at) return false;
      if (isClassCurriculumStudent(s)) return false;
      if (s.status === "integration-teacher") return false;
      if (category && s.category !== category) return false;
      return targetScheduleFormId(s.status) !== null;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
}

/**
 * סנכרון מערכת staff-weekly אל מערכות התלמידים (לפי שם בתא).
 * כמה אנשי צוות יכולים לסנכרן לאותו תלמיד — בלי לדרוס תא תפוס
 * (כולל מילוי ידני/ייבוא בלי מטא `_synced_by`).
 */
export async function syncStaffScheduleToLinkedStudents(input: {
  staffName: string;
  staffCategory?: string | null;
  data: Record<string, string>;
}): Promise<StaffScheduleSyncResult> {
  const staffName = input.staffName.trim();
  const staffNorm = normalizePersonName(staffName);
  const periods = schedulePeriodsForVariant("staff-weekly");
  const linked = getStudentsForStaffScheduleSync(asSector(input.staffCategory));

  const conflicts: StaffScheduleConflict[] = [];
  const unmatchedNames = new Set<string>();
  const skippedUnsupported = new Set<string>();
  const workByStudent = new Map<string, StudentWork>();

  async function getWork(student: Student): Promise<StudentWork | null> {
    const existing = workByStudent.get(student.id);
    if (existing) return existing;
    const formId = targetScheduleFormId(student.status);
    if (!formId) return null;
    const fill = await loadStudentFormFill(student.id, formId);
    let data = { ...(fill?.data ?? {}) };
    if (formId === "personal-schedule") {
      const detailed = await loadStudentFormFill(student.id, "schedule-detailed");
      const simple = await loadStudentFormFill(student.id, "schedule");
      data = personalBasketScheduleBase({
        personal: fill,
        detailed,
        simple,
      });
    }
    const work: StudentWork = {
      student,
      formId,
      data,
      dirty: false,
    };
    workByStudent.set(student.id, work);
    return work;
  }

  for (const day of SCHEDULE_DAYS) {
    for (const period of periods) {
      const studentNamesRaw = (
        input.data[scheduleSubCellKey(day.key, period, "student")] ?? ""
      ).trim();
      if (!studentNamesRaw) continue;

      const subject = (
        input.data[scheduleSubCellKey(day.key, period, "subject")] ?? ""
      ).trim();

      const studentNames = splitStudentNames(studentNamesRaw);
      if (studentNames.length === 0) continue;

      for (const studentName of studentNames) {
        const student = findLinkedStudentByName(linked, studentName);
        if (!student) {
          unmatchedNames.add(studentName);
          continue;
        }

        const work = await getWork(student);
        if (!work) {
          skippedUnsupported.add(
            formatStudentDisplayName(student.full_name) || studentName
          );
          continue;
        }

        const metaKey = scheduleSyncedByKey(day.key, period);
        const cellKey = scheduleCellKey(day.key, period);
        const filledBy = (work.data[metaKey] ?? "").trim();
        const filledByNorm = normalizePersonName(filledBy);
        const existingCell = (work.data[cellKey] ?? "").trim();
        const cellFirstLine = existingCell.split("\n")[0]?.trim() ?? "";
        const cellFirstLineNorm = normalizePersonName(cellFirstLine);
        const ownedByCurrent =
          (filledByNorm !== "" && filledByNorm === staffNorm) ||
          (filledByNorm === "" &&
            cellFirstLineNorm !== "" &&
            cellFirstLineNorm === staffNorm);

        if (filledBy && filledByNorm !== staffNorm) {
          conflicts.push({
            dayKey: day.key,
            dayLabel: dayLabel(day.key),
            period,
            studentName: formatStudentDisplayName(student.full_name),
            filledByTeacher: filledBy,
          });
          continue;
        }

        // תא עם תוכן בלי בעלות של המורה הנוכחית (מילוי ידני / ייבוא / בלי מטא)
        if (existingCell && !ownedByCurrent) {
          conflicts.push({
            dayKey: day.key,
            dayLabel: dayLabel(day.key),
            period,
            studentName: formatStudentDisplayName(student.full_name),
            filledByTeacher: filledBy || cellFirstLine || "מילוי קיים",
          });
          continue;
        }

        const nextValue = cellDisplayValue(staffName, subject);
        if (
          work.data[cellKey] === nextValue &&
          work.data[metaKey] === staffName
        ) {
          continue;
        }
        work.data[cellKey] = nextValue;
        work.data[metaKey] = staffName;
        work.dirty = true;
      }
    }
  }

  const updatedStudentIds: string[] = [];
  for (const work of workByStudent.values()) {
    if (!work.dirty) continue;
    await saveStudentFormFill({
      studentId: work.student.id,
      formId: work.formId,
      data: work.data,
      status: "draft",
    });
    updatedStudentIds.push(work.student.id);
  }

  return {
    updatedStudentIds,
    conflicts,
    unmatchedNames: Array.from(unmatchedNames).sort((a, b) =>
      a.localeCompare(b, "he")
    ),
    skippedUnsupported: Array.from(skippedUnsupported).sort((a, b) =>
      a.localeCompare(b, "he")
    ),
  };
}

export function formatStaffScheduleSyncMessage(
  result: StaffScheduleSyncResult
): string | null {
  const parts: string[] = [];
  if (result.updatedStudentIds.length > 0) {
    parts.push(
      `המערכת סונכרנה ל־${result.updatedStudentIds.length} תלמידים`
    );
  }
  if (result.conflicts.length > 0) {
    const lines = result.conflicts.map(
      (c) =>
        `שיעור ${c.period} ביום ${c.dayLabel} אצל ${c.studentName} כבר מולא ע״י ${c.filledByTeacher}`
    );
    parts.push(lines.join("\n"));
  }
  if (result.unmatchedNames.length > 0) {
    parts.push(
      `לא נמצאו תלמידים בשמות: ${result.unmatchedNames.join(", ")}`
    );
  }
  if (result.skippedUnsupported.length > 0) {
    parts.push(
      `לא ניתן לסנכרן (אין מערכת שעות מתאימה): ${result.skippedUnsupported.join(", ")}`
    );
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
