import { createServiceClient } from "@/lib/supabase/admin";
import {
  extractStudentIdFromStoragePath,
  parseStudentDocumentStorageRef,
} from "@/lib/student-document-storage-ref";
import {
  createStudentDocumentSignedDownloadUrl,
  removeStudentDocumentObject,
} from "@/lib/student-document-storage";
import {
  assertPaperWaiverScanUpload,
  PAPER_WAIVER_ACTIVE_EXISTS,
  PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED,
  PAPER_WAIVER_USE_ARCHIVE_OP,
} from "@/lib/paper-waiver-scan";
import { loadInstitutionBillingContext } from "@/lib/billing/institution-plan";
import {
  checkStudentWriteAllowed,
  PlanLimitError,
} from "@/lib/plan-limits";
import { mergeFormFillStatus } from "@/lib/form-fill-status";
import { mergeFillDataPreservingThirdPartySignatures } from "@/lib/form-fill-public-data";
import {
  FORM_FILL_DELETE_NOT_ALLOWED,
  FORM_FILL_NOT_FOUND,
  FORM_FILL_SIGNED_DELETE_BLOCKED,
  formFillDeletionBlocked,
  isDeletablePortfolioFormId,
  isSignedArchiveDocumentName,
} from "@/lib/form-fill-delete";
import { personNamesMatch } from "@/lib/person-name";
import type {
  FormFillStatus,
  InstitutionMembershipRole,
  Student,
  StudentCustomField,
  StudentDocument,
  StudentFormFill,
  UserProfile,
} from "@/lib/supabase/types";
import {
  toInstitutionStaffPickerRow,
  toStaffFillRecipient,
  type InstitutionStaffPickerRow,
  type StaffFillRecipient,
} from "@/lib/student-team-staff";

/**
 * TZ-28: Context for member-scoped student access.
 * Members (non-owner/admin) only see students assigned to them.
 */
export interface MemberAccessContext {
  userId: string;
  institutionId: string;
  membershipRole: InstitutionMembershipRole | null;
  /** System staff (is_admin on profile) — full access like owner */
  isAdmin?: boolean;
  /** Demo/guest user — full access for demo purposes */
  isDemo?: boolean;
}

/**
 * TZ-28: Check if user has full institution access (owner, admin, system staff, or demo).
 * Members have scoped access only.
 */
export function hasFullInstitutionAccess(ctx: MemberAccessContext): boolean {
  // Demo users and system admins always have full access
  if (ctx.isDemo || ctx.isAdmin) return true;
  return ctx.membershipRole === "owner" || ctx.membershipRole === "admin";
}

/**
 * TZ-32: Check if user can assign students to teachers (change teacher_name).
 * Only institution owner or system admin can assign — admin role CANNOT.
 * This is stricter than hasFullInstitutionAccess.
 */
export function canAssignTeachers(ctx: MemberAccessContext): boolean {
  if (ctx.isDemo || ctx.isAdmin) return true;
  return ctx.membershipRole === "owner";
}

/**
 * TZ-28: Build MemberAccessContext from a TenantSession-like object.
 * For use in routes that need to check member access.
 */
export function buildMemberAccessContext(session: {
  userId: string;
  institutionId: string;
  membershipRole: InstitutionMembershipRole | null;
  profile: Pick<UserProfile, "is_admin">;
}): MemberAccessContext {
  return {
    userId: session.userId,
    institutionId: session.institutionId,
    membershipRole: session.membershipRole,
    isAdmin: session.profile.is_admin === true,
    isDemo: session.userId === "demo-user",
  };
}

/**
 * TZ-28: Find the user's staff card in the institution.
 * Returns the staff card's full_name which is used to match teacher_name on students.
 * If not exactly one card found, logs a warning and returns null (never throws).
 */
async function findUserStaffCard(
  userId: string,
  institutionId: string
): Promise<Student | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("institution_id", institutionId)
    .eq("user_profile_id", userId)
    .eq("status", "integration-teacher");
  if (error) {
    console.error("[tenant-data] findUserStaffCard error:", error.message);
    return null;
  }
  const cards = (data ?? []) as Student[];
  if (cards.length === 0) {
    return null;
  }
  if (cards.length > 1) {
    console.warn(
      `[tenant-data] findUserStaffCard: found ${cards.length} staff cards for user ${userId} in institution ${institutionId}, expected 1`
    );
    return null;
  }
  return cards[0];
}

/**
 * TZ-28: Check if a student is assigned to the given teacher name.
 * Uses fuzzy name matching to handle slight variations.
 */
function isStudentAssignedToTeacher(
  student: Student,
  teacherName: string
): boolean {
  if (!student.teacher_name) return false;
  return personNamesMatch(student.teacher_name, teacherName);
}

