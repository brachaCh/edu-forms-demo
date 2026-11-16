import { isBillingExemptProfile } from "@/lib/billing-access";
import { isFreeAccessMode } from "@/lib/free-access";
import { getStudents, getUser } from "@/lib/mock-store";
import {
  checkClassCreateAllowed,
  checkStudentWriteAllowed,
  countPlanUsage,
  planAllowsSpecialEdClasses,
  type PlanLimitViolation,
  type PlanUsage,
} from "@/lib/plan-limits";
import { getKnownSpecialEdClassNames } from "@/lib/special-ed-classes";
import type { Category, Student } from "@/lib/supabase/types";

/** האם החבילה הנוכחית כוללת כיתות חינוך מיוחד / תל״כ — ליצירה חדשה. */
export function canAccessSpecialEdClasses(): boolean {
  if (typeof window === "undefined") return false;
  if (isFreeAccessMode()) return true;
  const user = getUser();
  if (!user) return false;
  if (isBillingExemptProfile(user)) return true;
  return planAllowsSpecialEdClasses(
    user.plan_id,
    {
      classes: user.plan_custom_classes,
      students: user.plan_custom_students,
    },
    user.education_framework ?? "regular"
  );
}

/** יש בבית הספר תלמידי חנ״מ קיימים — נשארים גלויים גם בלי מכסת כיתות. */
export function hasExistingSpecialEdStudents(): boolean {
  if (typeof window === "undefined") return false;
  return getStudents().some(
    (student) => student.status === "special-ed-class" && !student.archived_at
  );
}

/** הצגת שורת/עמוד חנ״מ: זכאות בחבילה או תלמידים קיימים. */
export function shouldShowSpecialEdClasses(): boolean {
  return canAccessSpecialEdClasses() || hasExistingSpecialEdStudents();
}

export function shouldEnforcePlanLimits(): boolean {
  if (typeof window === "undefined") return false;
  if (isFreeAccessMode()) return false;
  const user = getUser();
  if (!user || isBillingExemptProfile(user)) return false;
  return Boolean(user.plan_id);
}

export function getActivePlanLimitContext(category?: Category | null): {
  planId: string;
  institutionType: Category | null;
  educationFramework: "regular" | "special" | null;
  students: Student[];
  knownClassNames: string[];
  planCustomClasses: number | null;
  planCustomStudents: number | null;
} | null {
  if (!shouldEnforcePlanLimits()) return null;
  const user = getUser();
  if (!user?.plan_id) return null;

  const institutionType =
    user.institution_type ?? category ?? ("schools" as Category);

  return {
    planId: user.plan_id,
    institutionType,
    educationFramework: user.education_framework ?? null,
    students: getStudents(),
    knownClassNames: getKnownSpecialEdClassNames(
      institutionType === "tutorials" ? "schools" : institutionType,
      { includePlaceholder: false }
    ),
    planCustomClasses: user.plan_custom_classes ?? null,
    planCustomStudents: user.plan_custom_students ?? null,
  };
}

export function getCurrentPlanUsage(
  category?: Category | null
): PlanUsage | null {
  const context = getActivePlanLimitContext(category);
  if (!context) return null;
  return countPlanUsage(
    context.students,
    context.institutionType,
    context.knownClassNames
  );
}

export function assertStudentWithinPlanLimits(input: {
  student: Pick<
    Student,
    "id" | "status" | "category" | "class_name" | "teacher_name" | "notes" | "full_name"
  >;
  existingStudentId?: string | null;
}): PlanLimitViolation | null {
  const context = getActivePlanLimitContext(input.student.category);
  if (!context) return null;

  return checkStudentWriteAllowed({
    planId: context.planId,
    institutionType: context.institutionType,
    educationFramework: context.educationFramework,
    students: context.students,
    student: input.student,
    existingStudentId: input.existingStudentId,
    knownClassNames: context.knownClassNames,
    planCustomClasses: context.planCustomClasses,
    planCustomStudents: context.planCustomStudents,
  });
}

/** False when the package is full — disable «הוספת כיתה» so a second class cannot be created. */
export function canCreateAnotherSpecialEdClass(
  category: Category = "schools"
): boolean {
  if (!canAccessSpecialEdClasses()) return false;
  if (isFreeAccessMode()) return true;
  const user = getUser();
  if (!user) return false;
  if (isBillingExemptProfile(user)) return true;
  return assertClassWithinPlanLimits("__new_special_ed_class__", category) == null;
}

export function assertClassWithinPlanLimits(
  className: string,
  category: Category = "schools"
): PlanLimitViolation | null {
  const context = getActivePlanLimitContext(category);
  if (!context) return null;

  return checkClassCreateAllowed({
    planId: context.planId,
    institutionType: context.institutionType,
    educationFramework: context.educationFramework,
    students: context.students,
    className,
    knownClassNames: context.knownClassNames,
    planCustomClasses: context.planCustomClasses,
    planCustomStudents: context.planCustomStudents,
  });
}
