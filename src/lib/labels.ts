import type { Category, StudentStatus } from "./supabase/types";
import type { SiteTexts } from "./site-text";
import { DEFAULT_SITE_TEXTS } from "./site-text";
import type { EducationFramework } from "./personal-sector";

/** סדר הצגה בטבלת קטגוריות: קודם צוות, אחר כך תלמידים */
export const STATUS_DISPLAY_ORDER: StudentStatus[] = [
  "integration-teacher",
  "integration",
  "personal-basket",
  "special-ed-class",
];

/**
 * מסגרות חינוך מיוחד — בדיוק לפי תרשים הזרימה:
 * 1. צוות חינוך מיוחד
 * 2. כיתה (אפיון כיתה · שם מחנכת)
 */
export const SPECIAL_FRAMEWORK_STATUS_ORDER: StudentStatus[] = [
  "integration-teacher",
  "special-ed-class",
];

export function statusDisplayOrderForFramework(
  framework: EducationFramework
): StudentStatus[] {
  if (framework === "special") {
    return SPECIAL_FRAMEWORK_STATUS_ORDER;
  }
  return STATUS_DISPLAY_ORDER;
}

export function filterStatusesForSpecialEdPackage(
  statuses: StudentStatus[],
  includeSpecialEdClasses: boolean
): StudentStatus[] {
  if (includeSpecialEdClasses) return statuses;
  return statuses.filter((status) => status !== "special-ed-class");
}

export const STATUS_TEXT_PATH: Record<StudentStatus, string> = {
  "integration-teacher": "status.integrationTeacher",
  integration: "status.integration",
  "personal-basket": "status.personalBasket",
  "special-ed-class": "status.specialEdClass",
};

/** תוויות ייעודיות למסגרות חינוך מיוחד (תרשים זרימה) */
export const SPECIAL_FRAMEWORK_STATUS_TEXT_PATH: Partial<
  Record<StudentStatus, string>
> = {
  "integration-teacher": "status.specialFrameworkStaff",
  "special-ed-class": "status.specialFrameworkClass",
};

export function statusTextPathForFramework(
  status: StudentStatus,
  framework: EducationFramework
): string {
  if (framework === "special") {
    return SPECIAL_FRAMEWORK_STATUS_TEXT_PATH[status] ?? STATUS_TEXT_PATH[status];
  }
  return STATUS_TEXT_PATH[status];
}

export const STATUS_LIST_TITLE_PATH: Record<StudentStatus, string> = {
  "integration-teacher": "status.integrationTeacherListTitle",
  integration: "status.integrationListTitle",
  "personal-basket": "status.personalBasketListTitle",
  "special-ed-class": "status.specialEdStudentListTitle",
};

export const STATUSES_WITH_TEACHER_STEP: StudentStatus[] = [
  "special-ed-class",
  "integration-teacher",
];

/** סטטוסים שבהם ממלאים שם מורה בכרטיס התלמיד (אשף) */
export const STATUSES_WITH_TEACHER_NAME: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
];

export function statusUsesTeacherStep(status: StudentStatus): boolean {
  return STATUSES_WITH_TEACHER_STEP.includes(status);
}

export function statusUsesTeacherNameField(status: StudentStatus): boolean {
  return STATUSES_WITH_TEACHER_NAME.includes(status);
}

/** סל אישי — בחירת שכיחות גבוהה/נמוכה לפני רשימת התלמידים */
export function statusUsesFrequencyStep(status: StudentStatus): boolean {
  return status === "personal-basket";
}

/** כיתות חינוך מיוחד — בחירת כיתה לפני תיק תלמיד / תל"כ */
export function statusUsesSpecialEdClassStep(status: StudentStatus): boolean {
  return status === "special-ed-class";
}

/** כיתות חינוך מיוחד — בחירה בין תיק תלמיד לבין תל"כ (אחרי בחירת כיתה) */
export function statusUsesSpecialEdModeStep(status: StudentStatus): boolean {
  return status === "special-ed-class";
}

export function getCategoryLabels(
  texts: SiteTexts = DEFAULT_SITE_TEXTS
): Record<Category, string> {
  return {
    schools: texts.categories.schools,
    "high-schools": texts.categories.highSchools,
    kindergartens: texts.categories.kindergartens,
    tutorials: texts.categories.tutorials,
  };
}

export function getStatusLabels(
  texts: SiteTexts = DEFAULT_SITE_TEXTS
): Record<StudentStatus, string> {
  return {
    "integration-teacher": texts.status.integrationTeacher,
    integration: texts.status.integration,
    "personal-basket": texts.status.personalBasket,
    "special-ed-class": texts.status.specialEdClass,
  };
}

export function getStatusOptions(texts: SiteTexts = DEFAULT_SITE_TEXTS) {
  const labels = getStatusLabels(texts);
  return STATUS_DISPLAY_ORDER.map((value) => ({
    value,
    label: labels[value],
  }));
}

export function getCategoryOptions(texts: SiteTexts = DEFAULT_SITE_TEXTS) {
  const labels = getCategoryLabels(texts);
  return (
    ["schools", "high-schools", "kindergartens"] as const
  ).map((value) => ({
    value,
    label: labels[value],
  }));
}

// תאימות לאחור
export const CATEGORY_LABELS = getCategoryLabels();
export const STATUS_LABELS = getStatusLabels();
export const CATEGORY_OPTIONS = getCategoryOptions();
export const STATUS_OPTIONS = getStatusOptions();