/**
 * TZ-28: Filter students to only those accessible by a member.
 * A member can access:
 * 1. Their own staff card (status = "integration-teacher", user_profile_id = userId)
 * 2. Students assigned to them (teacher_name matches their staff card full_name)
 *
 * TZ-73: other staff cards are not returned here (full rows would leak notes /
 * emails). The student-team picker uses tenantFetchInstitutionStaffForPicker.
 * Opening another teacher's portfolio still requires assertMemberCanAccessStudent.
 */
function filterStudentsForMember(
  students: Student[],
  staffCard: Student | null,
  userId: string
): Student[] {
  return students.filter((s) => {
    if (
      s.status === "integration-teacher" &&
      s.user_profile_id === userId
    ) {
      return true;
    }
    if (!staffCard) return false;
    return isStudentAssignedToTeacher(s, staffCard.full_name);
  });
}

function normalizeFormFill(row: StudentFormFill): StudentFormFill {
  return {
    ...row,
    data:
      row.data && typeof row.data === "object"
        ? (row.data as Record<string, string>)
        : {},
    document_id: row.document_id ?? null,
    status: (row.status as FormFillStatus) || "draft",
  };
}

async function assertStudentInInstitution(
  studentId: string,
  institutionId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * TZ-28: Check if a member can access a specific student.
 * Returns true for owners/admins/system-staff/demo, or if member is assigned to the student.
 * Exported for use in other routes that take studentId.
 */
export async function assertMemberCanAccessStudent(
  studentId: string,
  ctx: MemberAccessContext
): Promise<boolean> {
  // Owners and admins have full access
  if (hasFullInstitutionAccess(ctx)) {
    return assertStudentInInstitution(studentId, ctx.institutionId);
  }

  // Members need scoped access check
  const supabase = createServiceClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, status, user_profile_id, teacher_name, institution_id")
    .eq("id", studentId)
    .eq("institution_id", ctx.institutionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!student) return false;

  // Own staff card is always accessible
  if (
    student.user_profile_id === ctx.userId &&
    student.status === "integration-teacher"
  ) {
    return true;
  }

  // Check if student is assigned to member's staff card
  const staffCard = await findUserStaffCard(ctx.userId, ctx.institutionId);
  if (!staffCard) return false;

  return isStudentAssignedToTeacher(student as Student, staffCard.full_name);
}

async function assertDocumentInInstitution(
  documentId: string,
  institutionId: string,
  ctx?: MemberAccessContext
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_documents")
    .select("student_id")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.student_id) return false;
  // TZ-28: Use member-scoped access if context provided
  if (ctx) {
    return assertMemberCanAccessStudent(String(data.student_id), ctx);
  }
  return assertStudentInInstitution(String(data.student_id), institutionId);
}

async function assertCustomFieldInInstitution(
  fieldId: string,
  institutionId: string,
  ctx?: MemberAccessContext
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_custom_fields")
    .select("student_id")
    .eq("id", fieldId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.student_id) return false;
  // TZ-28: Use member-scoped access if context provided
  if (ctx) {
    return assertMemberCanAccessStudent(String(data.student_id), ctx);
  }
  return assertStudentInInstitution(String(data.student_id), institutionId);
}

async function assertFormFillInInstitution(
  fillId: string,
  institutionId: string,
  ctx?: MemberAccessContext
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_form_fills")
    .select("student_id")
    .eq("id", fillId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.student_id) return false;
  if (ctx) {
    return assertMemberCanAccessStudent(String(data.student_id), ctx);
  }
  return assertStudentInInstitution(String(data.student_id), institutionId);
}

/**
 * TZ-28: Fetch students with member-scoped access.
 * Owners/admins see all students; members see only assigned students.
 */
export async function tenantFetchStudents(
  institutionId: string,
  ctx?: MemberAccessContext
): Promise<Student[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const students = (data ?? []) as Student[];

  // TZ-28: Filter for members (non-owner/admin)
  if (ctx && !hasFullInstitutionAccess(ctx)) {
    const staffCard = await findUserStaffCard(ctx.userId, institutionId);
    return filterStudentsForMember(students, staffCard, ctx.userId);
  }

  return students;
}

const STAFF_PICKER_SELECT = "id, full_name, role, phone";
const STAFF_FILL_SELECT = "full_name, email";

/**
 * TZ-73: institution-scoped staff picker for «פרטי צוות תלמיד».
 * Returns only id / full_name / role / phone — never full Student rows.
 * Members may list all institution staff names for the picker; they still
 * cannot open another teacher's portfolio (assertMemberCanAccessStudent).
 */
export async function tenantFetchInstitutionStaffForPicker(
  institutionId: string,
  ctx?: MemberAccessContext,
  category?: string | null
): Promise<InstitutionStaffPickerRow[]> {
  if (ctx && ctx.institutionId !== institutionId) {
    return [];
  }
  const supabase = createServiceClient();
  let query = supabase
    .from("students")
    .select(STAFF_PICKER_SELECT)
    .eq("institution_id", institutionId)
    .eq("status", "integration-teacher");
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query.order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    full_name?: string | null;
    role?: string | null;
    phone?: string | null;
  }>).map(toInstitutionStaffPickerRow);
}

