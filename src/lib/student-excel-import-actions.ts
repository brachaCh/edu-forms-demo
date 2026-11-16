/**
 * Testable import actions for student Excel import.
 * Dependencies are injected for testing.
 */

import { hasLastName } from "@/lib/person-name";
import type {
  Category,
  IntegrationFrequency,
  Student,
  StudentStatus,
} from "@/lib/supabase/types";
import {
  normalizeSpecialEdClassName,
  shouldWriteSpecialEdClassName,
  specialEdClassMatchKey,
} from "@/lib/special-ed-classes";
import {
  checkClassCreateAllowed,
  checkStudentWriteAllowed,
  formatClassQuotaMessage,
  PlanLimitError,
  planLimitErrorMessage,
  type PlanLimitViolation,
} from "@/lib/plan-limits";
import {
  buildStudentImportNotes,
  idNumberMatchKey,
  mergeStudentImportNotes,
  stripCharacterizationNoteLines,
  type ParsedImportRow,
} from "@/lib/student-excel-import";
import {
  isTenantForbiddenError,
  teacherNameForExcelImport,
  teacherNameForWrite,
} from "@/lib/teacher-assignment";

/**
 * Teacher name used for create + תל״כ sync.
 * Members: their staff-card name (ignore the page/Excel prop).
 * Admins: page prop (row.teacher_name is applied separately on create).
 */
export function resolveEffectiveTeacherName(options: {
  isAdmin: boolean;
  propTeacherName?: string | null;
  memberTeacherName?: string | null;
}): string | null {
  if (options.isAdmin) {
    return options.propTeacherName?.trim() || null;
  }
  return options.memberTeacherName?.trim() || null;
}

export interface ImportDeps {
  getStudents: () => Student[];
  getUser: () => { plan_id?: string | null; institution_type?: Category; education_framework?: "regular" | "special" | null; plan_custom_classes?: number | null; plan_custom_students?: number | null } | null;
  saveStudent: (data: Partial<Student> & { category: Category; full_name: string }) => Promise<Student>;
  updateStudent: (id: string, patch: Partial<Student>) => Promise<Student | null>;
  getKnownSpecialEdClassNames: (category: Category) => string[];
}

export interface ImportRowResult {
  rowNumber: number;
  fullName: string;
  outcome: "created" | "updated" | "skipped" | "failed";
  error?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: ImportRowResult[];
  classesChanged: Set<string>;
}

export interface ImportOptions {
  status: StudentStatus;
  category: Category;
  defaultClassName?: string | null;
  teacherName?: string | null;
  /** TZ-32: owner / system is_admin only — institution admin cannot assign teachers */
  canAssignTeachers?: boolean;
  /**
   * When false (members), "ok" rows are skipped instead of created.
   * Preview still shows them as ok / "only admins can add" — not failed-as-create.
   */
  allowCreates?: boolean;
  /**
   * Explicit frequency default for creates when the Excel cell is empty.
   * Only the «בחרו שכיחות» dialog should pass "high". Regular import omits this.
   */
  defaultFrequency?: IntegrationFrequency | null;
  knownClassNames?: string[];
}

/** Optional card columns — empty Excel cells are omitted so they never overwrite. */
function optionalImportedCardFields(row: ParsedImportRow): Partial<Student> {
  const patch: Partial<Student> = {};
  if (row.family_status) patch.family_status = row.family_status;
  if (row.single_responsible_party != null) {
    patch.single_responsible_party = row.single_responsible_party;
  }
  if (row.homeroom_teacher) patch.homeroom_teacher = row.homeroom_teacher;
  if (row.eligibility_committee_date) {
    patch.eligibility_committee_date = row.eligibility_committee_date;
  }
  if (row.education_support) patch.education_support = row.education_support;
  if (row.additional_treatments) {
    patch.additional_treatments = row.additional_treatments;
  }
  if (row.calendar_year != null) patch.calendar_year = row.calendar_year;
  return patch;
}

