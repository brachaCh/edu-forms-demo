import { isCustomPlanId, resolveCustomPlanLimits } from "@/lib/billing/custom-plan";
import { getStaticPlanMetadata } from "@/lib/plan-metadata";
import type { PurchasePlanLimits } from "@/lib/purchase-plans";
import { parseSumitPlanId } from "@/lib/sumit/protocol-packages";
import { specialEdClassMatchKey } from "@/lib/special-ed-class-key";
import {
  CLASS_CURRICULUM_CLASS_KEY,
  isClassCurriculumStudent,
} from "@/lib/special-ed-mode";
import type { Category, Student, StudentStatus } from "@/lib/supabase/types";

/** Per-class student cap for special-ed plans (כיתות חנ"מ). */
export const SPECIAL_ED_STUDENTS_PER_CLASS = 17;

export function studentsQuotaForClasses(classCount: number): number {
  if (!Number.isFinite(classCount) || classCount <= 0) return 0;
  return classCount * SPECIAL_ED_STUDENTS_PER_CLASS;
}

export type PlanLimitKind =
  | "integration_portfolios"
  | "personal_baskets"
  | "students"
  | "students_per_class"
  | "classes";

export interface PlanLimitViolation {
  kind: PlanLimitKind;
  limit: number;
  current: number;
}

export interface PlanUsage {
  integrationPortfolios: number;
  personalBaskets: number;
  /** תיקי שילוב + סל אישי — נספרים יחד למכסה */
  portfolioFiles: number;
  students: number;
  classes: number;
}

export interface PlanLimitContext {
  planId: string | null | undefined;
  institutionType?: Category | null;
  educationFramework?: "regular" | "special" | null;
  students: Student[];
  /** רשימת כיתות ידועות (localStorage) — אופציונלי */
  knownClassNames?: string[];
  planCustomClasses?: number | null;
  planCustomStudents?: number | null;
}

const PORTFOLIO_STATUSES: StudentStatus[] = ["integration", "special-ed-class"];
const PORTFOLIO_FILE_STATUSES: StudentStatus[] = ["integration", "personal-basket"];

function normalizeClassKey(value: string | null | undefined): string {
  return specialEdClassMatchKey(value);
}

function isDefaultClassKey(key: string): boolean {
  return key === specialEdClassMatchKey(CLASS_CURRICULUM_CLASS_KEY);
}

/** Placeholder «כיתה» counts only when a real special-ed row already uses it. */
function specialEdStudentsHaveClassKey(
  students: Student[],
  key: string
): boolean {
  return students.some((student) => {
    if (student.archived_at) return false;
    if (student.status !== "special-ed-class") return false;
    return specialEdClassKey(student) === key;
  });
}

function specialEdClassKey(student: Student): string {
  if (isClassCurriculumStudent(student)) {
    const fromTeacher = student.teacher_name?.trim();
    if (fromTeacher) return normalizeClassKey(fromTeacher);
    const fromClass = student.class_name?.trim();
    if (fromClass) return normalizeClassKey(fromClass);
    return CLASS_CURRICULUM_CLASS_KEY;
  }
  return normalizeClassKey(student.class_name);
}

function isCountableStudent(student: Student): boolean {
  if (student.archived_at) return false;
  return !isClassCurriculumStudent(student);
}

function gardenKeyFromStudent(student: Student): string | null {
  if (student.archived_at) return null;
  if (student.category !== "kindergartens") return null;
  if (!student.status || !PORTFOLIO_STATUSES.includes(student.status)) return null;
  const key = student.class_name?.trim() || student.teacher_name?.trim();
  return key ? normalizeClassKey(key) : null;
}

/** Live special-ed row (roster or בעל תל״כ) already uses this class key. */
function specialEdPresenceHasClassKey(
  students: Student[],
  key: string
): boolean {
  return students.some((student) => {
    if (student.archived_at) return false;
    if (student.status !== "special-ed-class") return false;
    return specialEdClassKey(student) === key;
  });
}

function addLiveSpecialEdClassKey(
  student: Student,
  classKeys: Set<string>
): void {
  if (student.archived_at) return;
  if (student.status !== "special-ed-class") return;
  const key = specialEdClassKey(student);
  // Placeholder «כיתה» owner / empty default does not consume quota.
  if (isDefaultClassKey(key) && !isCountableStudent(student)) return;
  classKeys.add(key);
}

