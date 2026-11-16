/**
 * יעד «חזרה לרשימת התלמידים» — הרשימה שממנה נפתח הכרטיס/תיק,
 * כולל כיתה / סינון / חינוך מיוחד כשזה כבר ב-URL או בכרטיס.
 */

import { statusUsesTeacherStep } from "@/lib/labels";
import { normalizeIntegrationFrequency } from "@/lib/integration-frequency";
import {
  hrefPathOnly,
  isPublicEntryHref,
  isStaffRosterHref,
  isStudentFileHref,
  isStudentListHref,
  parseSafeFromParam,
} from "@/lib/navigation-back";
import {
  categorySpecialEdClassModeHref,
  categoryTeacherHref,
  isPersonalSector,
  sectorFrequencyHref,
  sectorHomeHref,
  sectorSpecialEdModeHref,
  sectorStatusHref,
  sectorTeacherHref,
} from "@/lib/personal-sector";
import {
  normalizeSpecialEdClassName,
  specialEdClassKeyFromStudent,
} from "@/lib/special-ed-class-key";
import type { Student } from "@/lib/supabase/types";

export type StudentListSource = Pick<
  Student,
  | "category"
  | "status"
  | "teacher_name"
  | "class_name"
  | "notes"
  | "full_name"
  | "integration_frequency"
>;

function firstSafeHref(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const raw of candidates) {
    const href = parseSafeFromParam(raw);
    if (href) return href;
  }
  return null;
}