/**
 * Build update patch from Excel row - excludes protected fields (status, full_name).
 * Only includes non-empty fields from the Excel.
 *
 * TZ-32: teacher_name only when canAssignTeachers (owner / is_admin).
 * Institution admin and members omit the field — they cannot assign teachers.
 */
export function buildUpdatePatch(
  row: ParsedImportRow,
  options: {
    canAssignTeachers?: boolean;
    defaultClassName?: string | null;
    status?: StudentStatus;
    knownClassNames?: string[];
  },
  existing?: Pick<
    Student,
    "notes" | "class_name" | "characterization" | "id_number"
  > & { full_name?: Student["full_name"] } | null
): Partial<Student> {
  const patch: Partial<Student> = {};

  const incomingName = row.full_name?.trim() ?? "";
  if (incomingName) {
    const existingName = existing?.full_name?.trim() ?? "";
    if (
      !existingName ||
      (!hasLastName(existingName) && hasLastName(incomingName))
    ) {
      patch.full_name = incomingName;
    }
  }

  // Empty Excel cells never overwrite existing values
  if (row.phone) patch.phone = row.phone;
  if (row.email) patch.email = row.email;
  if (row.father_email) patch.father_email = row.father_email;
  if (row.mother_email) patch.mother_email = row.mother_email;
  if (row.birth_date) patch.birth_date = row.birth_date;
  if (row.integration_start_date) {
    patch.integration_start_date = row.integration_start_date;
  }
  if (row.id_number) {
    const existingKey = idNumberMatchKey(existing?.id_number);
    const incomingKey = idNumberMatchKey(row.id_number);
    // Never overwrite a stored ת.ז. with a different one (same identity may reformat).
    if (!existingKey || existingKey === incomingKey) {
      patch.id_number = row.id_number;
    }
  }
  if (row.gender) patch.gender = row.gender;
  if (row.home_address) patch.home_address = row.home_address;
  if (row.city) patch.city = row.city;
  if (row.father_name) patch.father_name = row.father_name;
  if (row.mother_name) patch.mother_name = row.mother_name;
  if (row.father_mobile) patch.father_mobile = row.father_mobile;
  if (row.mother_mobile) patch.mother_mobile = row.mother_mobile;
  if (row.characterization) patch.characterization = row.characterization;
  if (row.frequency) patch.integration_frequency = row.frequency;
  Object.assign(patch, optionalImportedCardFields(row));

  if (row.class_name) {
    const normalized = normalizeSpecialEdClassName(row.class_name);
    const existingClass = (existing?.class_name ?? "").trim();
    const sameClass =
      existingClass &&
      specialEdClassMatchKey(normalized) ===
        specialEdClassMatchKey(existingClass);
    if (
      !sameClass &&
      (options.status !== "special-ed-class" ||
        shouldWriteSpecialEdClassName({
          existingClassName: existing?.class_name,
          incomingClassName: normalized,
          defaultClassName: options.defaultClassName,
          knownClassNames: options.knownClassNames,
        }))
    ) {
      patch.class_name = normalized;
    }
  } else if (!existing?.class_name?.trim() && options.defaultClassName?.trim()) {
    patch.class_name = normalizeSpecialEdClassName(options.defaultClassName);
  }

  const assignedTeacher = teacherNameForExcelImport(
    row.teacher_name,
    options.canAssignTeachers === true
  );
  if (assignedTeacher) {
    patch.teacher_name = assignedTeacher;
  }

  let notesBase = existing?.notes ?? null;
  if (row.characterization) {
    notesBase = stripCharacterizationNoteLines(notesBase, [
      row.characterization,
      existing?.characterization,
    ]);
  }
  const mergedNotes = mergeStudentImportNotes(notesBase, {
    notes: row.notes,
    functioning: row.functioning,
  });
  if (mergedNotes) {
    patch.notes = mergedNotes;
  } else if (row.characterization && notesBase !== (existing?.notes ?? null)) {
    patch.notes = notesBase;
  }

  return patch;
}