/**
 * TZ-188: institution-scoped staff list for fill-request recipients.
 * Returns name + email for all staff with valid emails. Members may list all
 * institution staff for sending fill requests to any colleague.
 */
export async function tenantFetchInstitutionStaffForFill(
  institutionId: string,
  ctx?: MemberAccessContext,
  category?: string | null
): Promise<StaffFillRecipient[]> {
  if (ctx && ctx.institutionId !== institutionId) {
    return [];
  }
  const supabase = createServiceClient();
  let query = supabase
    .from("students")
    .select(STAFF_FILL_SELECT)
    .eq("institution_id", institutionId)
    .eq("status", "integration-teacher");
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query.order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    full_name?: string | null;
    email?: string | null;
  }>)
    .map(toStaffFillRecipient)
    .filter((r): r is StaffFillRecipient => r !== null);
}

async function enforceStudentPlanLimits(
  institutionId: string,
  student: Pick<
    Student,
    "id" | "status" | "category" | "class_name" | "teacher_name" | "notes" | "full_name"
  >,
  existingStudentId?: string | null
): Promise<void> {
  const billing = await loadInstitutionBillingContext(institutionId);
  if (!billing || billing.isAdmin || !billing.planId) return;

  const students = await tenantFetchStudents(institutionId);
  const violation = checkStudentWriteAllowed({
    planId: billing.planId,
    institutionType: billing.institutionType,
    educationFramework: billing.educationFramework,
    students,
    student,
    existingStudentId,
    planCustomClasses: billing.planCustomClasses,
    planCustomStudents: billing.planCustomStudents,
  });
  if (violation) throw new PlanLimitError(violation);
}

/**
 * Strips father_email and mother_email from a student INSERT payload when they
 * are null/undefined/empty string. This prevents column-missing errors when
 * the migration 055 hasn't been applied yet.
 */
function stripEmptyParentEmails<T extends Record<string, unknown>>(
  payload: T
): T {
  const result = { ...payload };
  if (!result.father_email || (result.father_email as string).trim() === "") {
    delete result.father_email;
  }
  if (!result.mother_email || (result.mother_email as string).trim() === "") {
    delete result.mother_email;
  }
  return result;
}

/**
 * For PATCH: strips father_email and mother_email only when they are undefined
 * (not provided in the patch). Explicit null/empty values are kept so the user
 * can clear these fields. The client-side dropParentEmailColumns handles
 * missing-column errors before migration is applied.
 */
function stripUndefinedParentEmails<T extends Record<string, unknown>>(
  payload: T
): T {
  const result = { ...payload };
  if (result.father_email === undefined) {
    delete result.father_email;
  }
  if (result.mother_email === undefined) {
    delete result.mother_email;
  }
  return result;
}

/**
 * TZ-28: Insert a new student. Members (non-owner/admin) cannot create students.
 * TZ-32: Admin users can create but cannot set teacher_name — only owner can.
 */
export async function tenantInsertStudent(
  institutionId: string,
  student: Omit<Student, "id" | "created_at" | "updated_at" | "institution_id"> & {
    institution_id?: string | null;
  },
  ctx?: MemberAccessContext
): Promise<Student> {
  // TZ-28: Members cannot create students
  if (ctx && !hasFullInstitutionAccess(ctx)) {
    throw new Error("MEMBER_CANNOT_CREATE_STUDENT");
  }

  // TZ-32: Admin users cannot set teacher_name — only owner or system admin can
  if (ctx && !canAssignTeachers(ctx) && student.teacher_name) {
    throw new Error("ADMIN_CANNOT_ASSIGN_TEACHER");
  }

  await enforceStudentPlanLimits(institutionId, {
    ...student,
    id: "new",
    full_name: student.full_name,
    category: student.category,
    status: student.status ?? null,
    class_name: student.class_name ?? null,
    teacher_name: student.teacher_name ?? null,
    notes: student.notes ?? null,
  });

  const supabase = createServiceClient();
  const insertPayload = stripEmptyParentEmails({
    ...student,
    // תמיד המוסד של הסשן — לא מה שהלקוח שלח
    institution_id: institutionId,
  });
  const { data, error } = await supabase
    .from("students")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Student;
}

/**
 * TZ-28: Fields that members are NEVER allowed to change on any student.
 * These are identity/assignment fields that could be used to gain access.
 */
const MEMBER_BLOCKED_FIELDS: ReadonlySet<keyof Student> = new Set([
  "teacher_name", // Would reassign the student to another teacher
  "status", // Could change student type (e.g., to integration-teacher)
  "user_profile_id", // Links staff card to user account
]);