function collectSpecialEdClassKeys(
  students: Student[],
  knownClassNames: string[] = []
): Set<string> {
  const classKeys = new Set<string>();
  for (const student of students) {
    addLiveSpecialEdClassKey(student, classKeys);
  }
  for (const name of knownClassNames) {
    const key = normalizeClassKey(name);
    if (!key) continue;
    // localStorage leftovers after delete/archive must not consume quota.
    if (!specialEdPresenceHasClassKey(students, key)) continue;
    if (
      isDefaultClassKey(key) &&
      !specialEdStudentsHaveClassKey(students, key)
    ) {
      continue;
    }
    classKeys.add(key);
  }
  return classKeys;
}

function isPortfolioFileStudent(student: Student): boolean {
  const status = student.status;
  return (
    status != null &&
    PORTFOLIO_FILE_STATUSES.includes(status) &&
    isCountableStudent(student)
  );
}

export function countPlanUsage(
  students: Student[],
  institutionType?: Category | null,
  knownClassNames: string[] = []
): PlanUsage {
  const integrationPortfolios = students.filter(
    (student) => student.status === "integration" && isCountableStudent(student)
  ).length;

  const personalBaskets = students.filter(
    (student) =>
      student.status === "personal-basket" && isCountableStudent(student)
  ).length;

  const studentsInClassMode = students.filter(
    (student) =>
      student.status === "special-ed-class" && isCountableStudent(student)
  ).length;

  const classKeys =
    institutionType === "kindergartens"
      ? new Set<string>()
      : collectSpecialEdClassKeys(students, knownClassNames);

  if (institutionType === "kindergartens") {
    for (const student of students) {
      const key = gardenKeyFromStudent(student);
      if (key) classKeys.add(key);
    }
  }

  return {
    integrationPortfolios,
    personalBaskets,
    portfolioFiles: integrationPortfolios + personalBaskets,
    students: studentsInClassMode,
    classes: classKeys.size,
  };
}

function withDerivedClassQuotas(raw: PurchasePlanLimits): PurchasePlanLimits {
  const resolved: PurchasePlanLimits = { ...raw };

  if (resolved.classes !== undefined && resolved.classes > 0) {
    const derivedStudents = studentsQuotaForClasses(resolved.classes);
    if (resolved.students === undefined) {
      resolved.students = derivedStudents;
    }
  }

  if (
    resolved.classes === undefined &&
    resolved.students !== undefined &&
    resolved.students > 0 &&
    resolved.students % SPECIAL_ED_STUDENTS_PER_CLASS === 0 &&
    resolved.integrationPortfolios === undefined
  ) {
    resolved.classes = resolved.students / SPECIAL_ED_STUDENTS_PER_CLASS;
  }

  return resolved;
}

/** החבילה כוללת כיתות חינוך מיוחד / תל״כ רק אם יש מכסת כיתות חיובית. */
export function planIncludesSpecialEdClasses(
  limits: PurchasePlanLimits | null | undefined
): boolean {
  return (limits?.classes ?? 0) > 0;
}

/**
 * האם מותר ליצור כיתות/תלמידי חנ״מ חדשים לפי החבילה.
 * חבילה חסרה, מזהה ישן שלא מזוהה, או מנהל — מותרים (לא נועלים בית ספר).
 */
export function planAllowsSpecialEdClasses(
  planId: string | null | undefined,
  custom?: { classes?: number | null; students?: number | null },
  educationFramework: "regular" | "special" | null = "regular"
): boolean {
  if (!planId) return true;
  const limits = resolvePlanLimits(planId, custom, educationFramework);
  if (!limits) return true;
  return planIncludesSpecialEdClasses(limits);
}

function specialEdClassesNotIncludedViolation(
  current: number
): PlanLimitViolation {
  return { kind: "classes", limit: 0, current };
}

/** מגבלות אפקטיביות לפי חבילה — כולל חישוב אוטומטי של תלמידים (כיתות × 17) */
export function resolvePlanLimits(
  planId: string | null | undefined,
  custom?: { classes?: number | null; students?: number | null },
  educationFramework: "regular" | "special" | null = "regular"
): PurchasePlanLimits | null {
  if (!planId) return null;

  if (isCustomPlanId(planId)) {
    return resolveCustomPlanLimits(
      {
        classes: custom?.classes ?? 0,
        students: custom?.students ?? 0,
      },
      educationFramework
    );
  }

  const fromSumit = parseSumitPlanId(planId);
  if (fromSumit) return withDerivedClassQuotas(fromSumit.limits);

  const raw = getStaticPlanMetadata(planId)?.limits ?? null;
  if (!raw) {
    console.warn(
      `[plan-limits] plan id "${planId}" did not resolve; allowing access`
    );
    return null;
  }
  return withDerivedClassQuotas(raw);
}