/**
 * Check if a class name is valid for import.
 * Returns null if valid, or an error message if not.
 */
export function checkClassValid(
  className: string,
  knownClasses: string[],
  deps: ImportDeps,
  options: ImportOptions
): string | null {
  const normalized = normalizeSpecialEdClassName(className);
  const matchKey = specialEdClassMatchKey(normalized);
  const existingName = knownClasses.find(
    (name) => specialEdClassMatchKey(name) === matchKey
  );
  if (existingName) {
    return null;
  }
  
  const user = deps.getUser();
  if (!user?.plan_id) {
    return `כיתה לא קיימת: "${className}"`;
  }
  
  const violation = checkClassCreateAllowed({
    planId: user.plan_id,
    institutionType: user.institution_type ?? options.category,
    educationFramework: user.education_framework ?? null,
    students: deps.getStudents(),
    className: normalized,
    knownClassNames: knownClasses,
    planCustomClasses: user.plan_custom_classes ?? null,
    planCustomStudents: user.plan_custom_students ?? null,
  });
  
  if (violation) {
    return formatClassQuotaMessage(violation, {
      existingClassNames: knownClasses,
      requestedClassName: className,
    });
  }
  
  return null; // Can create new class
}

/**
 * Check if adding a student to a class is allowed by plan limits.
 */
export function checkStudentAllowed(
  row: ParsedImportRow,
  existingStudentId: string | null,
  deps: ImportDeps,
  options: ImportOptions
): PlanLimitViolation | null {
  const user = deps.getUser();
  if (!user?.plan_id) return null;
  
  const className = resolveCreatedClassName(row, {
    ...options,
    knownClassNames:
      options.knownClassNames ??
      deps.getKnownSpecialEdClassNames(options.category),
  });

  return checkStudentWriteAllowed({
    planId: user.plan_id,
    institutionType: user.institution_type ?? options.category,
    educationFramework: user.education_framework ?? null,
    students: deps.getStudents(),
    student: {
      category: options.category,
      full_name: row.full_name,
      status: options.status,
      class_name: className || null,
      teacher_name: options.teacherName || null,
    },
    existingStudentId,
    knownClassNames: deps.getKnownSpecialEdClassNames(options.category),
    planCustomClasses: user.plan_custom_classes ?? null,
    planCustomStudents: user.plan_custom_students ?? null,
  });
}

function resolveCreatedFrequency(
  row: ParsedImportRow,
  options: ImportOptions
): IntegrationFrequency | null {
  if (row.frequency) return row.frequency;
  // Do not invent "high" for סל אישי. Regular Excel import leaves it unset;
  // the «בחרו שכיחות» dialog passes defaultFrequency: "high" explicitly.
  return options.defaultFrequency ?? null;
}

/**
 * Special-ed still defaults an empty class to «כיתה».
 * When the user imports from a specific class page, that class wins — the
 * Excel cell may still say «ד» / «ג» after a preview remap.
 * Personal-basket / integration keep empty or whitespace as no class.
 */
export function resolveCreatedClassName(
  row: ParsedImportRow,
  options: ImportOptions
): string | null {
  if (options.status === "special-ed-class") {
    const rawRow = (row.class_name ?? "").trim();
    const known = options.knownClassNames ?? [];
    if (rawRow && known.length > 0) {
      for (const name of known) {
        if (name.trim() === rawRow) {
          return normalizeSpecialEdClassName(name);
        }
      }
    }
    const target = (options.defaultClassName || rawRow || "").trim();
    return normalizeSpecialEdClassName(target);
  }
  const raw = (row.class_name || options.defaultClassName || "").trim();
  return raw || null;
}