/**
 * TZ-28: Additional fields members cannot change on their OWN staff card.
 * Prevents member from changing their own identity.
 */
const MEMBER_BLOCKED_ON_OWN_STAFF_CARD: ReadonlySet<keyof Student> = new Set([
  "full_name", // Renaming self could be used to match another teacher's assignments
]);

/**
 * TZ-28: Check if two values are effectively equal for comparison.
 * Treats null, undefined, and empty string as equivalent.
 */
function valuesEffectivelyEqual(
  newVal: unknown,
  existingVal: unknown
): boolean {
  // Normalize null/undefined/empty to null
  const normalize = (v: unknown): unknown => {
    if (v === undefined || v === null || v === "") return null;
    return v;
  };
  return normalize(newVal) === normalize(existingVal);
}

/**
 * TZ-28: Filter patch to only allowed fields for members.
 * Returns the filtered patch and any blocked keys that were attempted to change.
 * If a blocked field's value is unchanged from existing, it's silently dropped (not blocked).
 */
function filterMemberPatch(
  patch: Partial<Student>,
  existing: Student,
  isOwnStaffCard: boolean
): { allowed: Partial<Student>; blocked: string[] } {
  const allowed: Partial<Student> = {};
  const blocked: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const fieldKey = key as keyof Student;
    const existingValue = existing[fieldKey];

    // Check if this field is blocked for members
    const isBlockedField =
      MEMBER_BLOCKED_FIELDS.has(fieldKey) ||
      (isOwnStaffCard && MEMBER_BLOCKED_ON_OWN_STAFF_CARD.has(fieldKey));

    if (isBlockedField) {
      // If value is unchanged, silently drop it (don't add to blocked)
      if (valuesEffectivelyEqual(value, existingValue)) {
        continue;
      }
      // Value differs - this is a blocked change
      blocked.push(key);
      continue;
    }

    // Field is allowed
    (allowed as Record<string, unknown>)[key] = value;
  }

  return { allowed, blocked };
}

/**
 * TZ-28: Patch a student. Members can only edit their own assigned students,
 * with restricted fields (see MEMBER_BLOCKED_FIELDS).
 * TZ-32: Admin users also cannot change teacher_name — only owner can.
 */