function getLimits(
  planId: string | null | undefined,
  custom?: { classes?: number | null; students?: number | null },
  educationFramework: "regular" | "special" | null = "regular"
): PurchasePlanLimits | null {
  return resolvePlanLimits(planId, custom, educationFramework);
}

function wouldIncreaseCount(
  current: number,
  next: number,
  existingId?: string | null
): boolean {
  if (!existingId) return next > current;
  return next > current;
}

export function checkStudentWriteAllowed(input: {
  planId: string | null | undefined;
  institutionType?: Category | null;
  educationFramework?: "regular" | "special" | null;
  students: Student[];
  student: Partial<
    Pick<Student, "id" | "status" | "category" | "class_name" | "teacher_name" | "notes" | "full_name">
  > & Pick<Student, "category" | "full_name">;
  existingStudentId?: string | null;
  knownClassNames?: string[];
  planCustomClasses?: number | null;
  planCustomStudents?: number | null;
}): PlanLimitViolation | null {
  const limits = getLimits(
    input.planId,
    {
      classes: input.planCustomClasses,
      students: input.planCustomStudents,
    },
    input.educationFramework ?? "regular"
  );
  if (!limits) return null;

  const original = input.existingStudentId
    ? input.students.find((student) => student.id === input.existingStudentId)
    : undefined;
  const others = input.existingStudentId
    ? input.students.filter((student) => student.id !== input.existingStudentId)
    : input.students;

  const mergedStudent: Student = {
    ...(original ?? {
      id: input.existingStudentId ?? "new",
      institution_id: null,
      category: input.student.category ?? "schools",
      full_name: input.student.full_name ?? "",
      phone: null,
      father_name: null,
      mother_name: null,
      class_name: null,
      teacher_name: null,
      notes: null,
      created_at: "",
      updated_at: "",
    }),
    ...input.student,
    id: input.existingStudentId ?? "new",
  } as Student;

  const nextStudents = input.existingStudentId
    ? [...others, mergedStudent]
    : [...others, mergedStudent];

  const before = countPlanUsage(
    others,
    input.institutionType,
    input.knownClassNames
  );
  const after = countPlanUsage(
    nextStudents,
    input.institutionType,
    input.knownClassNames
  );

  if (
    mergedStudent.status === "special-ed-class" &&
    !planIncludesSpecialEdClasses(limits)
  ) {
    const hadSpecialEdClass = original?.status === "special-ed-class";
    if (!hadSpecialEdClass) {
      return specialEdClassesNotIncludedViolation(before.classes);
    }
  }

  if (
    mergedStudent.status === "personal-basket" &&
    limits.personalBaskets !== true
  ) {
    const hadPersonalBasket = original?.status === "personal-basket";
    if (!hadPersonalBasket) {
      return {
        kind: "personal_baskets",
        limit: 0,
        current: before.personalBaskets,
      };
    }
  }

  if (
    limits.integrationPortfolios !== undefined &&
    isPortfolioFileStudent(mergedStudent) &&
    after.portfolioFiles > limits.integrationPortfolios &&
    wouldIncreaseCount(
      before.portfolioFiles,
      after.portfolioFiles,
      input.existingStudentId
    )
  ) {
    return {
      kind: "integration_portfolios",
      limit: limits.integrationPortfolios,
      current: before.portfolioFiles,
    };
  }

  if (
    limits.students !== undefined &&
    after.students > limits.students &&
    wouldIncreaseCount(before.students, after.students, input.existingStudentId)
  ) {
    return {
      kind: "students",
      limit: limits.students,
      current: before.students,
    };
  }

  // כיתה קטנה (חנ״מ) — עד 17 תלמידים לכל כיתה, גם אם מכסת החבילה גבוהה יותר
  if (
    mergedStudent.status === "special-ed-class" &&
    isCountableStudent(mergedStudent)
  ) {
    const classKey = specialEdClassKey(mergedStudent);
    const countInClass = (list: Student[]) =>
      list.filter(
        (student) =>
          student.status === "special-ed-class" &&
          isCountableStudent(student) &&
          specialEdClassKey(student) === classKey
      ).length;
    const beforeInClass = countInClass(others);
    const afterInClass = countInClass(nextStudents);
    if (
      afterInClass > SPECIAL_ED_STUDENTS_PER_CLASS &&
      wouldIncreaseCount(beforeInClass, afterInClass, input.existingStudentId)
    ) {
      return {
        kind: "students_per_class",
        limit: SPECIAL_ED_STUDENTS_PER_CLASS,
        current: beforeInClass,
      };
    }
  }

  if (
    limits.classes !== undefined &&
    after.classes > limits.classes &&
    wouldIncreaseCount(before.classes, after.classes, input.existingStudentId)
  ) {
    return {
      kind: "classes",
      limit: limits.classes,
      current: before.classes,
    };
  }

  return null;
}