/** Hebrew error for a failed create/update — never an English API code. */
export function importWriteErrorMessage(
  err: unknown,
  kind: "create" | "update"
): string {
  if (err instanceof PlanLimitError) return err.message;

  const obj =
    err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const message = err instanceof Error ? err.message : "";
  const code = typeof obj?.code === "string" ? obj.code : "";
  const permissionFallback =
    kind === "create" ? "אין הרשאה ליצור תלמיד זה" : "אין הרשאה לעדכן תלמיד זה";

  if (code === "PLAN_LIMIT_EXCEEDED" || message === "PLAN_LIMIT_EXCEEDED") {
    return message && message !== "PLAN_LIMIT_EXCEEDED"
      ? message
      : "הפעולה חורגת ממגבלות החבילה.";
  }
  if (message.includes("מכסת") || message.includes("החבילה שנבחרה")) {
    return message;
  }
  if (code === "VALIDATION_ERROR" || message === "VALIDATION_ERROR") {
    return "לא ניתן לשמור את השורה — בדקו את פרטי התלמיד בקובץ.";
  }
  if (
    isTenantForbiddenError(code) ||
    isTenantForbiddenError(message)
  ) {
    return permissionFallback;
  }
  if (is403Error(err)) {
    if (message && message !== "Forbidden" && !message.startsWith("TENANT_OP")) {
      return message;
    }
    return permissionFallback;
  }
  return message || "שגיאה לא צפויה";
}

export function formatImportOutcomeMessage(
  result: Pick<ImportResult, "created" | "updated" | "failed" | "results">,
  options?: { className?: string | null }
): string {
  const firstError = result.results.find((row) => row.outcome === "failed")
    ?.error;
  if (result.created === 0 && result.updated === 0 && result.failed > 0) {
    return firstError
      ? `הייבוא נכשל: ${firstError}`
      : `הייבוא נכשל — ${result.failed} תלמידים לא נשמרו.`;
  }
  if (result.created === 0 && result.updated === 0) {
    return "לא יובאו תלמידים.";
  }
  const parts: string[] = [];
  if (result.created > 0) {
    const classLabel = options?.className?.trim();
    parts.push(
      classLabel
        ? `יובאו ${result.created} תלמידים לכיתה «${classLabel}» בהצלחה`
        : `יובאו ${result.created} תלמידים בהצלחה`
    );
  }
  if (result.updated > 0) {
    parts.push(`עודכנו ${result.updated}`);
  }
  if (result.failed > 0) {
    parts.push(
      firstError
        ? `${result.failed} נכשלו (${firstError})`
        : `${result.failed} נכשלו`
    );
  }
  return `${parts.join(". ")}.`;
}