function isUsableStudentsListHref(
  href: string,
  student?: StudentListSource | null
): boolean {
  if (isStudentFileHref(href) || isPublicEntryHref(href)) return false;
  if (student?.status !== "integration-teacher" && isStaffRosterHref(href)) {
    return false;
  }
  return (
    isStudentListHref(href) ||
    (student?.status === "integration-teacher" && isStaffRosterHref(href))
  );
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/** סטטוס / כיתה / מורה / שכיחות כפי שמופיעים ביעד רשימה */
export function studentListContextFromHref(href: string): {
  status: string | null;
  className: string | null;
  teacherName: string | null;
  frequency: string | null;
} {
  const path = hrefPathOnly(href);
  const query = href.includes("?")
    ? (href.slice(href.indexOf("?") + 1).split("#")[0] ?? "")
    : "";
  const params = new URLSearchParams(query);
  const nameParam = (params.get("name") ?? params.get("class") ?? "").trim() || null;

  const statusMatch = path.match(/\/(?:status|category)\/([^/]+)/);
  const status = statusMatch?.[1] ? decodePathSegment(statusMatch[1]) : null;

  const classPath = path.match(/\/class\/([^/]+)/);
  const className = classPath?.[1]
    ? decodePathSegment(classPath[1])
    : status === "special-ed-class" && !path.includes("/teacher")
      ? nameParam
      : (params.get("class") ?? "").trim() || null;

  const teacherPath = path.match(/\/teacher\/([^/]+)/);
  const teacherName = teacherPath?.[1]
    ? decodePathSegment(teacherPath[1])
    : path.includes("/teacher")
      ? nameParam
      : null;

  const frequencyMatch = path.match(/\/frequency\/([^/]+)/);
  const frequency = frequencyMatch?.[1]
    ? decodePathSegment(frequencyMatch[1])
    : null;

  return { status, className, teacherName, frequency };
}

/** האם רשימה שמורה שייכת לאותה כיתה / מורה / סטטוס של התלמיד */
export function storedStudentListMatchesStudent(
  href: string,
  student: StudentListSource
): boolean {
  const ctx = studentListContextFromHref(href);
  if (!student.status || !ctx.status || ctx.status !== student.status) {
    return false;
  }

  if (student.status === "special-ed-class") {
    const studentClass = specialEdClassKeyFromStudent(student);
    if (
      ctx.className &&
      normalizeSpecialEdClassName(ctx.className) !== studentClass
    ) {
      return false;
    }
  }

  if (student.status === "personal-basket" && ctx.frequency) {
    const freq =
      normalizeIntegrationFrequency(student.integration_frequency) ?? "high";
    if (ctx.frequency !== freq) return false;
  }

  if (ctx.teacherName && student.teacher_name?.trim()) {
    if (ctx.teacherName.trim() !== student.teacher_name.trim()) {
      return false;
    }
  }

  return true;
}

/** רשימת התלמידים לפי כרטיס התלמיד (כיתה / שכיחות / סטטוס) */
export function studentListHrefFromStudent(student: StudentListSource): string {
  const sector = isPersonalSector(student.category) ? student.category : null;
  if (!student.status) {
    return sector ? sectorHomeHref(sector) : "/personal-area";
  }
  if (student.status === "personal-basket") {
    const frequency =
      normalizeIntegrationFrequency(student.integration_frequency) ?? "high";
    if (sector) {
      return sectorFrequencyHref(sector, "personal-basket", frequency);
    }
    return `/personal-area/category/personal-basket/frequency/${frequency}`;
  }
  if (student.status === "special-ed-class") {
    const classKey = specialEdClassKeyFromStudent(student);
    if (sector) {
      return sectorSpecialEdModeHref(
        sector,
        "student",
        "special",
        "personal-area",
        classKey
      );
    }
    return categorySpecialEdClassModeHref("student", classKey);
  }
  if (
    statusUsesTeacherStep(student.status) &&
    student.status !== "integration-teacher" &&
    student.teacher_name?.trim()
  ) {
    if (sector) {
      return sectorTeacherHref(
        sector,
        student.status,
        student.teacher_name.trim()
      );
    }
    return categoryTeacherHref(student.status, student.teacher_name.trim());
  }
  if (student.status === "integration-teacher") {
    if (sector) {
      return sectorStatusHref(sector, "integration-teacher");
    }
    return "/personal-area/category/integration-teacher";
  }
  if (sector) {
    return sectorStatusHref(sector, student.status);
  }
  return `/personal-area/category/${student.status}`;
}

function rejectStaffRosterForStudent(
  href: string | null,
  student?: StudentListSource | null
): string | null {
  if (
    href &&
    student &&
    student.status !== "integration-teacher" &&
    isStaffRosterHref(href)
  ) {
    return studentListHrefFromStudent(student);
  }
  return href;
}

/**
 * רשימת התלמידים לחזרה.
 * ?from= מפורש — אם זו רשימה שמישה. אחרת מעדיפים גזירה מהכרטיס,
 * ומשתמשים ביעד השמור רק כשהוא תואם כיתה / מורה / סטטוס.
 * TZ-21 / TZ-69: לא מחזירים רוסטר צוות כשצופים בתלמיד.
 */
export function resolveStudentsListBackHref(options: {
  from?: string | null;
  stored?: string | null;
  student?: StudentListSource | null;
}): string | null {
  const { student } = options;

  const fromHref = firstSafeHref(options.from);
  if (fromHref && isUsableStudentsListHref(fromHref, student)) {
    return rejectStaffRosterForStudent(fromHref, student);
  }

  const storedHref = firstSafeHref(options.stored);
  if (
    storedHref &&
    isUsableStudentsListHref(storedHref, student) &&
    (!student || storedStudentListMatchesStudent(storedHref, student))
  ) {
    return rejectStaffRosterForStudent(storedHref, student);
  }

  if (student && student.status !== "integration-teacher") {
    return studentListHrefFromStudent(student);
  }
  return null;
}

/** כיתוב חזרה לרשימה: תלמידים מול אנשי צוות */
export function studentsListBackLabelPath(options: {
  href?: string | null;
  student?: Pick<StudentListSource, "status"> | null;
}): string {
  if (options.student?.status === "integration-teacher") {
    return "status.backToStaffList";
  }
  if (options.href && isStaffRosterHref(options.href)) {
    return "status.backToStaffList";
  }
  return "personalArea.backToStudentsList";
}