export function checkClassCreateAllowed(input: {
  planId: string | null | undefined;
  institutionType?: Category | null;
  educationFramework?: "regular" | "special" | null;
  students: Student[];
  className: string;
  knownClassNames?: string[];
  planCustomClasses?: number | null;
  planCustomStudents?: number | null;
}): PlanLimitViolation | null {
  const limits = getLimits(
    input.planId,
    {
      classes: input.planCustomClasses,
      students: input.planCustomStudents,
    },
    input.educationFramework ?? "regular"
  );
  if (!limits) return null;
  if (!planIncludesSpecialEdClasses(limits)) {
    const usage = countPlanUsage(
      input.students,
      input.institutionType,
      input.knownClassNames
    );
    return specialEdClassesNotIncludedViolation(usage.classes);
  }

  const key = normalizeClassKey(input.className);
  const usage = countPlanUsage(
    input.students,
    input.institutionType,
    input.knownClassNames
  );

  const existingKeys =
    input.institutionType === "kindergartens"
      ? new Set<string>()
      : collectSpecialEdClassKeys(input.students, input.knownClassNames ?? []);
  if (input.institutionType === "kindergartens") {
    for (const student of input.students) {
      const gardenKey = gardenKeyFromStudent(student);
      if (gardenKey) existingKeys.add(gardenKey);
    }
  }

  if (existingKeys.has(key)) return null;
  const classLimit = limits.classes ?? 0;
  if (usage.classes >= classLimit) {
    return {
      kind: "classes",
      limit: classLimit,
      current: usage.classes,
    };
  }

  return null;
}

export function planLimitErrorMessage(violation: PlanLimitViolation): string {
  switch (violation.kind) {
    case "integration_portfolios":
      return `הגעתם למכסת תיקי השילוב / סל אישי בחבילה (${violation.limit}).`;
    case "personal_baskets":
      return "החבילה שנבחרה אינה כוללת סל אישי.";
    case "students":
      return `הגעתם למכסת התלמידים בחבילה (${violation.limit}).`;
    case "students_per_class":
      return `בכיתה קטנה מותרים עד ${violation.limit} תלמידים (כרגע ${violation.current}).`;
    case "classes":
      if (violation.limit === 0) {
        return "החבילה שנבחרה אינה כוללת כיתות חינוך מיוחד.";
      }
      return (
        `הגעתם למכסת הכיתות/גנים בחבילה (${violation.limit}). ` +
        `כבר קיימות ${violation.current} כיתות. ` +
        "אפשר לשייך תלמידים לכיתה קיימת או לשדרג את החבילה."
      );
    default:
      return "הפעולה חורגת ממגבלות החבילה.";
  }
}

/** Import-preview copy: lists existing classes and the name from the file. */
export function formatClassQuotaMessage(
  violation: PlanLimitViolation,
  options?: {
    existingClassNames?: string[];
    requestedClassName?: string;
  }
): string {
  if (violation.kind !== "classes" || violation.limit === 0) {
    return planLimitErrorMessage(violation);
  }
  const existing = Array.from(
    new Set(
      (options?.existingClassNames ?? [])
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
  const existingText =
    existing.length > 0
      ? ` הכיתות הקיימות: ${existing.join(", ")}.`
      : ` כבר קיימות ${violation.current} כיתות.`;
  const requested = options?.requestedClassName?.trim();
  const requestedText = requested
    ? ` הכיתה בקובץ («${requested}») תיחשב ככיתה חדשה.`
    : "";
  return (
    `הגעתם למכסת הכיתות/גנים בחבילה (${violation.limit}).` +
    existingText +
    requestedText +
    " אפשר לשייך את השורות לכיתה קיימת או לשדרג את החבילה."
  );
}

export class PlanLimitError extends Error {
  readonly violation: PlanLimitViolation;

  constructor(violation: PlanLimitViolation) {
    super(planLimitErrorMessage(violation));
    this.name = "PlanLimitError";
    this.violation = violation;
  }
}