function is403Error(err: unknown): boolean {
  if (err && typeof err === "object") {
    if ("status" in err && (err as { status: number }).status === 403) {
      return true;
    }
    if ("code" in err && (err as { code: string }).code === "403") return true;
    if (
      "statusCode" in err &&
      (err as { statusCode: number }).statusCode === 403
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Execute the import for all rows.
 */
export async function executeImport(
  rows: ParsedImportRow[],
  deps: ImportDeps,
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: [],
    classesChanged: new Set<string>(),
  };
  
  const allowCreates = options.allowCreates !== false;
  const toCreate = allowCreates ? rows.filter((row) => row.status === "ok") : [];
  const toUpdate = rows.filter((row) => row.status === "update");
  
  // Track classes that change
  const addClassChange = (className: string | null | undefined) => {
    if (className) {
      const normalized = normalizeSpecialEdClassName(className);
      if (normalized) {
        result.classesChanged.add(normalized);
      }
    }
  };
  
  // Process new students
  for (const row of toCreate) {
    const className = resolveCreatedClassName(row, {
      ...options,
      knownClassNames:
        options.knownClassNames ??
        deps.getKnownSpecialEdClassNames(options.category),
    });
    
    // TZ-32: only owner / is_admin may write teacher_name.
    // Institution admin and members always omit assignment.
    const teacherNameForCreate = teacherNameForWrite(
      row.teacher_name || options.teacherName,
      options.canAssignTeachers === true
    );

    const createViolation = checkStudentAllowed(row, null, deps, options);
    if (createViolation) {
      result.failed += 1;
      result.results.push({
        rowNumber: row.rowNumber,
        fullName: row.full_name,
        outcome: "failed",
        error: planLimitErrorMessage(createViolation),
      });
      continue;
    }
    
    try {
      await deps.saveStudent({
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        ...(row.father_email ? { father_email: row.father_email } : {}),
        ...(row.mother_email ? { mother_email: row.mother_email } : {}),
        birth_date: row.birth_date,
        integration_start_date: row.integration_start_date,
        id_number: row.id_number,
        gender: row.gender,
        home_address: row.home_address,
        city: row.city,
        father_name: row.father_name,
        mother_name: row.mother_name,
        father_mobile: row.father_mobile,
        mother_mobile: row.mother_mobile,
        category: options.category,
        status: options.status,
        class_name: className || null,
        teacher_name: teacherNameForCreate,
        characterization: row.characterization,
        notes: buildStudentImportNotes({
          notes: row.notes,
          functioning: row.functioning,
        }),
        integration_frequency: resolveCreatedFrequency(row, options),
        ...optionalImportedCardFields(row),
      });
      result.created += 1;
      addClassChange(className);
      result.results.push({
        rowNumber: row.rowNumber,
        fullName: row.full_name,
        outcome: "created",
      });
    } catch (err) {
      result.failed += 1;
      result.results.push({
        rowNumber: row.rowNumber,
        fullName: row.full_name,
        outcome: "failed",
        error: importWriteErrorMessage(err, "create"),
      });
    }
  }
  
  // Process updates
  for (const row of toUpdate) {
    if (!row.existingStudentId) {
      result.skipped += 1;
      result.results.push({
        rowNumber: row.rowNumber,
        fullName: row.full_name,
        outcome: "skipped",
        error: "מזהה תלמיד חסר",
      });
      continue;
    }
    
    try {
      const existingStudent = deps.getStudents().find(s => s.id === row.existingStudentId);
      const patch = buildUpdatePatch(
        row,
        {
          canAssignTeachers: options.canAssignTeachers,
          defaultClassName: options.defaultClassName,
          status: options.status,
          knownClassNames: deps.getKnownSpecialEdClassNames(options.category),
        },
        existingStudent
      );

      const oldClassName = existingStudent?.class_name;
      
      // Check if class_name change is allowed
      if (patch.class_name) {
        const violation = checkStudentAllowed(row, row.existingStudentId, deps, options);
        if (violation) {
          result.failed += 1;
          result.results.push({
            rowNumber: row.rowNumber,
            fullName: row.full_name,
            outcome: "failed",
            error: planLimitErrorMessage(violation),
          });
          continue;
        }
      }
      
      const updated = await deps.updateStudent(row.existingStudentId, patch);
      if (updated) {
        result.updated += 1;
        // Track new class
        const newClassName = patch.class_name || row.class_name || options.defaultClassName;
        addClassChange(newClassName);
        // Track old class if different (for resync)
        if (oldClassName && oldClassName !== newClassName) {
          addClassChange(oldClassName);
        }
        result.results.push({
          rowNumber: row.rowNumber,
          fullName: row.full_name,
          outcome: "updated",
        });
      } else {
        result.failed += 1;
        result.results.push({
          rowNumber: row.rowNumber,
          fullName: row.full_name,
          outcome: "failed",
          error: "לא נמצא תלמיד לעדכון",
        });
      }
    } catch (err) {
      result.failed += 1;
      result.results.push({
        rowNumber: row.rowNumber,
        fullName: row.full_name,
        outcome: "failed",
        error: importWriteErrorMessage(err, "update"),
      });
    }
  }
  
  // Count skipped rows (members' "ok" creates stay skipped, not failed)
  const skippedRows = rows.filter(
    (row) =>
      row.status === "error" ||
      row.status === "duplicate_in_file" ||
      row.status === "over_capacity" ||
      (!allowCreates && row.status === "ok")
  );
  result.skipped += skippedRows.length;
  
  return result;
}