export async function tenantPatchStudent(
  institutionId: string,
  id: string,
  patch: Partial<Student>,
  ctx?: MemberAccessContext
): Promise<Student> {
  const { institution_id: _ignored, ...safePatch } = patch;
  const supabase = createServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("STUDENT_NOT_FOUND");

  // TZ-28: Members have restricted editing
  let patchToApply = safePatch;
  if (ctx && !hasFullInstitutionAccess(ctx)) {
    const canAccess = await assertMemberCanAccessStudent(id, ctx);
    if (!canAccess) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    // Check if this is the member's own staff card
    const isOwnStaffCard =
      (existing as Student).user_profile_id === ctx.userId &&
      (existing as Student).status === "integration-teacher";

    // Filter to allowed fields only, comparing with existing values
    const { allowed, blocked } = filterMemberPatch(
      safePatch,
      existing as Student,
      isOwnStaffCard
    );

    // If member tried to change blocked fields, reject the request
    if (blocked.length > 0) {
      // Specific error for teacher_name to match existing behavior
      if (blocked.includes("teacher_name")) {
        throw new Error("MEMBER_CANNOT_CHANGE_TEACHER");
      }
      throw new Error("MEMBER_CANNOT_EDIT_FIELD");
    }

    patchToApply = allowed;
  } else if (ctx && !canAssignTeachers(ctx)) {
    // TZ-32: Admin users (hasFullInstitutionAccess but not canAssignTeachers)
    // cannot change teacher_name — only owner or system admin can
    const existingTeacherName = (existing as Student).teacher_name;
    const patchTeacherName = safePatch.teacher_name;
    if (
      patchTeacherName !== undefined &&
      !valuesEffectivelyEqual(patchTeacherName, existingTeacherName)
    ) {
      throw new Error("ADMIN_CANNOT_ASSIGN_TEACHER");
    }
  }

  await enforceStudentPlanLimits(
    institutionId,
    {
      ...(existing as Student),
      ...patchToApply,
      id,
      category:
        (patchToApply.category as Student["category"] | undefined) ??
        (existing as Student).category,
      full_name:
        (patchToApply.full_name as string | undefined) ??
        (existing as Student).full_name,
      status:
        patchToApply.status !== undefined
          ? (patchToApply.status as Student["status"])
          : (existing as Student).status,
      class_name:
        patchToApply.class_name !== undefined
          ? (patchToApply.class_name as string | null)
          : (existing as Student).class_name,
      teacher_name:
        patchToApply.teacher_name !== undefined
          ? (patchToApply.teacher_name as string | null)
          : (existing as Student).teacher_name,
      notes:
        patchToApply.notes !== undefined
          ? (patchToApply.notes as string | null)
          : (existing as Student).notes,
    },
    id
  );

  // For PATCH: only strip parent email keys when undefined (not provided).
  // Explicit null or empty string must be sent as null so clearing works.
  // The client-side dropParentEmailColumns handles missing-column errors.
  const patchPayload = stripUndefinedParentEmails(patchToApply as Record<string, unknown>);

  if (Object.keys(patchPayload).length === 0) {
    return existing as Student;
  }

  const { data, error } = await supabase
    .from("students")
    .update(patchPayload)
    .eq("id", id)
    .eq("institution_id", institutionId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("STUDENT_NOT_FOUND");
  return data as Student;
}

/**
 * TZ-28: Remove a student. Members (non-owner/admin) cannot delete students.
 */
export async function tenantRemoveStudent(
  institutionId: string,
  id: string,
  ctx?: MemberAccessContext
): Promise<void> {
  // TZ-28: Members cannot delete students
  if (ctx && !hasFullInstitutionAccess(ctx)) {
    throw new Error("MEMBER_CANNOT_DELETE_STUDENT");
  }

  const supabase = createServiceClient();
  const { error, count } = await supabase
    .from("students")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("institution_id", institutionId);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error("STUDENT_NOT_FOUND");
}

/** עמודות המסמך בלי התוכן עצמו — לרשימות. התוכן (base64, ~160KB בממוצע) נטען בנפרד. */
const DOCUMENT_META_COLUMNS =
  "id, student_id, name, mime_type, size, uploaded_at, folder, archived_at, calendar_year, is_paper_waiver";
const DOCUMENT_META_COLUMNS_LEGACY =
  "id, student_id, name, mime_type, size, uploaded_at, folder, archived_at, calendar_year";

function isMissingPaperWaiverColumn(message: string): boolean {
  return /is_paper_waiver/i.test(message) && /column|schema cache/i.test(message);
}

export async function tenantFetchStudentDocuments(
  institutionId: string,
  studentId: string,
  options?: { includeData?: boolean },
  ctx?: MemberAccessContext
): Promise<StudentDocument[]> {
  const supabase = createServiceClient();
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  // בדיקת השייכות למוסד והשליפה רצות במקביל; בלי שייכות — התוצאה נזרקת
  const [allowed, first] = await Promise.all([
    accessCheck,
    supabase
      .from("student_documents")
      .select(options?.includeData ? "*" : DOCUMENT_META_COLUMNS)
      .eq("student_id", studentId)
      .order("uploaded_at", { ascending: false }),
  ]);
  if (!allowed) return [];
  let rows = (first.data ?? []) as unknown as StudentDocument[];
  let error = first.error;
  if (error && isMissingPaperWaiverColumn(error.message) && !options?.includeData) {
    const retry = await supabase
      .from("student_documents")
      .select(DOCUMENT_META_COLUMNS_LEGACY)
      .eq("student_id", studentId)
      .order("uploaded_at", { ascending: false });
    rows = (retry.data ?? []) as unknown as StudentDocument[];
    error = retry.error;
  }
  if (error) throw new Error(error.message);
  if (options?.includeData) return rows;
  // data_url ריק = "לא נטען עדיין"; הצפייה/הורדה/הדפסה משלימות אותו לפי הצורך
  return rows.map((row) => ({ ...row, data_url: "" }));
}

/** תוכן מסמך יחיד — נטען רק כשפותחים/מורידים/מדפיסים */
export async function tenantFetchStudentDocumentData(
  institutionId: string,
  id: string,
  ctx?: MemberAccessContext
): Promise<{ id: string; data_url: string; size?: number } | null> {
  if (!(await assertDocumentInInstitution(id, institutionId, ctx))) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_documents")
    .select("id, student_id, name, data_url, size")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let dataUrl = String(data.data_url ?? "");
  const storageRef = parseStudentDocumentStorageRef(dataUrl);
  if (storageRef) {
    const pathStudentId = extractStudentIdFromStoragePath(storageRef.storagePath);
    if (pathStudentId !== String(data.student_id)) {
      throw new Error("DOCUMENT_READ_FAILED");
    }
    const signed = await createStudentDocumentSignedDownloadUrl(
      storageRef.storagePath,
      institutionId,
      { download: String(data.name ?? "document") }
    );
    if (!signed) throw new Error("DOCUMENT_READ_FAILED");
    dataUrl = signed;
  }
  return {
    id: String(data.id),
    data_url: dataUrl,
    size: Number(data.size ?? 0) || undefined,
  };
}

export async function storageRefAlreadyUsed(
  storageRef: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("student_documents")
    .select("id", { count: "exact", head: true })
    .eq("data_url", storageRef);
  if (error) return true;
  return (count ?? 0) > 0;
}

export async function tenantInsertStudentDocument(
  institutionId: string,
  doc: Omit<StudentDocument, "id" | "uploaded_at">,
  ctx?: MemberAccessContext
): Promise<StudentDocument> {
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(doc.student_id, ctx)
    : assertStudentInInstitution(doc.student_id, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const { is_paper_waiver: _ignoredPaperWaiver, ...safeDoc } = doc;
  void _ignoredPaperWaiver;
  const { data, error } = await supabase
    .from("student_documents")
    .insert({ ...safeDoc, is_paper_waiver: false })
    .select("*")
    .single();
  if (error && isMissingPaperWaiverColumn(error.message)) {
    const retry = await supabase
      .from("student_documents")
      .insert(safeDoc)
      .select("*")
      .single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data as StudentDocument;
  }
  if (error) throw new Error(error.message);
  return data as StudentDocument;
}

export async function tenantUpsertPaperWaiverScan(
  institutionId: string,
  doc: Omit<StudentDocument, "id" | "uploaded_at">,
  ctx?: MemberAccessContext
): Promise<StudentDocument> {
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(doc.student_id, ctx)
    : assertStudentInInstitution(doc.student_id, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  const resolved = assertPaperWaiverScanUpload({
    name: doc.name,
    mimeType: doc.mime_type,
    size: doc.size,
    dataUrl: doc.data_url,
  });
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const supabase = createServiceClient();
  const archivedAt = new Date().toISOString();
  const { data: archivedRows, error: archiveError } = await supabase
    .from("student_documents")
    .update({ archived_at: archivedAt })
    .eq("student_id", doc.student_id)
    .eq("is_paper_waiver", true)
    .is("archived_at", null)
    .select("id");
  if (archiveError && !isMissingPaperWaiverColumn(archiveError.message)) {
    throw new Error(archiveError.message);
  }
  const archivedIds = (archivedRows ?? []).map((row) => String(row.id));

  const payload = {
    ...doc,
    mime_type: resolved.mimeType,
    data_url: resolved.dataUrl ?? doc.data_url,
    is_paper_waiver: true,
    archived_at: null,
  };
  const { data, error } = await supabase
    .from("student_documents")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    if (archivedIds.length > 0) {
      const { error: revertError } = await supabase
        .from("student_documents")
        .update({ archived_at: null })
        .in("id", archivedIds);
      if (revertError) {
        console.error(
          `Paper waiver replace revert failed for document IDs [${archivedIds.join(", ")}]: ${revertError.message}`
        );
        throw new Error(
          `PAPER_WAIVER_REPLACE_REVERT_FAILED: ${error.message}`
        );
      }
    }
    throw new Error(error.message);
  }
  return data as StudentDocument;
}

/**
 * TZ-99: "Remove" a paper waiver scan by archiving it (set archived_at).
 * Legal retention: signed scans must be retained for 8 years, so we never
 * hard-delete. The audit log records "waiver.paper_remove" with student ID only.
 */
export async function tenantRemovePaperWaiverScan(
  institutionId: string,
  studentId: string,
  ctx?: MemberAccessContext
): Promise<void> {
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("student_documents")
    .update({ archived_at: archivedAt })
    .eq("student_id", studentId)
    .eq("is_paper_waiver", true)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
}

export async function tenantArchivePaperWaiverScan(
  institutionId: string,
  studentId: string,
  ctx?: MemberAccessContext
): Promise<void> {
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("student_documents")
    .update({ archived_at: archivedAt })
    .eq("student_id", studentId)
    .eq("is_paper_waiver", true)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
}

export async function tenantRemoveStudentDocument(
  institutionId: string,
  id: string,
  ctx?: MemberAccessContext
): Promise<void> {
  if (!(await assertDocumentInInstitution(id, institutionId, ctx))) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("student_documents")
    .select("id, student_id, is_paper_waiver, archived_at, data_url")
    .eq("id", id)
    .maybeSingle();
  if (existingError && !isMissingPaperWaiverColumn(existingError.message)) {
    throw new Error(existingError.message);
  }
  if (existing?.is_paper_waiver === true) {
    throw new Error(PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED);
  }
  const { error } = await supabase
    .from("student_documents")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  const storageRef = parseStudentDocumentStorageRef(
    existing && "data_url" in existing ? String(existing.data_url ?? "") : ""
  );
  if (storageRef) {
    const pathStudentId = extractStudentIdFromStoragePath(storageRef.storagePath);
    if (pathStudentId !== String(existing?.student_id)) {
      return;
    }
    await removeStudentDocumentObject(storageRef.storagePath, institutionId);
  }
}

export async function tenantUpdateStudentDocument(
  institutionId: string,
  id: string,
  patch: Partial<
    Pick<StudentDocument, "folder" | "archived_at" | "name" | "calendar_year">
  >,
  ctx?: MemberAccessContext
): Promise<StudentDocument> {
  if (!(await assertDocumentInInstitution(id, institutionId, ctx))) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  if (patch.archived_at) {
    const { data: existing, error: existingError } = await supabase
      .from("student_documents")
      .select("id, student_id, is_paper_waiver, archived_at")
      .eq("id", id)
      .maybeSingle();
    if (existingError && !isMissingPaperWaiverColumn(existingError.message)) {
      throw new Error(existingError.message);
    }
    if (existing?.is_paper_waiver === true && !existing.archived_at) {
      throw new Error(PAPER_WAIVER_USE_ARCHIVE_OP);
    }
  }
  if (patch.archived_at === null) {
    const { data: existing, error: existingError } = await supabase
      .from("student_documents")
      .select("id, student_id, is_paper_waiver, archived_at")
      .eq("id", id)
      .maybeSingle();
    if (existingError && !isMissingPaperWaiverColumn(existingError.message)) {
      throw new Error(existingError.message);
    }
    if (existing?.is_paper_waiver === true) {
      const { data: active, error: activeError } = await supabase
        .from("student_documents")
        .select("id")
        .eq("student_id", existing.student_id)
        .eq("is_paper_waiver", true)
        .is("archived_at", null)
        .neq("id", id)
        .maybeSingle();
      if (activeError && !isMissingPaperWaiverColumn(activeError.message)) {
        throw new Error(activeError.message);
      }
      if (active) {
        throw new Error(PAPER_WAIVER_ACTIVE_EXISTS);
      }
    }
  }
  const { data, error } = await supabase
    .from("student_documents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as StudentDocument;
}

export async function tenantFetchStudentCustomFields(
  institutionId: string,
  studentId: string,
  ctx?: MemberAccessContext
): Promise<StudentCustomField[]> {
  const supabase = createServiceClient();
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  const [allowed, { data, error }] = await Promise.all([
    accessCheck,
    supabase
      .from("student_custom_fields")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: true }),
  ]);
  if (!allowed) return [];
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentCustomField[];
}

export async function tenantInsertStudentCustomField(
  institutionId: string,
  field: Omit<StudentCustomField, "id" | "created_at" | "updated_at">,
  ctx?: MemberAccessContext
): Promise<StudentCustomField> {
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(field.student_id, ctx)
    : assertStudentInInstitution(field.student_id, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_custom_fields")
    .insert(field)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as StudentCustomField;
}

export async function tenantPatchStudentCustomField(
  institutionId: string,
  id: string,
  patch: Partial<Pick<StudentCustomField, "label" | "value">>,
  ctx?: MemberAccessContext
): Promise<StudentCustomField> {
  if (!(await assertCustomFieldInInstitution(id, institutionId, ctx))) {
    throw new Error("FIELD_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_custom_fields")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as StudentCustomField;
}

export async function tenantRemoveStudentCustomField(
  institutionId: string,
  id: string,
  ctx?: MemberAccessContext
): Promise<void> {
  if (!(await assertCustomFieldInInstitution(id, institutionId, ctx))) {
    throw new Error("FIELD_NOT_FOUND");
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("student_custom_fields")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function tenantFetchStudentFormFill(
  institutionId: string,
  studentId: string,
  formId: string,
  ctx?: MemberAccessContext
): Promise<StudentFormFill | null> {
  const supabase = createServiceClient();
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  const [allowed, { data, error }] = await Promise.all([
    accessCheck,
    supabase
      .from("student_form_fills")
      .select("*")
      .eq("student_id", studentId)
      .eq("form_id", formId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!allowed) return null;
  if (error) throw new Error(error.message);
  return data ? normalizeFormFill(data as StudentFormFill) : null;
}

export async function tenantFetchStudentFormFills(
  institutionId: string,
  studentId: string,
  ctx?: MemberAccessContext
): Promise<StudentFormFill[]> {
  const supabase = createServiceClient();
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  const [allowed, { data, error }] = await Promise.all([
    accessCheck,
    supabase
      .from("student_form_fills")
      .select("*")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false }),
  ]);
  if (!allowed) return [];
  if (error) throw new Error(error.message);
  return ((data ?? []) as StudentFormFill[]).map(normalizeFormFill);
}

export async function tenantFetchStudentFormFillById(
  institutionId: string,
  studentId: string,
  fillId: string,
  ctx?: MemberAccessContext
): Promise<StudentFormFill | null> {
  const supabase = createServiceClient();
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(studentId, ctx)
    : assertStudentInInstitution(studentId, institutionId);
  const [allowed, { data, error }] = await Promise.all([
    accessCheck,
    supabase
      .from("student_form_fills")
      .select("*")
      .eq("student_id", studentId)
      .eq("id", fillId)
      .maybeSingle(),
  ]);
  if (!allowed) return null;
  if (error) throw new Error(error.message);
  return data ? normalizeFormFill(data as StudentFormFill) : null;
}

export async function tenantUpsertStudentFormFill(
  institutionId: string,
  input: {
    id?: string;
    createNew?: boolean;
    student_id: string;
    form_id: string;
    data: Record<string, string>;
    status?: FormFillStatus;
    document_id?: string | null;
  },
  ctx?: MemberAccessContext
): Promise<StudentFormFill> {
  // TZ-28: Check member-scoped access if context provided
  const accessCheck = ctx
    ? assertMemberCanAccessStudent(input.student_id, ctx)
    : assertStudentInInstitution(input.student_id, institutionId);
  if (!(await accessCheck)) {
    throw new Error("STUDENT_NOT_FOUND");
  }
  const supabase = createServiceClient();
  let existingId = input.id;
  let existingStatus: FormFillStatus | undefined;
  let existingData: Record<string, string> = {};
  if (existingId) {
    const existing = await tenantFetchStudentFormFillById(
      institutionId,
      input.student_id,
      existingId,
      ctx
    );
    if (!existing || existing.form_id !== input.form_id) {
      existingId = undefined;
    } else {
      existingStatus = existing.status;
      existingData = existing.data ?? {};
    }
  }
  if (!existingId && !input.createNew) {
    const existing = await tenantFetchStudentFormFill(
      institutionId,
      input.student_id,
      input.form_id,
      ctx
    );
    existingId = existing?.id;
    existingStatus = existing?.status;
    existingData = existing?.data ?? {};
  }
  const payload = {
    student_id: input.student_id,
    form_id: input.form_id,
    data: mergeFillDataPreservingThirdPartySignatures(
      existingData,
      input.data ?? {}
    ),
    status: mergeFormFillStatus(existingStatus, input.status ?? "draft"),
    document_id: input.document_id ?? null,
    updated_at: new Date().toISOString(),
  };
  const query = existingId
    ? supabase
        .from("student_form_fills")
        .update(payload)
        .eq("id", existingId)
        .eq("student_id", input.student_id)
    : supabase.from("student_form_fills").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return normalizeFormFill(data as StudentFormFill);
}

export async function tenantRemoveStudentFormFill(
  institutionId: string,
  fillId: string,
  ctx?: MemberAccessContext
): Promise<void> {
  if (!(await assertFormFillInInstitution(fillId, institutionId, ctx))) {
    throw new Error(FORM_FILL_NOT_FOUND);
  }
  const supabase = createServiceClient();
  const { data: fill, error: fillError } = await supabase
    .from("student_form_fills")
    .select("*")
    .eq("id", fillId)
    .maybeSingle();
  if (fillError) throw new Error(fillError.message);
  if (!fill) throw new Error(FORM_FILL_NOT_FOUND);

  const formId = String(fill.form_id ?? "");
  if (!isDeletablePortfolioFormId(formId)) {
    throw new Error(FORM_FILL_DELETE_NOT_ALLOWED);
  }

  const normalized = normalizeFormFill(fill as StudentFormFill);

  const documentId = fill.document_id ? String(fill.document_id) : null;
  let linkedDocumentName: string | null = null;
  let linkedDocumentIsPaperWaiver = false;
  if (documentId) {
    const { data: doc, error: docError } = await supabase
      .from("student_documents")
      .select("id, name, is_paper_waiver")
      .eq("id", documentId)
      .maybeSingle();
    if (docError && !isMissingPaperWaiverColumn(docError.message)) {
      throw new Error(docError.message);
    }
    if (doc) {
      linkedDocumentName = String(doc.name ?? "");
      linkedDocumentIsPaperWaiver = doc.is_paper_waiver === true;
    }
  }

  const { data: simpleSignRows, error: simpleSignError } = await supabase
    .from("simplesign_submissions")
    .select("status, signed_pdf_document_id")
    .eq("form_fill_id", fillId);
  if (simpleSignError) throw new Error(simpleSignError.message);

  if (
    formFillDeletionBlocked(normalized, {
      linkedDocumentName,
      linkedDocumentIsPaperWaiver,
      simpleSignRows: simpleSignRows ?? [],
    })
  ) {
    throw new Error(FORM_FILL_SIGNED_DELETE_BLOCKED);
  }

  const linkedSnapshotDocumentId =
    documentId &&
    linkedDocumentName &&
    !isSignedArchiveDocumentName(linkedDocumentName) &&
    !linkedDocumentIsPaperWaiver
      ? documentId
      : null;

  const { error } = await supabase
    .from("student_form_fills")
    .delete()
    .eq("id", fillId);
  if (error) throw new Error(error.message);

  if (linkedSnapshotDocumentId) {
    await tenantRemoveStudentDocument(
      institutionId,
      linkedSnapshotDocumentId,
      ctx
    );
  }
}

export async function tenantFetchInstitutionById(
  institutionId: string,
  id: string
): Promise<import("@/lib/supabase/types").Institution | null> {
  // מותר לקרוא רק את המוסד של הסשן
  if (id !== institutionId) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("institutions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
