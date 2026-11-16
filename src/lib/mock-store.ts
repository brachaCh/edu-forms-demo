"use client";

import type {
  Student,
  UserProfile,
  Category,
  StudentStatus,
  StudentDocument,
  StudentCustomField,
  StudentFormFill,
  FormFillStatus,
  IntegrationFrequency,
} from "./supabase/types";
import type { PersonalSector } from "./personal-sector";
import { studentMatchesFrequency } from "./integration-frequency";
import {
  clearMidYearIntake,
  isMidYearIntakePending,
} from "./mid-year-intake";
import { isClassCurriculumStudent } from "./special-ed-mode";
import { personNamesMatch } from "./person-name";
import { canUseSupabase } from "./supabase-db";
import * as db from "./supabase-db";
import {
  getDataCache,
  setCustomFieldsInCache,
  setDocumentsInCache,
  setFormFillsInCache,
  setStudentsInCache,
  ensureStudentCustomFields,
  ensureStudentDocuments,
  ensureStudentFormFills,
  refreshStudentFormFills,
  loadStudentCustomFields,
  resetDataCache,
} from "./data-cache";
import { isParentSignatureField } from "./form-fields";
import { hashPassword, verifyPassword } from "./password";
import { syncAssociationLogoFromProfile } from "./document-branding";
import {
  currentCalendarYear,
  parseCalendarYear,
  resolveDocumentCalendarYear,
} from "./calendar-year";
import {
  forgetStatusCustomFieldLabel,
  getStatusCustomFieldLabels,
  isPersonalBasketCityDuplicateLabel,
  isPersonalBasketPlaceholderExtraLabel,
  rememberStatusCustomFieldLabel,
  setStatusCustomFieldLabels,
} from "./student-card";
import { isDemoMode } from "./demo-mode";
import {
  clearFreeAccessMode,
  getFreeAccessImportedStudentIds,
  isFreeAccessMode,
  rememberFreeAccessImportedStudent,
} from "./free-access";
import { notifyAuthSessionChanged } from "./auth-session-events";
import { clearAllPrintHandoffs } from "./detached-print";
import { isConfidentialityWaiverFormId } from "./confidentiality-waiver-gate";
import { mergeFormFillStatus } from "./form-fill-status";
import {
  FORM_FILL_DELETE_NOT_ALLOWED,
  FORM_FILL_NOT_FOUND,
  FORM_FILL_SIGNED_DELETE_BLOCKED,
  formFillDeletionBlocked,
  isDeletablePortfolioFormId,
  isSignedArchiveDocumentName,
} from "./form-fill-delete";
import { clearLocalBrandingCache } from "./document-branding";
import { clearLocalAiExamplesCache } from "./ai-shared-examples";
import { isBillingExemptProfile } from "./billing-access";
import {
  checkStudentWriteAllowed,
  PlanLimitError,
} from "./plan-limits";
import { getKnownSpecialEdClassNames } from "./special-ed-classes";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-guard";
import {
  canRestorePaperWaiverScan,
  documentsAfterReplacingActivePaperWaiver,
  isActivePaperWaiverScan,
  paperWaiverListDeleteDecision,
  PAPER_WAIVER_ACTIVE_EXISTS,
  PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED,
} from "@/lib/paper-waiver-scan";
import { clearNavSession } from "./navigation-back";

const USER_KEY = "matoah.user";
const USERS_BY_EMAIL_KEY = "matoah.users.by-email";
const CAN_MANAGE_STUDENTS_KEY = "matoah.can-manage-students";
const CAN_ASSIGN_TEACHERS_KEY = "matoah.can-assign-teachers";
const STUDENT_YEAR_KEY = "matoah.student-calendar-year";
const STUDENT_ARCHIVE_KEY = "matoah.student-archived";
const STUDENT_EXTRAS_KEY = "matoah.student-extra-fields";
const DOC_YEAR_KEY = "matoah.doc-calendar-year";
const CREDENTIALS_KEY = "matoah.credentials";
const STUDENTS_KEY = "matoah.students";
const DOCUMENTS_KEY = "matoah.student-documents";
const CUSTOM_FIELDS_KEY = "matoah.student-custom-fields";
const FORM_FILLS_KEY = "matoah.student-form-fills";
const REG_STEP1_KEY = "matoah.registration.step1";
const REG_STEP2_KEY = "matoah.registration.step2";

export const MAX_DOCUMENT_SIZE_BYTES = MAX_UPLOAD_BYTES;

/** שדות שנוספו במגרציה 014 (ומאוחר יותר) — נשלפים החוצה אם ה־DB עוד לא הריץ את המגרציה */
const EXTRA_STUDENT_FIELD_KEYS = [
  "id_number",
  "birth_date",
  "gender",
  "home_address",
  "city",
  "father_mobile",
  "mother_mobile",
  "email",
  "father_email",
  "mother_email",
  "role",
  "characterization",
  "family_status",
  "single_responsible_party",
  "integration_start_date",
  "eligibility_committee_date",
  "homeroom_teacher",
  "education_support",
  "additional_treatments",
] as const;

type ExtraStudentFieldKey = (typeof EXTRA_STUDENT_FIELD_KEYS)[number];

/** שדות מייל הורים שנוספו במגרציה 055 — נפרדים לטיפול ממוקד */
const PARENT_EMAIL_FIELD_KEYS = ["father_email", "mother_email"] as const;

function isExtraFieldColumnError(message: string): boolean {
  return EXTRA_STUDENT_FIELD_KEYS.some((key) => message.includes(key));
}

/** בדיקה אם מילת המפתח מופיעה כמילה שלמה (לא כתת־מחרוזת של מילה אחרת)
 * @internal */
function includesColumnName(message: string, columnName: string): boolean {
  const pattern = new RegExp(`\\b${columnName}\\b`);
  return pattern.test(message);
}

/** בדיקה אם השגיאה מתייחסת ספציפית לעמודות מייל ההורים בלבד
 * @internal exported for testing */
export function isParentEmailColumnError(message: string): boolean {
  const mentionsFatherEmail = includesColumnName(message, "father_email");
  const mentionsMotherEmail = includesColumnName(message, "mother_email");
  if (!mentionsFatherEmail && !mentionsMotherEmail) return false;
  const otherExtras = EXTRA_STUDENT_FIELD_KEYS.filter(
    (key) => key !== "father_email" && key !== "mother_email"
  );
  const mentionsOther = otherExtras.some((key) =>
    includesColumnName(message, key)
  );
  return !mentionsOther;
}

function mergeExtraFieldsIntoStudent(
  student: Student,
  extras: Partial<Student>
): Student {
  const merged = { ...student } as unknown as Record<string, unknown>;
  for (const key of EXTRA_STUDENT_FIELD_KEYS) {
    if (key in extras) {
      merged[key] = extras[key as ExtraStudentFieldKey] as unknown;
    }
  }
  return merged as unknown as Student;
}

/** מסיר רק עמודות מייל ההורים — לטיפול ממוקד בשגיאת עמודה חסרה
 * @internal exported for testing */
export function dropParentEmailColumns(
  payload: Record<string, unknown>,
  message: string,
  heldExtras: Partial<Student>
): boolean {
  if (!isParentEmailColumnError(message)) {
    return false;
  }
  let dropped = false;
  for (const key of PARENT_EMAIL_FIELD_KEYS) {
    if (key in payload) {
      (heldExtras as Record<string, unknown>)[key] = payload[key];
      delete payload[key];
      dropped = true;
    }
  }
  return dropped;
}

/** אם המסר על חוסר עמודה כולל אחד השדות החדשים — נשליף אותם החוצה
 * @internal exported for testing */
export function dropExtraStudentColumns(
  payload: Record<string, unknown>,
  message: string,
  heldExtras: Partial<Student>
): boolean {
  if (!isExtraFieldColumnError(message) && !message.includes("column")) {
    return false;
  }
  // אם השגיאה ספציפית למייל הורים — מטפלים רק בהם
  if (isParentEmailColumnError(message)) {
    return dropParentEmailColumns(payload, message, heldExtras);
  }
  let dropped = false;
  for (const key of EXTRA_STUDENT_FIELD_KEYS) {
    if (key in payload) {
      (heldExtras as Record<string, unknown>)[key] = payload[key];
      delete payload[key];
      dropped = true;
    }
  }
  return dropped;
}

function dropCalendarYearColumn(
  payload: Record<string, unknown>,
  message: string,
  markHeld: () => void
): boolean {
  if (!("calendar_year" in payload)) return false;
  if (!message.includes("calendar_year") && !message.includes("column")) {
    return false;
  }
  delete payload.calendar_year;
  markHeld();
  return true;
}

function dropIntegrationFrequencyColumn(
  payload: Record<string, unknown>,
  message: string,
  markHeld: () => void
): boolean {
  if (!("integration_frequency" in payload)) return false;
  if (
    !message.includes("integration_frequency") &&
    !message.includes("column")
  ) {
    return false;
  }
  delete payload.integration_frequency;
  markHeld();
  return true;
}

function dropArchivedAtColumn(
  payload: Record<string, unknown>,
  message: string,
  markHeld: () => void
): boolean {
  if (!("archived_at" in payload)) return false;
  if (!message.includes("archived_at") && !message.includes("column")) {
    return false;
  }
  delete payload.archived_at;
  markHeld();
  return true;
}

function readStudentArchiveMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STUDENT_ARCHIVE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStudentArchiveMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDENT_ARCHIVE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function setLocalStudentArchivedAt(
  studentId: string,
  archivedAt: string | null
): void {
  const map = readStudentArchiveMap();
  if (archivedAt) map[studentId] = archivedAt;
  else delete map[studentId];
  writeStudentArchiveMap(map);
}

function readLocalStudentArchivedAt(studentId: string): string | null {
  return readStudentArchiveMap()[studentId] ?? null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUEST_DEMO_STUDENT_IDS = new Set(["demo-student-1"]);

function assertNotGuestDemoWrite(): void {
  if (isFreeAccessMode()) {
    throw new Error("DEMO_READ_ONLY");
  }
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function establishLocalSession(profile: UserProfile): Promise<void> {
  try {
    await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
  } catch {
    // mock / offline — cookie optional
  }
}

export interface RegistrationStep1 {
  full_name: string;
  phone: string;
  email: string;
}

export interface RegistrationStep2Draft {
  institution_code: string;
  institution_name: string;
  school_name: string;
}

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("STORAGE_UNAVAILABLE");
  }
}

function readRegistrationStep1Raw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(REG_STEP1_KEY) ??
      window.sessionStorage.getItem(REG_STEP1_KEY)
    );
  } catch {
    return null;
  }
}

function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function saveRegistrationStep1(data: RegistrationStep1): void {
  if (typeof window === "undefined") {
    throw new Error("STORAGE_UNAVAILABLE");
  }

  const payload = JSON.stringify(data);
  try {
    window.localStorage.setItem(REG_STEP1_KEY, payload);
    window.sessionStorage.setItem(REG_STEP1_KEY, payload);
  } catch {
    throw new Error("STORAGE_UNAVAILABLE");
  }
}

export function getRegistrationStep1(): RegistrationStep1 | null {
  const raw = readRegistrationStep1Raw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RegistrationStep1;
  } catch {
    return null;
  }
}

export function clearRegistrationStep1(): void {
  removeKey(REG_STEP1_KEY);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(REG_STEP1_KEY);
    } catch {
      // ignore
    }
  }
}

export function clearRegistrationStep2Draft(): void {
  removeKey(REG_STEP2_KEY);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(REG_STEP2_KEY);
    } catch {
      // ignore
    }
  }
}

export function clearRegistrationDrafts(): void {
  clearRegistrationStep1();
  clearRegistrationStep2Draft();
}

/** מאפס טיוטות הרשמה ולוגואים/דוגמאות AI מהדפדפן — לקוח חדש */
export function beginFreshRegistration(): void {
  clearRegistrationDrafts();
  clearLocalBrandingCache();
  clearLocalAiExamplesCache();
}

export function saveRegistrationStep2Draft(data: RegistrationStep2Draft): void {
  if (typeof window === "undefined") {
    throw new Error("STORAGE_UNAVAILABLE");
  }
  const payload = JSON.stringify(data);
  try {
    window.localStorage.setItem(REG_STEP2_KEY, payload);
    window.sessionStorage.setItem(REG_STEP2_KEY, payload);
  } catch {
    throw new Error("STORAGE_UNAVAILABLE");
  }
}

export function getRegistrationStep2Draft(): RegistrationStep2Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(REG_STEP2_KEY) ??
      window.sessionStorage.getItem(REG_STEP2_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RegistrationStep2Draft;
  } catch {
    return null;
  }
}

export async function saveUser(
  user: UserProfile,
  institution?: { code: string; name: string; school_name: string },
  password?: string
): Promise<void> {
  clearFreeAccessMode();
  let profile = user;
  if (institution) {
    if (canUseSupabase()) {
      const row = await db.ensureInstitution(institution);
      profile = {
        ...user,
        institution_id: row.id,
        institution_code: institution.code,
        institution_name: institution.name,
        school_name: institution.school_name,
      };
    } else {
      profile = {
        ...user,
        institution_id: institution.code,
        institution_code: institution.code,
        institution_name: institution.name,
        school_name: institution.school_name,
      };
    }
  }

  let passwordHash: string | undefined;
  if (password) {
    passwordHash = await hashPassword(password);
  }

  if (canUseSupabase()) {
    try {
      profile = await db.upsertUserProfile(profile, passwordHash);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (
        (passwordHash && message.includes("password_hash")) ||
        message.includes("institution_code") ||
        message.includes("column")
      ) {
        profile = await db.upsertUserProfile(
          { ...profile, institution_code: profile.institution_code ?? null },
          message.includes("password_hash") ? undefined : passwordHash
        );
      } else {
        throw error;
      }
    }
  }

  if (institution?.code) {
    profile = {
      ...profile,
      institution_code: institution.code,
      institution_name: institution.name,
      school_name: institution.school_name,
    };
  }

  const usersByEmail = readJSON<Record<string, UserProfile>>(USERS_BY_EMAIL_KEY) ?? {};
  usersByEmail[profile.email.toLowerCase()] = profile;
  writeJSON(USERS_BY_EMAIL_KEY, usersByEmail);

  if (passwordHash) {
    const credentials = readJSON<Record<string, string>>(CREDENTIALS_KEY) ?? {};
    credentials[profile.email.toLowerCase()] = passwordHash;
    writeJSON(CREDENTIALS_KEY, credentials);
  }

  writeJSON(USER_KEY, profile);

  if (password) {
    try {
      await loginUser(profile.email, password);
      return;
    } catch (error) {
      // כניסה בסיסמה בוטלה — נשארים עם סשן שנקבע בהרשמה
      if (!(error instanceof Error && error.message === "OTP_REQUIRED")) {
        await establishLocalSession(profile);
      }
    }
  } else {
    await establishLocalSession(profile);
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserProfile> {
  clearFreeAccessMode();
  const normalizedEmail = email.trim().toLowerCase();

  if (canUseSupabase()) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (response.ok) {
        const data = (await response.json()) as { profile: UserProfile };
        const usersByEmail =
          readJSON<Record<string, UserProfile>>(USERS_BY_EMAIL_KEY) ?? {};
        const localProfile = usersByEmail[normalizedEmail];
        const mergedProfile: UserProfile = {
          ...data.profile,
          institution_code:
            data.profile.institution_code ??
            localProfile?.institution_code ??
            null,
          institution_name:
            data.profile.institution_name ??
            localProfile?.institution_name ??
            null,
          school_name:
            data.profile.school_name ?? localProfile?.school_name ?? null,
        };
        const institutionCode = await resolveInstitutionCode(mergedProfile);
        const finalProfile =
          institutionCode !== "—"
            ? { ...mergedProfile, institution_code: institutionCode }
            : mergedProfile;
        writeJSON(USER_KEY, finalProfile);
        usersByEmail[normalizedEmail] = finalProfile;
        writeJSON(USERS_BY_EMAIL_KEY, usersByEmail);
        resetDataCache();
        notifyAuthSessionChanged();
        return finalProfile;
      }

      if (response.status === 403) {
        throw new Error("OTP_REQUIRED");
      }
      if (response.status === 401) {
        throw new Error("INVALID_CREDENTIALS");
      }
      // 503 / 500 — נפילה לאימות מקומי למצב פיתוח
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "INVALID_CREDENTIALS" ||
          error.message === "OTP_REQUIRED")
      ) {
        throw error;
      }
      // continue to local fallback
    }
  }

  const credentials = readJSON<Record<string, string>>(CREDENTIALS_KEY) ?? {};
  const storedHash = credentials[normalizedEmail];

  if (!storedHash) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(password, storedHash);
  if (!valid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const usersByEmail = readJSON<Record<string, UserProfile>>(USERS_BY_EMAIL_KEY) ?? {};
  const profile = usersByEmail[normalizedEmail];
  if (!profile) {
    throw new Error("INVALID_CREDENTIALS");
  }

  writeJSON(USER_KEY, profile);
  await establishLocalSession(profile);
  return profile;
}

export async function requestLoginOtp(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!canUseSupabase()) {
    throw new Error("OTP_UNAVAILABLE");
  }
  const response = await fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail }),
  });
  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (response.status === 502) {
    throw new Error("EMAIL_SEND_FAILED");
  }
  if (!response.ok) {
    throw new Error("OTP_UNAVAILABLE");
  }
}

export async function loginUserWithOtp(
  email: string,
  code: string
): Promise<UserProfile> {
  clearFreeAccessMode();
  const normalizedEmail = email.trim().toLowerCase();
  if (!canUseSupabase()) {
    throw new Error("OTP_UNAVAILABLE");
  }

  const response = await fetch("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail, code: code.trim() }),
  });

  if (response.ok) {
    const data = (await response.json()) as { profile: UserProfile };
    const usersByEmail =
      readJSON<Record<string, UserProfile>>(USERS_BY_EMAIL_KEY) ?? {};
    const localProfile = usersByEmail[normalizedEmail];
    const mergedProfile: UserProfile = {
      ...data.profile,
      institution_code:
        data.profile.institution_code ?? localProfile?.institution_code ?? null,
      institution_name:
        data.profile.institution_name ?? localProfile?.institution_name ?? null,
      school_name: data.profile.school_name ?? localProfile?.school_name ?? null,
    };
    const institutionCode = await resolveInstitutionCode(mergedProfile);
    const finalProfile =
      institutionCode !== "—"
        ? { ...mergedProfile, institution_code: institutionCode }
        : mergedProfile;
    writeJSON(USER_KEY, finalProfile);
    usersByEmail[normalizedEmail] = finalProfile;
    writeJSON(USERS_BY_EMAIL_KEY, usersByEmail);
    resetDataCache();
    notifyAuthSessionChanged();
    return finalProfile;
  }

  if (response.status === 401) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (data?.error === "OTP_EXPIRED") throw new Error("OTP_EXPIRED");
    if (data?.error === "OTP_LOCKED") throw new Error("OTP_LOCKED");
    throw new Error("INVALID_CREDENTIALS");
  }

  const failBody = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (failBody?.error === "LOGIN_FAILED") throw new Error("LOGIN_FAILED");
  throw new Error("OTP_UNAVAILABLE");
}

export function getUser(): UserProfile | null {
  const user = readJSON<UserProfile>(USER_KEY);
  if (!user) return null;
  // שאריות מבראנץ הדמו — לא להציג כמשתמשת אמיתית
  if (!isDemoMode() && !isFreeAccessMode() && isStaleDemoProfile(user)) {
    removeKey(USER_KEY);
    return null;
  }
  return user;
}

/** מעדכן את מטמון הפרופיל אחרי הרשמה/הגדרות שנשמרו בשרת. */
/**
 * TZ-17: ניקוי כל המטמונים הספציפיים למוסד אחרי החלפת מוסד
 * חשוב לקרוא לפני טעינת נתוני המוסד החדש
 */
export function clearInstitutionSpecificCaches(): void {
  if (typeof window === "undefined") return;

  resetDataCache();
  clearLocalBrandingCache();
  clearLocalAiExamplesCache();
  clearNavSession();

  const institutionSpecificKeys = [
    STUDENTS_KEY,
    DOCUMENTS_KEY,
    CUSTOM_FIELDS_KEY,
    FORM_FILLS_KEY,
    STUDENT_YEAR_KEY,
    STUDENT_ARCHIVE_KEY,
    STUDENT_EXTRAS_KEY,
    DOC_YEAR_KEY,
  ];

  for (const key of institutionSpecificKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function cacheAuthenticatedUser(profile: UserProfile): void {
  const previous = getUser();
  const previousInstitutionId = previous?.institution_id ?? null;
  const previousUserId = previous?.id ?? null;
  writeJSON(USER_KEY, profile);
  const usersByEmail =
    readJSON<Record<string, UserProfile>>(USERS_BY_EMAIL_KEY) ?? {};
  usersByEmail[profile.email.toLowerCase()] = profile;
  writeJSON(USERS_BY_EMAIL_KEY, usersByEmail);
  syncAssociationLogoFromProfile({
    institutionId: profile.institution_id,
    institutionCode: profile.institution_code,
    institutionLogoUrl: profile.institution_logo_url,
  });
  const institutionChanged =
    previousInstitutionId !== (profile.institution_id ?? null);
  const userChanged = previousUserId !== profile.id;
  if (institutionChanged || userChanged) {
    // TZ-17: ניקוי מטמונים ספציפיים למוסד
    clearInstitutionSpecificCaches();
    notifyAuthSessionChanged();
  }
}

/** פרופיל שנוצר במצב דמו (בראנץ אחר) — לנקות ולא להציג */
export function isStaleDemoProfile(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  const email = user.email?.trim().toLowerCase() ?? "";
  return (
    user.id === "demo-user" ||
    email === "demo@example.local" ||
    email === "demo@matoah.local" ||
    email.endsWith("@matoah.local")
  );
}

export function patchUserSession(
  patch: Partial<UserProfile>
): UserProfile | null {
  const user = getUser();
  if (!user) return null;
  const updated = { ...user, ...patch };
  writeJSON(USER_KEY, updated);
  return updated;
}

/** מוחק פרופיל שנשמר בדפדפן כשהשרת אומר שאין סשן. בלי logout ובלי אירוע, כדי לא להיכנס ללולאה. */
export function discardCachedUser(): void {
  if (!readJSON<UserProfile>(USER_KEY)) return;
  removeKey(USER_KEY);
  removeKey(CAN_MANAGE_STUDENTS_KEY);
  removeKey(CAN_ASSIGN_TEACHERS_KEY);
}

/**
 * TZ-28: Check if the current user can manage students (add/delete/reassign).
 * Returns true for owners, admins, and system staff; false for members.
 * Returns false until session is loaded (safe default).
 */
export function getCanManageStudents(): boolean {
  if (isDemoMode() || isFreeAccessMode()) return true;
  const stored = readJSON<boolean>(CAN_MANAGE_STUDENTS_KEY);
  // Return false until session is explicitly loaded (safe default)
  return stored ?? false;
}

/**
 * TZ-28: Check if canManageStudents has been explicitly set (session loaded).
 */
export function hasCanManageStudentsLoaded(): boolean {
  if (isDemoMode() || isFreeAccessMode()) return true;
  return readJSON<boolean>(CAN_MANAGE_STUDENTS_KEY) !== null;
}

/**
 * TZ-28: Cache whether the current user can manage students.
 */
export function setCanManageStudents(canManage: boolean): void {
  writeJSON(CAN_MANAGE_STUDENTS_KEY, canManage);
}

/**
 * TZ-32: Check if the current user can assign students to teachers.
 * Returns true only for owners and system staff; false for admins and members.
 * Returns false until session is loaded (safe default).
 */
export function getCanAssignTeachers(): boolean {
  if (isDemoMode() || isFreeAccessMode()) return true;
  const stored = readJSON<boolean>(CAN_ASSIGN_TEACHERS_KEY);
  return stored ?? false;
}

/**
 * TZ-32: Check if canAssignTeachers has been explicitly set (session loaded).
 */
export function hasCanAssignTeachersLoaded(): boolean {
  if (isDemoMode() || isFreeAccessMode()) return true;
  return readJSON<boolean>(CAN_ASSIGN_TEACHERS_KEY) !== null;
}

/**
 * TZ-32: Cache whether the current user can assign students to teachers.
 */
export function setCanAssignTeachers(canAssign: boolean): void {
  writeJSON(CAN_ASSIGN_TEACHERS_KEY, canAssign);
}

export function clearUser(): void {
  clearFreeAccessMode();
  removeKey(USER_KEY);
  removeKey(CAN_MANAGE_STUDENTS_KEY);
  removeKey(CAN_ASSIGN_TEACHERS_KEY);
  resetDataCache();
  clearNavSession();
  void clearAllPrintHandoffs();
  notifyAuthSessionChanged();
  if (typeof window !== "undefined") {
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }
}

export async function resolveInstitutionCode(
  user: UserProfile
): Promise<string> {
  if (user.institution_code?.trim()) {
    return user.institution_code.trim();
  }

  if (!user.institution_id) {
    return "—";
  }

  if (canUseSupabase() && isUuid(user.institution_id)) {
    const institution = await db.fetchInstitutionById(user.institution_id);
    return institution?.code ?? "—";
  }

  return user.institution_id;
}

/** משלים שם מוסד/בית ספר מהמסד כשחסרים בפרופיל */
export async function resolveInstitutionDetails(
  user: UserProfile
): Promise<Pick<UserProfile, "institution_name" | "school_name">> {
  if (user.institution_name?.trim() && user.school_name?.trim()) {
    return {
      institution_name: user.institution_name.trim(),
      school_name: user.school_name.trim(),
    };
  }

  if (canUseSupabase() && user.institution_id && isUuid(user.institution_id)) {
    const institution = await db.fetchInstitutionById(user.institution_id);
    if (institution) {
      return {
        institution_name:
          user.institution_name?.trim() || institution.name || null,
        school_name:
          user.school_name?.trim() || institution.school_name || null,
      };
    }
  }

  return {
    institution_name: user.institution_name ?? null,
    school_name: user.school_name ?? null,
  };
}

function localGetStudents(): Student[] {
  return (readJSON<Student[]>(STUDENTS_KEY) ?? []).map(normalizeStudent);
}

function readStudentYearMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STUDENT_YEAR_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeStudentYearMap(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDENT_YEAR_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function setLocalStudentYear(
  studentId: string,
  year: number | null
): void {
  const map = readStudentYearMap();
  if (year == null) delete map[studentId];
  else map[studentId] = year;
  writeStudentYearMap(map);
}

type StudentExtrasMap = Record<string, Partial<Student>>;

function readStudentExtrasMap(): StudentExtrasMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STUDENT_EXTRAS_KEY);
    return raw ? (JSON.parse(raw) as StudentExtrasMap) : {};
  } catch {
    return {};
  }
}

function writeStudentExtrasMap(map: StudentExtrasMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDENT_EXTRAS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** שמירת שדות מגרציה 014 מקומית — כדי שלא ייעלמו אם ה־DB עדיין בלי העמודות */
function persistLocalStudentExtras(
  studentId: string,
  extras: Partial<Student>
): void {
  const slice: Partial<Student> = {};
  let hasAny = false;
  for (const key of EXTRA_STUDENT_FIELD_KEYS) {
    if (key in extras) {
      (slice as Record<string, unknown>)[key] = extras[key] ?? null;
      hasAny = true;
    }
  }
  if (!hasAny) return;
  const map = readStudentExtrasMap();
  map[studentId] = { ...(map[studentId] ?? {}), ...slice };
  writeStudentExtrasMap(map);
}

function readLocalStudentExtras(studentId: string): Partial<Student> {
  return readStudentExtrasMap()[studentId] ?? {};
}

function pickExtraFields(source: Partial<Student>): Partial<Student> {
  const out: Partial<Student> = {};
  for (const key of EXTRA_STUDENT_FIELD_KEYS) {
    if (key in source) {
      (out as Record<string, unknown>)[key] = source[key] ?? null;
    }
  }
  return out;
}

function fieldLooksEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
}

function readDocYearMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DOC_YEAR_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeDocYearMap(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOC_YEAR_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function setLocalDocYear(documentId: string, year: number | null): void {
  const map = readDocYearMap();
  if (year == null) delete map[documentId];
  else map[documentId] = year;
  writeDocYearMap(map);
}

function normalizeStudent(student: Student): Student {
  const localYear = readStudentYearMap()[student.id];
  const localArchived = readLocalStudentArchivedAt(student.id);
  const localExtras = readLocalStudentExtras(student.id);
  const merged = { ...student } as unknown as Record<string, unknown>;
  for (const key of EXTRA_STUDENT_FIELD_KEYS) {
    if (!fieldLooksEmpty(merged[key])) continue;
    if (key in localExtras && !fieldLooksEmpty(localExtras[key])) {
      merged[key] = localExtras[key as ExtraStudentFieldKey] as unknown;
    }
  }
  return {
    ...(merged as unknown as Student),
    calendar_year:
      parseCalendarYear(localYear) ??
      parseCalendarYear(student.calendar_year) ??
      null,
    // חותמת מקומית גוברת כשהשרת עדיין בלי עמודת archived_at על students
    archived_at: localArchived ?? student.archived_at ?? null,
  };
}

export function getStudents(): Student[] {
  if (isFreeAccessMode()) {
    const source = canUseSupabase()
      ? getDataCache().students.map(normalizeStudent)
      : localGetStudents();
    const imported = new Set(getFreeAccessImportedStudentIds());
    return source.filter(
      (student) =>
        GUEST_DEMO_STUDENT_IDS.has(student.id) || imported.has(student.id)
    );
  }
  if (canUseSupabase()) {
    return getDataCache().students.map(normalizeStudent);
  }
  return localGetStudents();
}

function enforcePlanLimitsForStudentWrite(
  student: Partial<
    Pick<
      Student,
      "id" | "status" | "category" | "class_name" | "teacher_name" | "notes" | "full_name"
    >
  > & Pick<Student, "category" | "full_name">,
  existingStudentId?: string | null
): void {
  if (isFreeAccessMode()) return;
  const user = getUser();
  if (!user || isBillingExemptProfile(user) || !user.plan_id) return;

  const institutionType = user.institution_type ?? student.category ?? "schools";
  const violation = checkStudentWriteAllowed({
    planId: user.plan_id,
    institutionType,
    educationFramework: user.education_framework ?? null,
    students: getStudents(),
    student,
    existingStudentId,
    knownClassNames: getKnownSpecialEdClassNames(
      institutionType === "tutorials" ? "schools" : institutionType,
      { includePlaceholder: false }
    ),
    planCustomClasses: user.plan_custom_classes ?? null,
    planCustomStudents: user.plan_custom_students ?? null,
  });
  if (violation) throw new PlanLimitError(violation);
}

export async function saveStudent(
  student: Omit<Student, "id" | "created_at" | "updated_at" | "institution_id"> & {
    institution_id?: string;
  }
): Promise<Student> {
  // בכניסה חופשית — ייבוא מאקסל מקומי בלבד (בלי שרת)
  if (isFreeAccessMode()) {
    const calendarYear =
      parseCalendarYear(student.calendar_year) ?? currentCalendarYear();
    const existing = localGetStudents();
    const now = new Date().toISOString();
    const newStudent: Student = {
      id: crypto.randomUUID(),
      institution_id: student.institution_id ?? "mock-institution",
      category: student.category,
      full_name: student.full_name,
      phone: student.phone ?? null,
      father_name: student.father_name ?? null,
      mother_name: student.mother_name ?? null,
      status: student.status ?? null,
      class_name: student.class_name ?? null,
      teacher_name: student.teacher_name ?? null,
      notes: student.notes ?? null,
      id_number: student.id_number ?? null,
      birth_date: student.birth_date ?? null,
      gender: student.gender ?? null,
      home_address: student.home_address ?? null,
      city: student.city ?? null,
      father_mobile: student.father_mobile ?? null,
      mother_mobile: student.mother_mobile ?? null,
      email: student.email ?? null,
      father_email: student.father_email ?? null,
      mother_email: student.mother_email ?? null,
      role: student.role ?? null,
      characterization: student.characterization ?? null,
      family_status: student.family_status ?? null,
      single_responsible_party: student.single_responsible_party ?? null,
      integration_start_date: student.integration_start_date ?? null,
      eligibility_committee_date: student.eligibility_committee_date ?? null,
      homeroom_teacher: student.homeroom_teacher ?? null,
      education_support: student.education_support ?? null,
      additional_treatments: student.additional_treatments ?? null,
      calendar_year: calendarYear,
      integration_frequency: student.integration_frequency ?? null,
      created_at: now,
      updated_at: now,
    };
    writeJSON(STUDENTS_KEY, [...existing, newStudent]);
    persistLocalStudentExtras(newStudent.id, pickExtraFields(newStudent));
    rememberFreeAccessImportedStudent(newStudent.id);
    return newStudent;
  }

  assertNotGuestDemoWrite();
  enforcePlanLimitsForStudentWrite(student);
  const calendarYear =
    parseCalendarYear(student.calendar_year) ?? currentCalendarYear();

  if (canUseSupabase()) {
    const institutionId =
      student.institution_id ?? getDataCache().defaultInstitutionId ?? null;
    const payload: Record<string, unknown> = {
      institution_id: institutionId,
      category: student.category,
      full_name: student.full_name,
      phone: student.phone ?? null,
      father_name: student.father_name ?? null,
      mother_name: student.mother_name ?? null,
      status: student.status ?? null,
      class_name: student.class_name ?? null,
      teacher_name: student.teacher_name ?? null,
      notes: student.notes ?? null,
      id_number: student.id_number ?? null,
      birth_date: student.birth_date ?? null,
      gender: student.gender ?? null,
      home_address: student.home_address ?? null,
      city: student.city ?? null,
      father_mobile: student.father_mobile ?? null,
      mother_mobile: student.mother_mobile ?? null,
      email: student.email ?? null,
      role: student.role ?? null,
      characterization: student.characterization ?? null,
      family_status: student.family_status ?? null,
      single_responsible_party: student.single_responsible_party ?? null,
      integration_start_date: student.integration_start_date ?? null,
      eligibility_committee_date: student.eligibility_committee_date ?? null,
      homeroom_teacher: student.homeroom_teacher ?? null,
      education_support: student.education_support ?? null,
      additional_treatments: student.additional_treatments ?? null,
      calendar_year: calendarYear,
      integration_frequency: student.integration_frequency ?? null,
    };
    // Only include parent email fields when they have non-empty values
    // to avoid column-missing errors before migration is applied
    if ((student.father_email ?? "").trim()) {
      payload.father_email = student.father_email;
    }
    if ((student.mother_email ?? "").trim()) {
      payload.mother_email = student.mother_email;
    }
    // ננסה להכניס את הרשומה עם כל השדות. אם ה־DB עדיין לא הריץ את המגרציות
    // האחרונות (calendar_year / integration_frequency / שדות מגרציה 014) —
    // נשליף את השדות החדשים ונשמור אותם בזיכרון בצד הלקוח, כדי שלא לאבד נתונים.
    const currentPayload: Record<string, unknown> = { ...payload };
    const heldExtras: Partial<Student> = {};
    let heldCalendarYear = false;
    let heldFrequency = false;
    const MAX_ATTEMPTS = 6;
    let created: Student | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        created = await db.insertStudent(
          currentPayload as Omit<Student, "id" | "created_at" | "updated_at">
        );
        break;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        const droppedNow =
          dropExtraStudentColumns(currentPayload, message, heldExtras) ||
          dropCalendarYearColumn(
            currentPayload,
            message,
            () => (heldCalendarYear = true)
          ) ||
          dropIntegrationFrequencyColumn(
            currentPayload,
            message,
            () => (heldFrequency = true)
          );
        if (!droppedNow) {
          throw error;
        }
      }
    }
    if (!created) {
      throw lastError ?? new Error("STUDENT_INSERT_FAILED");
    }
    created = mergeExtraFieldsIntoStudent(created, heldExtras);
    const extrasToPersist = {
      ...pickExtraFields(payload as Partial<Student>),
      ...heldExtras,
    };
    persistLocalStudentExtras(created.id, extrasToPersist);
    created = mergeExtraFieldsIntoStudent(created, extrasToPersist);
    if (heldCalendarYear) {
      setLocalStudentYear(created.id, calendarYear);
      created = { ...created, calendar_year: calendarYear };
    }
    if (heldFrequency) {
      created = {
        ...created,
        integration_frequency: student.integration_frequency ?? null,
      };
    }
    const normalized = normalizeStudent({
      ...created,
      calendar_year: created.calendar_year ?? calendarYear,
    });
    setStudentsInCache([normalized, ...getDataCache().students]);
    return normalized;
  }

  const existing = localGetStudents();
  const now = new Date().toISOString();
  const newStudent: Student = {
    id: crypto.randomUUID(),
    institution_id: student.institution_id ?? "mock-institution",
    category: student.category,
    full_name: student.full_name,
    phone: student.phone ?? null,
    father_name: student.father_name ?? null,
    mother_name: student.mother_name ?? null,
    status: student.status ?? null,
    class_name: student.class_name ?? null,
    teacher_name: student.teacher_name ?? null,
    notes: student.notes ?? null,
    id_number: student.id_number ?? null,
    birth_date: student.birth_date ?? null,
    gender: student.gender ?? null,
    home_address: student.home_address ?? null,
    city: student.city ?? null,
    father_mobile: student.father_mobile ?? null,
    mother_mobile: student.mother_mobile ?? null,
    email: student.email ?? null,
    father_email: student.father_email ?? null,
    mother_email: student.mother_email ?? null,
    role: student.role ?? null,
    characterization: student.characterization ?? null,
    family_status: student.family_status ?? null,
    single_responsible_party: student.single_responsible_party ?? null,
    integration_start_date: student.integration_start_date ?? null,
    eligibility_committee_date: student.eligibility_committee_date ?? null,
    homeroom_teacher: student.homeroom_teacher ?? null,
    education_support: student.education_support ?? null,
    additional_treatments: student.additional_treatments ?? null,
    calendar_year: calendarYear,
    integration_frequency: student.integration_frequency ?? null,
    created_at: now,
    updated_at: now,
  };
  writeJSON(STUDENTS_KEY, [...existing, newStudent]);
  persistLocalStudentExtras(newStudent.id, pickExtraFields(newStudent));
  return newStudent;
}

export async function updateStudent(
  id: string,
  patch: Partial<Student>
): Promise<Student | null> {
  assertNotGuestDemoWrite();
  const current = getStudents().find((student) => student.id === id) ?? null;
  if (current || Object.keys(patch).length > 0) {
    enforcePlanLimitsForStudentWrite(
      {
        ...current,
        ...patch,
        id,
        category: patch.category ?? current?.category ?? "schools",
        full_name: patch.full_name ?? current?.full_name ?? "",
        status: patch.status ?? current?.status ?? null,
        class_name:
          patch.class_name !== undefined
            ? patch.class_name
            : (current?.class_name ?? null),
        teacher_name:
          patch.teacher_name !== undefined
            ? patch.teacher_name
            : (current?.teacher_name ?? null),
        notes: patch.notes !== undefined ? patch.notes : (current?.notes ?? null),
      },
      id
    );
  }
  if (patch.calendar_year !== undefined) {
    setLocalStudentYear(id, parseCalendarYear(patch.calendar_year));
  }
  if (patch.archived_at !== undefined) {
    setLocalStudentArchivedAt(id, patch.archived_at ?? null);
  }

  if (canUseSupabase()) {
    const currentPatch: Record<string, unknown> = { ...patch };
    const heldExtras: Partial<Student> = {};
    let heldCalendarYear = false;
    let heldFrequency = false;
    let heldArchivedAt = false;
    const MAX_ATTEMPTS = 6;
    let updated: Student | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        if (Object.keys(currentPatch).length === 0) {
          updated = getStudents().find((s) => s.id === id) ?? null;
        } else {
          updated = await db.patchStudent(
            id,
            currentPatch as Partial<Student>,
            getDataCache().defaultInstitutionId
          );
        }
        break;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        const droppedNow =
          dropExtraStudentColumns(currentPatch, message, heldExtras) ||
          dropCalendarYearColumn(
            currentPatch,
            message,
            () => (heldCalendarYear = true)
          ) ||
          dropIntegrationFrequencyColumn(
            currentPatch,
            message,
            () => (heldFrequency = true)
          ) ||
          dropArchivedAtColumn(currentPatch, message, () => {
            heldArchivedAt = true;
          });
        if (!droppedNow) throw error;
      }
    }
    if (updated === null && lastError) {
      throw lastError;
    }
    if (!updated) return null;
    let merged: Student = mergeExtraFieldsIntoStudent(updated, heldExtras);
    const extrasToPersist = {
      ...pickExtraFields(patch),
      ...heldExtras,
    };
    if (Object.keys(extrasToPersist).length > 0) {
      persistLocalStudentExtras(id, extrasToPersist);
      merged = mergeExtraFieldsIntoStudent(merged, extrasToPersist);
    }
    if (heldCalendarYear) {
      merged = {
        ...merged,
        calendar_year: parseCalendarYear(patch.calendar_year),
      };
    }
    if (heldFrequency) {
      merged = {
        ...merged,
        integration_frequency: patch.integration_frequency,
      };
    }
    if (heldArchivedAt || patch.archived_at !== undefined) {
      merged = {
        ...merged,
        archived_at: patch.archived_at ?? null,
      };
    }
    const normalized = normalizeStudent(merged);
    setStudentsInCache(
      getDataCache().students.map((s) => (s.id === id ? normalized : s))
    );
    return normalized;
  }

  const students = localGetStudents();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: Student = {
    ...students[idx],
    ...patch,
    calendar_year:
      patch.calendar_year !== undefined
        ? parseCalendarYear(patch.calendar_year)
        : students[idx].calendar_year,
    archived_at:
      patch.archived_at !== undefined
        ? patch.archived_at
        : students[idx].archived_at,
    updated_at: new Date().toISOString(),
  };
  students[idx] = updated;
  writeJSON(STUDENTS_KEY, students);
  const extrasPatch = pickExtraFields(patch);
  if (Object.keys(extrasPatch).length > 0) {
    persistLocalStudentExtras(id, extrasPatch);
  }
  return updated;
}

function clearLocalStudentExtras(studentId: string): void {
  const map = readStudentExtrasMap();
  if (!(studentId in map)) return;
  delete map[studentId];
  writeStudentExtrasMap(map);
}

export async function deleteStudent(id: string): Promise<void> {
  assertNotGuestDemoWrite();
  clearMidYearIntake(id);
  setLocalStudentArchivedAt(id, null);
  if (canUseSupabase()) {
    await db.removeStudent(id, getDataCache().defaultInstitutionId);
    setStudentsInCache(getDataCache().students.filter((s) => s.id !== id));
    clearLocalStudentExtras(id);
    return;
  }

  const students = localGetStudents().filter((s) => s.id !== id);
  writeJSON(STUDENTS_KEY, students);
  deleteDocumentsForStudent(id);
  deleteCustomFieldsForStudent(id);
  clearLocalStudentExtras(id);
}

function withoutMidYearIntakePending(students: Student[]): Student[] {
  return students.filter((s) => !isMidYearIntakePending(s.id));
}

function withoutArchivedStudents(students: Student[]): Student[] {
  return students.filter((s) => !s.archived_at);
}

function activeStudentsOnly(students: Student[]): Student[] {
  return withoutArchivedStudents(withoutMidYearIntakePending(students));
}

/** תלמידים שתיקם הועבר לארכיון (לא כולל אנשי צוות) */
export function getArchivedStudents(category?: PersonalSector): Student[] {
  return getStudents()
    .filter(
      (s) =>
        Boolean(s.archived_at) &&
        s.status !== "integration-teacher" &&
        (category ? s.category === category : true)
    )
    .sort((a, b) => {
      const aAt = a.archived_at ?? "";
      const bAt = b.archived_at ?? "";
      if (aAt !== bAt) return bAt.localeCompare(aAt);
      return a.full_name.localeCompare(b.full_name, "he");
    });
}

export function getStudentsByStatus(
  status: StudentStatus,
  category?: PersonalSector
): Student[] {
  return activeStudentsOnly(
    getStudents().filter(
      (s) =>
        s.status === status &&
        (category ? s.category === category : true) &&
        !isClassCurriculumStudent(s)
    )
  );
}

export function getStudentsByStatusAndFrequency(
  status: StudentStatus,
  frequency: IntegrationFrequency,
  category?: PersonalSector
): Student[] {
  return getStudentsByStatus(status, category)
    .filter((s) => studentMatchesFrequency(s.integration_frequency, frequency))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
}

export function getStaffTeachers(category?: PersonalSector): Student[] {
  return withoutArchivedStudents(getStudents())
    .filter(
      (s) =>
        s.status === "integration-teacher" &&
        (category ? s.category === category : true)
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
}

/** כל שמות המורות שנשמרו — לשימוש חוזר ברשימות ובבחירה */
export function getKnownTeacherNames(category?: PersonalSector): string[] {
  const names = new Set<string>();
  for (const teacher of getStaffTeachers(category)) {
    const name = teacher.full_name.trim();
    if (name) names.add(name);
  }
  for (const student of getStudents()) {
    if (category && student.category !== category) continue;
    const assigned = student.teacher_name?.trim();
    if (assigned) names.add(assigned);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "he"));
}

export async function addStaffTeacher(
  fullName: string,
  category: PersonalSector = "schools"
): Promise<Student> {
  assertNotGuestDemoWrite();
  const name = fullName.trim();
  if (!name) {
    throw new Error("TEACHER_NAME_REQUIRED");
  }

  return saveStudent({
    full_name: name,
    category,
    phone: null,
    father_name: null,
    mother_name: null,
    status: "integration-teacher",
    class_name: null,
    teacher_name: null,
    notes: null,
    role: null,
  });
}

export function getStudentsByStatusAndTeacher(
  status: StudentStatus,
  teacherName: string,
  category?: PersonalSector
): Student[] {
  const normalized = teacherName.trim();
  return activeStudentsOnly(
    getStudents().filter((s) => {
      if (isClassCurriculumStudent(s)) return false;
      if (s.status !== status) return false;
      if (category && s.category !== category) return false;
      if (personNamesMatch(s.teacher_name, normalized)) return true;
      if (
        status === "integration-teacher" &&
        personNamesMatch(s.full_name, normalized)
      ) {
        return true;
      }
      return false;
    })
  );
}

/** תלמידים המקושרים למורה (לפי teacher_name) — לא כולל כרטיסי צוות */
export function getStudentsLinkedToTeacher(
  teacherName: string,
  category?: PersonalSector
): Student[] {
  const normalized = teacherName.trim();
  if (!normalized) return [];
  return activeStudentsOnly(
    getStudents().filter((s) => {
      if (isClassCurriculumStudent(s)) return false;
      if (s.status === "integration-teacher") return false;
      if (category && s.category !== category) return false;
      return personNamesMatch(s.teacher_name, normalized);
    })
  ).sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
}

export function getStudentsByCategory(category: Category): Student[] {
  return withoutArchivedStudents(
    getStudents().filter((s) => s.category === category)
  );
}

export function getStudentsSummary(): Record<StudentStatus, number> {
  const students = activeStudentsOnly(getStudents());
  const summary: Record<StudentStatus, number> = {
    integration: 0,
    "personal-basket": 0,
    "special-ed-class": 0,
    "integration-teacher": 0,
  };
  students.forEach((s) => {
    if (s.status) summary[s.status] += 1;
  });
  return summary;
}

function localGetAllDocuments(): StudentDocument[] {
  return readJSON<StudentDocument[]>(DOCUMENTS_KEY) ?? [];
}

export function getStudentDocuments(studentId: string): StudentDocument[] {
  if (canUseSupabase()) {
    void ensureStudentDocuments(studentId);
    return (getDataCache().documentsByStudent[studentId] ?? []).map(
      normalizeDocument
    );
  }
  return localGetAllDocuments()
    .filter((doc) => doc.student_id === studentId)
    .map(normalizeDocument)
    .sort(
      (a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
}

function normalizeDocument(doc: StudentDocument): StudentDocument {
  const localArchived = readLocalArchiveStamp(doc.id);
  const localYear = readDocYearMap()[doc.id];
  return {
    ...doc,
    folder: doc.folder?.trim() || "כללי",
    // חותמת מקומית גוברת כשהשרת עדיין בלי עמודת archived_at
    archived_at: localArchived ?? doc.archived_at ?? null,
    is_paper_waiver: doc.is_paper_waiver === true,
    calendar_year: resolveDocumentCalendarYear({
      calendar_year: parseCalendarYear(localYear) ?? doc.calendar_year,
      uploaded_at: doc.uploaded_at,
      archived_at: localArchived ?? doc.archived_at,
    }),
  };
}

const LOCAL_ARCHIVE_KEY = "matoah.doc-archived";

function readLocalArchiveMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_ARCHIVE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeLocalArchiveMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_ARCHIVE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readLocalArchiveStamp(documentId: string): string | null {
  return readLocalArchiveMap()[documentId] ?? null;
}

function setLocalArchiveStamp(
  documentId: string,
  archivedAt: string | null
): void {
  const map = readLocalArchiveMap();
  if (archivedAt) map[documentId] = archivedAt;
  else delete map[documentId];
  writeLocalArchiveMap(map);
}

function patchDocumentInCaches(
  documentId: string,
  patch: Partial<StudentDocument>
): StudentDocument | null {
  if (canUseSupabase()) {
    let updated: StudentDocument | null = null;
    for (const [studentId, docs] of Object.entries(
      getDataCache().documentsByStudent
    )) {
      const next = docs.map((doc) => {
        if (doc.id !== documentId) return doc;
        updated = normalizeDocument({ ...doc, ...patch });
        return updated;
      });
      if (updated) setDocumentsInCache(studentId, next);
    }
    return updated;
  }

  const all = localGetAllDocuments();
  let updated: StudentDocument | null = null;
  const next = all.map((doc) => {
    if (doc.id !== documentId) return doc;
    updated = normalizeDocument({ ...doc, ...patch });
    return updated;
  });
  writeJSON(DOCUMENTS_KEY, next);
  return updated;
}

function findDocumentAnywhere(documentId: string): StudentDocument | null {
  for (const docs of Object.values(getDataCache().documentsByStudent)) {
    const found = docs.find((d) => d.id === documentId);
    if (found) return found;
  }
  return localGetAllDocuments().find((d) => d.id === documentId) ?? null;
}

export async function archiveStudentDocument(
  documentId: string
): Promise<void> {
  assertNotGuestDemoWrite();
  const existingPaper = findDocumentAnywhere(documentId);
  if (existingPaper && isActivePaperWaiverScan(existingPaper)) {
    await archivePaperWaiverScan(existingPaper.student_id);
    return;
  }
  const archivedAt = new Date().toISOString();
  setLocalArchiveStamp(documentId, archivedAt);

  const existing = findDocumentAnywhere(documentId);
  const year = resolveDocumentCalendarYear({
    calendar_year: existing?.calendar_year,
    uploaded_at: existing?.uploaded_at,
    archived_at: archivedAt,
    fallbackYear: existing
      ? parseCalendarYear(
          getStudents().find((s) => s.id === existing.student_id)?.calendar_year
        )
      : null,
  });
  setLocalDocYear(documentId, year);

  if (canUseSupabase()) {
    try {
      const doc = await db.updateStudentDocument(documentId, {
        archived_at: archivedAt,
        calendar_year: year,
      });
      patchDocumentInCaches(documentId, {
        archived_at: doc.archived_at ?? archivedAt,
        calendar_year: parseCalendarYear(doc.calendar_year) ?? year,
      });
      return;
    } catch {
      try {
        const doc = await db.updateStudentDocument(documentId, {
          archived_at: archivedAt,
        });
        patchDocumentInCaches(documentId, {
          archived_at: doc.archived_at ?? archivedAt,
          calendar_year: year,
        });
        return;
      } catch {
        // עמודה עדיין לא קיימת — נשענים על localStorage + מטמון
      }
    }
  }

  patchDocumentInCaches(documentId, {
    archived_at: archivedAt,
    calendar_year: year,
  });
}

function findDocumentById(documentId: string): StudentDocument | null {
  if (canUseSupabase()) {
    for (const docs of Object.values(getDataCache().documentsByStudent)) {
      const found = docs.find((doc) => doc.id === documentId);
      if (found) return normalizeDocument(found);
    }
    return null;
  }
  const found = localGetAllDocuments().find((doc) => doc.id === documentId);
  return found ? normalizeDocument(found) : null;
}

function listDocumentsForStudent(studentId: string): StudentDocument[] {
  if (canUseSupabase()) {
    return (getDataCache().documentsByStudent[studentId] ?? []).map(
      normalizeDocument
    );
  }
  return localGetAllDocuments()
    .filter((doc) => doc.student_id === studentId)
    .map(normalizeDocument);
}

function assertPaperWaiverRestoreAllowed(documentId: string): void {
  const existing = findDocumentById(documentId);
  if (!existing) return;
  if (!canRestorePaperWaiverScan(listDocumentsForStudent(existing.student_id), existing)) {
    throw new Error(PAPER_WAIVER_ACTIVE_EXISTS);
  }
}

export async function restoreStudentDocument(
  documentId: string
): Promise<void> {
  assertNotGuestDemoWrite();
  assertPaperWaiverRestoreAllowed(documentId);
  setLocalArchiveStamp(documentId, null);

  if (canUseSupabase()) {
    try {
      await db.updateStudentDocument(documentId, { archived_at: null });
      patchDocumentInCaches(documentId, { archived_at: null });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === PAPER_WAIVER_ACTIVE_EXISTS) throw error;
      // fallback מקומי
    }
  }

  assertPaperWaiverRestoreAllowed(documentId);
  patchDocumentInCaches(documentId, { archived_at: null });
}

export async function renameStudentDocumentFolder(
  documentId: string,
  folder: string
): Promise<void> {
  assertNotGuestDemoWrite();
  const folderName = folder.trim() || "כללי";
  if (canUseSupabase()) {
    try {
      await db.updateStudentDocument(documentId, { folder: folderName });
      patchDocumentInCaches(documentId, { folder: folderName });
      return;
    } catch {
      // fallback מקומי
    }
  }
  patchDocumentInCaches(documentId, { folder: folderName });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsDataURL(file);
  });
}

type StudentDocumentInsertKind = "upload" | "archive-snapshot";

export async function addStudentDocument(
  studentId: string,
  file: File,
  folder = "כללי"
): Promise<StudentDocument> {
  return persistUploadedStudentDocument(studentId, file, folder, "upload");
}

/** עותק HTML של טופס ממולא — רק מנתיב הארכיון, לא מהעלאת משתמש */
export async function addStudentFormArchiveSnapshot(
  studentId: string,
  file: File,
  folder = "כללי"
): Promise<StudentDocument> {
  return persistUploadedStudentDocument(
    studentId,
    file,
    folder,
    "archive-snapshot"
  );
}

async function persistUploadedStudentDocument(
  studentId: string,
  file: File,
  folder: string,
  kind: StudentDocumentInsertKind
): Promise<StudentDocument> {
  assertNotGuestDemoWrite();
  const {
    assertAllowedArchiveSnapshotUpload,
    fileExceedsUploadLimits,
    needsDirectStorageUpload,
    resolveUploadStorage,
  } = await import("@/lib/upload-guard");
  if (kind === "upload" && fileExceedsUploadLimits(file)) {
    throw new Error("FILE_TOO_LARGE");
  }
  if (kind === "upload" && canUseSupabase() && needsDirectStorageUpload(file)) {
    const { persistStudentDocumentViaSignedUpload } = await import(
      "@/lib/student-document-direct-upload"
    );
    const doc = await persistStudentDocumentViaSignedUpload({
      studentId,
      file,
      folder,
      kind: "upload",
    });
    const folderName = folder.trim() || "כללי";
    const normalized = normalizeDocument({
      ...doc,
      folder: doc.folder || folderName,
    });
    const current = getDataCache().documentsByStudent[studentId] ?? [];
    setDocumentsInCache(studentId, [normalized, ...current]);
    return normalized;
  }
  const dataUrl = await readFileAsDataUrl(file);
  let storedMime =
    kind === "archive-snapshot"
      ? "text/html"
      : file.type || "application/octet-stream";
  let storedDataUrl = dataUrl;
  if (kind === "archive-snapshot") {
    const gate = assertAllowedArchiveSnapshotUpload({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl,
    });
    if (!gate.ok) {
      throw new Error(gate.error === "FILE_TOO_LARGE" ? "FILE_TOO_LARGE" : gate.error);
    }
  } else {
    const resolved = resolveUploadStorage({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl,
    });
    if (!resolved.ok) {
      throw new Error(
        resolved.error === "FILE_TOO_LARGE" ? "FILE_TOO_LARGE" : resolved.error
      );
    }
    storedMime = resolved.mimeType;
    storedDataUrl = resolved.dataUrl ?? dataUrl;
  }

  const folderName = folder.trim() || "כללי";
  const calendarYear =
    parseCalendarYear(
      getStudents().find((s) => s.id === studentId)?.calendar_year
    ) ?? currentCalendarYear();
  const base = {
    student_id: studentId,
    name: file.name,
    mime_type: storedMime,
    size: file.size,
    data_url: storedDataUrl,
    calendar_year: calendarYear,
  };

  const insertRemote =
    kind === "archive-snapshot"
      ? db.insertStudentFormArchiveSnapshot
      : db.insertStudentDocument;

  if (canUseSupabase()) {
    let doc: StudentDocument;
    try {
      doc = await insertRemote({ ...base, folder: folderName });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("calendar_year") || message.includes("column")) {
        const { calendar_year: _, ...withoutYear } = base;
        void _;
        try {
          doc = await insertRemote({
            ...withoutYear,
            folder: folderName,
          });
        } catch (folderError) {
          const folderMessage =
            folderError instanceof Error
              ? folderError.message.toLowerCase()
              : "";
          if (
            folderMessage.includes("folder") ||
            folderMessage.includes("column")
          ) {
            doc = await insertRemote(
              withoutYear as Omit<StudentDocument, "id" | "uploaded_at">
            );
          } else {
            throw folderError;
          }
        }
        setLocalDocYear(doc.id, calendarYear);
      } else if (message.includes("folder")) {
        doc = await insertRemote(
          base as Omit<StudentDocument, "id" | "uploaded_at">
        );
      } else {
        throw error;
      }
    }
    setLocalDocYear(doc.id, calendarYear);
    const normalized = normalizeDocument({
      ...doc,
      folder: folderName,
      calendar_year: parseCalendarYear(doc.calendar_year) ?? calendarYear,
    });
    const current = getDataCache().documentsByStudent[studentId] ?? [];
    setDocumentsInCache(studentId, [normalized, ...current]);
    return normalized;
  }

  const doc: StudentDocument = {
    id: crypto.randomUUID(),
    ...base,
    folder: folderName,
    uploaded_at: new Date().toISOString(),
    is_paper_waiver: false,
  };
  setLocalDocYear(doc.id, calendarYear);
  writeJSON(DOCUMENTS_KEY, [...localGetAllDocuments(), doc]);
  return normalizeDocument(doc);
}

/**
 * TZ-99: Archive (not delete) active paper waiver scans for local mock store.
 * Legal retention: signed scans must be retained for 8 years.
 */
function archiveLocalPaperWaiverScans(studentId: string): StudentDocument[] {
  const archivedAt = new Date().toISOString();
  const next = documentsAfterReplacingActivePaperWaiver(
    localGetAllDocuments(),
    studentId,
    archivedAt
  );
  for (const doc of next) {
    if (doc.student_id === studentId && doc.archived_at === archivedAt) {
      setLocalArchiveStamp(doc.id, archivedAt);
    }
  }
  writeJSON(DOCUMENTS_KEY, next);
  return next;
}

export async function addPaperWaiverScan(
  studentId: string,
  file: File,
  folder = "ויתור סודיות"
): Promise<StudentDocument> {
  assertNotGuestDemoWrite();
  const [{ assertPaperWaiverScanUpload }, { fileExceedsUploadLimits, needsDirectStorageUpload }] =
    await Promise.all([
      import("@/lib/paper-waiver-scan"),
      import("@/lib/upload-guard"),
    ]);
  if (fileExceedsUploadLimits(file)) {
    throw new Error("FILE_TOO_LARGE");
  }
  if (canUseSupabase() && needsDirectStorageUpload(file)) {
    const { persistStudentDocumentViaSignedUpload } = await import(
      "@/lib/student-document-direct-upload"
    );
    const doc = await persistStudentDocumentViaSignedUpload({
      studentId,
      file,
      folder,
      kind: "paper-waiver",
    });
    const folderName = folder.trim() || "ויתור סודיות";
    const normalized = normalizeDocument({
      ...doc,
      folder: doc.folder || folderName,
      is_paper_waiver: true,
    });
    const current = documentsAfterReplacingActivePaperWaiver(
      getDataCache().documentsByStudent[studentId] ?? [],
      studentId,
      new Date().toISOString()
    );
    setDocumentsInCache(studentId, [normalized, ...current]);
    return normalized;
  }
  const dataUrl = await readFileAsDataUrl(file);
  const resolved = assertPaperWaiverScanUpload({
    name: file.name,
    mimeType: file.type,
    size: file.size,
    dataUrl,
  });
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const folderName = folder.trim() || "ויתור סודיות";
  const calendarYear =
    parseCalendarYear(
      getStudents().find((s) => s.id === studentId)?.calendar_year
    ) ?? currentCalendarYear();
  const base = {
    student_id: studentId,
    name: file.name,
    mime_type: resolved.mimeType,
    size: file.size,
    data_url: resolved.dataUrl ?? dataUrl,
    folder: folderName,
    calendar_year: calendarYear,
    is_paper_waiver: true,
    archived_at: null,
  };

  if (canUseSupabase()) {
    const doc = await db.upsertPaperWaiverScan(base);
    const normalized = normalizeDocument({
      ...doc,
      folder: folderName,
      is_paper_waiver: true,
      calendar_year: parseCalendarYear(doc.calendar_year) ?? calendarYear,
    });
    const current = documentsAfterReplacingActivePaperWaiver(
      getDataCache().documentsByStudent[studentId] ?? [],
      studentId,
      new Date().toISOString()
    );
    setDocumentsInCache(studentId, [normalized, ...current]);
    return normalized;
  }

  writeJSON(
    DOCUMENTS_KEY,
    documentsAfterReplacingActivePaperWaiver(
      localGetAllDocuments(),
      studentId,
      new Date().toISOString()
    )
  );
  const doc: StudentDocument = {
    id: crypto.randomUUID(),
    ...base,
    uploaded_at: new Date().toISOString(),
  };
  setLocalDocYear(doc.id, calendarYear);
  writeJSON(DOCUMENTS_KEY, [...localGetAllDocuments(), doc]);
  return normalizeDocument(doc);
}

/**
 * TZ-99: "Remove" a paper waiver scan by archiving it.
 * Legal retention: signed scans must be retained for 8 years, so we never
 * hard-delete. The backend now archives instead of deletes.
 */
export async function removePaperWaiverScan(studentId: string): Promise<void> {
  assertNotGuestDemoWrite();
  const archivedAt = new Date().toISOString();
  if (canUseSupabase()) {
    await db.removePaperWaiverScan(studentId);
    const current = getDataCache().documentsByStudent[studentId] ?? [];
    const next = documentsAfterReplacingActivePaperWaiver(
      current,
      studentId,
      archivedAt
    );
    for (const doc of next) {
      if (doc.student_id === studentId && doc.archived_at === archivedAt) {
        setLocalArchiveStamp(doc.id, archivedAt);
      }
    }
    setDocumentsInCache(studentId, next);
    return;
  }
  archiveLocalPaperWaiverScans(studentId);
}

export async function archivePaperWaiverScan(studentId: string): Promise<void> {
  assertNotGuestDemoWrite();
  const archivedAt = new Date().toISOString();
  if (canUseSupabase()) {
    await db.archivePaperWaiverScan(studentId);
    const current = getDataCache().documentsByStudent[studentId] ?? [];
    const next = documentsAfterReplacingActivePaperWaiver(
      current,
      studentId,
      archivedAt
    );
    for (const doc of next) {
      if (doc.student_id === studentId && doc.archived_at === archivedAt) {
        setLocalArchiveStamp(doc.id, archivedAt);
      }
    }
    setDocumentsInCache(studentId, next);
    return;
  }
  const next = documentsAfterReplacingActivePaperWaiver(
    localGetAllDocuments(),
    studentId,
    archivedAt
  );
  for (const doc of next) {
    if (doc.student_id === studentId && doc.archived_at === archivedAt) {
      setLocalArchiveStamp(doc.id, archivedAt);
    }
  }
  writeJSON(DOCUMENTS_KEY, next);
}

export async function deleteStudentDocument(documentId: string): Promise<void> {
  assertNotGuestDemoWrite();
  const existing = findDocumentById(documentId);
  if (existing) {
    const decision = paperWaiverListDeleteDecision(existing);
    if (decision.action === "block-archived") {
      throw new Error(PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED);
    }
    if (decision.action === "remove-active") {
      await removePaperWaiverScan(existing.student_id);
      return;
    }
  }
  if (canUseSupabase()) {
    await db.removeStudentDocument(documentId);
    const next: Record<string, StudentDocument[]> = {};
    for (const [studentId, docs] of Object.entries(
      getDataCache().documentsByStudent
    )) {
      next[studentId] = docs.filter((d) => d.id !== documentId);
    }
    for (const studentId of Object.keys(next)) {
      setDocumentsInCache(studentId, next[studentId]);
    }
    return;
  }

  writeJSON(
    DOCUMENTS_KEY,
    localGetAllDocuments().filter((doc) => doc.id !== documentId)
  );
}

function deleteDocumentsForStudent(studentId: string): void {
  writeJSON(
    DOCUMENTS_KEY,
    localGetAllDocuments().filter((doc) => doc.student_id !== studentId)
  );
}

function localGetAllCustomFields(): StudentCustomField[] {
  return readJSON<StudentCustomField[]>(CUSTOM_FIELDS_KEY) ?? [];
}

export function getStudentCustomFields(studentId: string): StudentCustomField[] {
  if (canUseSupabase()) {
    void ensureStudentCustomFields(studentId);
    return getDataCache().customFieldsByStudent[studentId] ?? [];
  }
  return localGetAllCustomFields()
    .filter((field) => field.student_id === studentId)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
}

export async function loadStudentCustomFieldsForUi(
  studentId: string
): Promise<StudentCustomField[]> {
  if (canUseSupabase()) {
    return loadStudentCustomFields(studentId);
  }
  return getStudentCustomFields(studentId);
}

function labelsMatch(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), "he") === 0;
}

/**
 * בסל אישי: מעביר ערך משדה מותאם עיר/ישוב לעמודת city, מוחק כפילות,
 * ומוחק «שדה נוסף 1–8» מהכרטיס ומהתבנית.
 */
async function prunePersonalBasketCardClutter(
  studentId: string,
  status: StudentStatus,
  fields: StudentCustomField[]
): Promise<StudentCustomField[]> {
  if (status !== "personal-basket") return fields;

  let next = fields;

  const cityCustoms = next.filter((field) =>
    isPersonalBasketCityDuplicateLabel(field.label)
  );
  if (cityCustoms.length > 0) {
    const student = getStudents().find((row) => row.id === studentId);
    const filled = cityCustoms
      .map((field) => field.value.trim())
      .find(Boolean);
    if (filled && student && !(student.city ?? "").trim()) {
      await updateStudent(studentId, { city: filled });
    }
    for (const field of cityCustoms) {
      forgetStatusCustomFieldLabel(status, field.label);
      await deleteStudentCustomField(field.id);
    }
    next = next.filter(
      (field) => !isPersonalBasketCityDuplicateLabel(field.label)
    );
  }

  const placeholders = next.filter((field) =>
    isPersonalBasketPlaceholderExtraLabel(field.label)
  );
  for (const field of placeholders) {
    forgetStatusCustomFieldLabel(status, field.label);
    await deleteStudentCustomField(field.id);
  }
  if (placeholders.length > 0) {
    const removed = new Set(placeholders.map((field) => field.id));
    next = next.filter((field) => !removed.has(field.id));
  }

  return next;
}

/**
 * מבטיח שכל תוויות התבנית המשותפת לסטטוס+קטגוריה קיימות בכרטיס הנוכחי.
 * ממזג גם שדות שכבר קיימים בכרטיס לתוך התבנית — כדי שיעברו לכרטיסים אחרים.
 */
export async function ensureStatusSharedCustomFields(
  studentId: string
): Promise<StudentCustomField[]> {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student?.status) {
    return loadStudentCustomFieldsForUi(studentId);
  }

  const status = student.status;
  let fields = await loadStudentCustomFieldsForUi(studentId);
  fields = await prunePersonalBasketCardClutter(studentId, status, fields);

  const template = getStatusCustomFieldLabels(status).filter(
    (label) =>
      !(
        status === "personal-basket" &&
        (isPersonalBasketCityDuplicateLabel(label) ||
          isPersonalBasketPlaceholderExtraLabel(label))
      )
  );
  if (template.length !== getStatusCustomFieldLabels(status).length) {
    setStatusCustomFieldLabels(status, template);
  }
  const fromCard = fields.map((field) => field.label.trim()).filter(Boolean);
  const merged: string[] = [...template];
  for (const label of fromCard) {
    if (
      status === "personal-basket" &&
      (isPersonalBasketCityDuplicateLabel(label) ||
        isPersonalBasketPlaceholderExtraLabel(label))
    ) {
      continue;
    }
    if (!merged.some((existing) => labelsMatch(existing, label))) {
      merged.push(label);
    }
  }
  if (merged.length !== template.length) {
    setStatusCustomFieldLabels(status, merged);
  }

  const finalTemplate = getStatusCustomFieldLabels(status);
  for (const label of finalTemplate) {
    if (!fields.some((field) => labelsMatch(field.label, label))) {
      await addStudentCustomField(studentId, label, "");
    }
  }

  return loadStudentCustomFieldsForUi(studentId);
}

/** הוספת שדה נוסף — נשמר בתבנית ומועתק לכל הכרטיסים מאותו סטטוס+קטגוריה */
export async function addStatusSharedCustomField(
  studentId: string,
  label: string,
  value: string
): Promise<StudentCustomField> {
  const student = getStudents().find((s) => s.id === studentId);
  const status = student?.status;
  const trimmed = label.trim() || "שדה נוסף";

  if (status) {
    rememberStatusCustomFieldLabel(status, trimmed);
  }

  const created = await addStudentCustomField(studentId, trimmed, value);

  if (status) {
    const peers = getStudents().filter(
      (peer) => peer.id !== studentId && peer.status === status
    );
    for (const peer of peers) {
      const fields = await loadStudentCustomFieldsForUi(peer.id);
      if (!fields.some((field) => labelsMatch(field.label, trimmed))) {
        await addStudentCustomField(peer.id, trimmed, "");
      }
    }
  }

  return created;
}

/** מחיקת שדה נוסף מכל הכרטיסים מאותו סטטוס+קטגוריה + מהתבנית */
export async function deleteStatusSharedCustomField(
  fieldId: string,
  label: string,
  status?: StudentStatus | null,
  category?: string | null
): Promise<void> {
  const trimmed = label.trim();
  let resolvedStatus = status ?? null;

  if (!resolvedStatus) {
    const owner = getStudents().find((student) =>
      getStudentCustomFields(student.id).some((field) => field.id === fieldId)
    );
    resolvedStatus = owner?.status ?? null;
  }

  if (resolvedStatus) {
    forgetStatusCustomFieldLabel(resolvedStatus, trimmed);
  }

  await deleteStudentCustomField(fieldId);

  if (resolvedStatus) {
    const peers = getStudents().filter(
      (peer) => peer.status === resolvedStatus
    );
    for (const peer of peers) {
      const fields = await loadStudentCustomFieldsForUi(peer.id);
      for (const field of fields) {
        if (labelsMatch(field.label, trimmed)) {
          await deleteStudentCustomField(field.id);
        }
      }
    }
  }
}

/** שינוי תווית שדה נוסף בכל הכרטיסים מאותו סטטוס + בתבנית.
 * כשהתווית משתנה — מאפסים גם את הערך (המשמעות השתנתה).
 */
export async function renameStatusSharedCustomField(
  fieldId: string,
  previousLabel: string,
  nextLabel: string,
  status?: StudentStatus | null,
  _category?: string | null
): Promise<StudentCustomField | null> {
  const prev = previousLabel.trim();
  const next = nextLabel.trim() || "שדה נוסף";
  const labelChanged = !labelsMatch(prev, next);
  let resolvedStatus = status ?? null;

  if (!resolvedStatus) {
    const owner = getStudents().find((student) =>
      getStudentCustomFields(student.id).some((field) => field.id === fieldId)
    );
    resolvedStatus = owner?.status ?? null;
  }

  if (resolvedStatus && labelChanged) {
    forgetStatusCustomFieldLabel(resolvedStatus, prev);
    rememberStatusCustomFieldLabel(resolvedStatus, next);
  }

  const updated = await updateStudentCustomField(fieldId, {
    label: next,
    ...(labelChanged ? { value: "" } : {}),
  });

  if (resolvedStatus && labelChanged) {
    const peers = getStudents().filter(
      (peer) => peer.status === resolvedStatus
    );
    for (const peer of peers) {
      const fields = await loadStudentCustomFieldsForUi(peer.id);
      for (const field of fields) {
        if (field.id === fieldId) continue;
        if (labelsMatch(field.label, prev)) {
          await updateStudentCustomField(field.id, {
            label: next,
            value: "",
          });
        }
      }
    }
  }

  return updated;
}

/** תאימות לאחור */
export async function ensureStaffSharedCustomFields(
  studentId: string
): Promise<StudentCustomField[]> {
  return ensureStatusSharedCustomFields(studentId);
}

export async function addStaffSharedCustomField(
  studentId: string,
  label: string,
  value: string
): Promise<StudentCustomField> {
  return addStatusSharedCustomField(studentId, label, value);
}

export async function deleteStaffSharedCustomField(
  fieldId: string,
  label: string
): Promise<void> {
  return deleteStatusSharedCustomField(fieldId, label, "integration-teacher");
}

export async function renameStaffSharedCustomField(
  fieldId: string,
  previousLabel: string,
  nextLabel: string
): Promise<StudentCustomField | null> {
  return renameStatusSharedCustomField(
    fieldId,
    previousLabel,
    nextLabel,
    "integration-teacher"
  );
}

export async function addStudentCustomField(
  studentId: string,
  label: string,
  value: string
): Promise<StudentCustomField> {
  assertNotGuestDemoWrite();
  if (canUseSupabase()) {
    const field = await db.insertStudentCustomField({
      student_id: studentId,
      label: label.trim(),
      value: value.trim(),
    });
    const current = getDataCache().customFieldsByStudent[studentId] ?? [];
    setCustomFieldsInCache(studentId, [...current, field]);
    return field;
  }

  const now = new Date().toISOString();
  const field: StudentCustomField = {
    id: crypto.randomUUID(),
    student_id: studentId,
    label: label.trim(),
    value: value.trim(),
    created_at: now,
    updated_at: now,
  };
  writeJSON(CUSTOM_FIELDS_KEY, [...localGetAllCustomFields(), field]);
  return field;
}

export async function updateStudentCustomField(
  fieldId: string,
  patch: { label?: string; value?: string }
): Promise<StudentCustomField | null> {
  assertNotGuestDemoWrite();
  if (canUseSupabase()) {
    const updated = await db.patchStudentCustomField(fieldId, patch);
    for (const [studentId, fields] of Object.entries(
      getDataCache().customFieldsByStudent
    )) {
      if (fields.some((f) => f.id === fieldId)) {
        setCustomFieldsInCache(
          studentId,
          fields.map((f) => (f.id === fieldId ? updated : f))
        );
        break;
      }
    }
    return updated;
  }

  const fields = localGetAllCustomFields();
  const idx = fields.findIndex((field) => field.id === fieldId);
  if (idx === -1) return null;
  const updated: StudentCustomField = {
    ...fields[idx],
    label: patch.label !== undefined ? patch.label.trim() : fields[idx].label,
    value: patch.value !== undefined ? patch.value.trim() : fields[idx].value,
    updated_at: new Date().toISOString(),
  };
  fields[idx] = updated;
  writeJSON(CUSTOM_FIELDS_KEY, fields);
  return updated;
}

export async function deleteStudentCustomField(fieldId: string): Promise<void> {
  assertNotGuestDemoWrite();
  if (canUseSupabase()) {
    await db.removeStudentCustomField(fieldId);
    for (const [studentId, fields] of Object.entries(
      getDataCache().customFieldsByStudent
    )) {
      if (fields.some((f) => f.id === fieldId)) {
        setCustomFieldsInCache(
          studentId,
          fields.filter((f) => f.id !== fieldId)
        );
        break;
      }
    }
    return;
  }

  writeJSON(
    CUSTOM_FIELDS_KEY,
    localGetAllCustomFields().filter((field) => field.id !== fieldId)
  );
}

function deleteCustomFieldsForStudent(studentId: string): void {
  writeJSON(
    CUSTOM_FIELDS_KEY,
    localGetAllCustomFields().filter((field) => field.student_id !== studentId)
  );
}

function localGetAllFormFills(): StudentFormFill[] {
  return readJSON<StudentFormFill[]>(FORM_FILLS_KEY) ?? [];
}

/** מסנכרן מילויים מהשרת למראה המקומית — כדי שחתימות הורים לא יימחקו ע״י cache ישן */
function syncRemoteFormFillsToLocal(remoteFills: StudentFormFill[]): void {
  if (remoteFills.length === 0) return;
  const all = localGetAllFormFills();
  let changed = false;
  for (const remote of remoteFills) {
    const idx = all.findIndex((fill) => fill.id === remote.id);
    if (idx < 0) {
      all.unshift(remote);
      changed = true;
      continue;
    }
    const local = all[idx];
    const remoteTime = new Date(remote.updated_at).getTime();
    const localTime = new Date(local.updated_at).getTime();
    if (remoteTime >= localTime) {
      all[idx] = remote;
      changed = true;
      continue;
    }
    const mergedData = { ...(local.data ?? {}) };
    let dataChanged = false;
    for (const [key, value] of Object.entries(remote.data ?? {})) {
      if (!isParentSignatureField(key)) continue;
      const kept = String(value ?? "").trim();
      if (!kept) continue;
      if (!String(mergedData[key] ?? "").trim()) {
        mergedData[key] = kept;
        dataChanged = true;
      }
    }
    if (dataChanged) {
      all[idx] = { ...local, data: mergedData };
      changed = true;
    }
  }
  if (changed) writeJSON(FORM_FILLS_KEY, all);
}

function mergeParentSignaturesIntoFill(
  primary: StudentFormFill,
  secondary: StudentFormFill | null | undefined
): StudentFormFill {
  if (!secondary?.data) return primary;
  const data = { ...(primary.data ?? {}) };
  let changed = false;
  for (const [key, value] of Object.entries(secondary.data)) {
    if (!isParentSignatureField(key)) continue;
    const kept = String(value ?? "").trim();
    if (!kept || String(data[key] ?? "").trim()) continue;
    data[key] = kept;
    changed = true;
  }
  return changed ? { ...primary, data } : primary;
}

function normalizeLocalFormFill(fill: StudentFormFill): StudentFormFill {
  return {
    ...fill,
    data: fill.data && typeof fill.data === "object" ? fill.data : {},
    document_id: fill.document_id ?? null,
    status: fill.status || "draft",
  };
}

export function getStudentFormFill(
  studentId: string,
  formId: string
): StudentFormFill | null {
  const pickLatest = (fills: StudentFormFill[]) =>
    [...fills]
      .filter((fill) => fill.form_id === formId)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0] ?? null;

  const fromLocal = pickLatest(
    localGetAllFormFills().map(normalizeLocalFormFill).filter(
      (fill) => fill.student_id === studentId
    )
  );

  if (canUseSupabase()) {
    void ensureStudentFormFills(studentId);
    const fromCache = pickLatest(
      getDataCache().formFillsByStudent?.[studentId] ?? []
    );
    if (!fromCache) return fromLocal;
    if (!fromLocal) return fromCache;
    // מעדיפים את העדכני יותר; הושלם/נשמר גוברים על טיוטה
    const cacheTime = new Date(fromCache.updated_at).getTime();
    const localTime = new Date(fromLocal.updated_at).getTime();
    const preferredStatus = mergeFormFillStatus(
      fromLocal.status,
      fromCache.status
    );
    if (
      fromLocal.status === preferredStatus &&
      fromCache.status !== preferredStatus
    ) {
      return mergeParentSignaturesIntoFill(fromLocal, fromCache);
    }
    if (
      fromCache.status === preferredStatus &&
      fromLocal.status !== preferredStatus
    ) {
      return mergeParentSignaturesIntoFill(fromCache, fromLocal);
    }
    const newer = localTime >= cacheTime ? fromLocal : fromCache;
    const older = localTime >= cacheTime ? fromCache : fromLocal;
    return mergeParentSignaturesIntoFill(newer, older);
  }

  return fromLocal;
}

export async function loadStudentFormFill(
  studentId: string,
  formId: string,
  options?: { quiet?: boolean }
): Promise<StudentFormFill | null> {
  if (canUseSupabase()) {
    await refreshStudentFormFills(studentId, options);
    const list = getDataCache().formFillsByStudent?.[studentId] ?? [];
    syncRemoteFormFillsToLocal(list);
    const fromCache = [...list]
      .filter((fill) => fill.form_id === formId)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];
    if (fromCache) {
      const local = pickLocalFormFill(studentId, formId);
      return mergeParentSignaturesIntoFill(fromCache, local);
    }
    try {
      const remote = await db.fetchStudentFormFill(
        studentId,
        formId,
        getDataCache().defaultInstitutionId
      );
      if (remote) {
        syncRemoteFormFillsToLocal([remote]);
        const current =
          getDataCache().formFillsByStudent?.[studentId] ?? [];
        setFormFillsInCache(studentId, [
          remote,
          ...current.filter((fill) => fill.id !== remote.id),
        ]);
        return remote;
      }
    } catch {
      return getStudentFormFill(studentId, formId);
    }
  }
  return getStudentFormFill(studentId, formId);
}

function pickLocalFormFill(
  studentId: string,
  formId: string
): StudentFormFill | null {
  return (
    [...localGetAllFormFills().map(normalizeLocalFormFill)]
      .filter(
        (fill) => fill.student_id === studentId && fill.form_id === formId
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0] ?? null
  );
}

export async function loadStudentFormFillById(
  studentId: string,
  fillId: string,
  options?: { quiet?: boolean }
): Promise<StudentFormFill | null> {
  if (canUseSupabase()) {
    await refreshStudentFormFills(studentId, options);
    const list = getDataCache().formFillsByStudent?.[studentId] ?? [];
    syncRemoteFormFillsToLocal(list);
    const cached = list.find((fill) => fill.id === fillId);
    if (cached) {
      const local =
        localGetAllFormFills()
          .map(normalizeLocalFormFill)
          .find(
            (fill) => fill.student_id === studentId && fill.id === fillId
          ) ?? null;
      return mergeParentSignaturesIntoFill(cached, local);
    }
    try {
      const remote = await db.fetchStudentFormFillById(
        studentId,
        fillId,
        getDataCache().defaultInstitutionId
      );
      if (remote) {
        syncRemoteFormFillsToLocal([remote]);
        const current =
          getDataCache().formFillsByStudent?.[studentId] ?? [];
        setFormFillsInCache(studentId, [
          remote,
          ...current.filter((fill) => fill.id !== remote.id),
        ]);
        return remote;
      }
    } catch {
      // fall through to the local mirror
    }
  }
  return (
    localGetAllFormFills()
      .map(normalizeLocalFormFill)
      .find(
        (fill) => fill.student_id === studentId && fill.id === fillId
      ) ?? null
  );
}

function localStudentFormFills(studentId: string): StudentFormFill[] {
  return localGetAllFormFills()
    .map(normalizeLocalFormFill)
    .filter((f) => f.student_id === studentId);
}

/** מאחד מילויים מהשרת ומהמראה המקומית — מעדיף את העדכני יותר לפי id */
function mergeStudentFormFills(
  remote: StudentFormFill[],
  local: StudentFormFill[]
): StudentFormFill[] {
  const byId = new Map<string, StudentFormFill>();
  for (const fill of [...remote, ...local]) {
    const prev = byId.get(fill.id);
    if (!prev) {
      byId.set(fill.id, fill);
      continue;
    }
    const prevTime = new Date(prev.updated_at).getTime();
    const nextTime = new Date(fill.updated_at).getTime();
    byId.set(fill.id, nextTime >= prevTime ? fill : prev);
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function getStudentFormFills(studentId: string): StudentFormFill[] {
  const local = localStudentFormFills(studentId);
  if (canUseSupabase()) {
    void ensureStudentFormFills(studentId);
    const remote = getDataCache().formFillsByStudent?.[studentId] ?? [];
    return mergeStudentFormFills(remote, local);
  }
  return local.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/** טוען מחדש מהשרת ומחזיר מילויים (כולל מראה מקומית) — לסנכרון בין טפסים */
export async function loadStudentFormFills(
  studentId: string
): Promise<StudentFormFill[]> {
  if (canUseSupabase()) {
    await refreshStudentFormFills(studentId);
  }
  return getStudentFormFills(studentId);
}

export async function saveStudentFormFill(input: {
  fillId?: string;
  createNew?: boolean;
  studentId: string;
  formId: string;
  data: Record<string, string>;
  status?: FormFillStatus;
  documentId?: string | null;
  /** לשליחת מייל/חתימה — חובה לשמור בשרת, בלי fallback מקומי שקט */
  requireRemote?: boolean;
}): Promise<StudentFormFill> {
  if (isFreeAccessMode() && !isConfidentialityWaiverFormId(input.formId)) {
    throw new Error("DEMO_READ_ONLY");
  }
  const localFills = localGetAllFormFills();
  const localExisting = input.fillId
    ? localFills.find(
        (fill) =>
          fill.id === input.fillId &&
          fill.student_id === input.studentId &&
          fill.form_id === input.formId
      )
    : input.createNew
      ? undefined
      : localFills.find(
          (fill) =>
            fill.student_id === input.studentId &&
            fill.form_id === input.formId
        );
  const cacheExisting = (
    getDataCache().formFillsByStudent?.[input.studentId] ?? []
  ).find((fill) =>
    input.fillId
      ? fill.id === input.fillId
      : input.createNew
        ? false
        : fill.form_id === input.formId
  );
  const status = mergeFormFillStatus(
    localExisting?.status ?? cacheExisting?.status,
    input.status ?? "draft"
  );

  const writeLocalMirror = (
    remoteFill?: StudentFormFill
  ): StudentFormFill => {
    const all = localGetAllFormFills();
    const targetId = remoteFill?.id ?? input.fillId;
    const idx = targetId
      ? all.findIndex(
          (fill) =>
            fill.student_id === input.studentId &&
            fill.id === targetId &&
            fill.form_id === input.formId
        )
      : input.createNew
        ? -1
        : all.findIndex(
            (fill) =>
              fill.student_id === input.studentId &&
              fill.form_id === input.formId
          );
    const now = new Date().toISOString();
    let savedLocal: StudentFormFill;
    if (idx >= 0) {
      savedLocal = {
        ...all[idx],
        data: input.data,
        status,
        document_id:
          input.documentId !== undefined
            ? input.documentId
            : all[idx].document_id,
        updated_at: now,
      };
      all[idx] = savedLocal;
      writeJSON(FORM_FILLS_KEY, all);
    } else {
      savedLocal = {
        id: remoteFill?.id ?? crypto.randomUUID(),
        student_id: input.studentId,
        form_id: input.formId,
        data: input.data,
        status,
        document_id: input.documentId ?? null,
        created_at: remoteFill?.created_at ?? now,
        updated_at: remoteFill?.updated_at ?? now,
      };
      writeJSON(FORM_FILLS_KEY, [savedLocal, ...all]);
    }
    return savedLocal;
  };

  if (canUseSupabase()) {
    try {
      const saved = await db.upsertStudentFormFill({
        id: input.fillId,
        createNew: input.createNew,
        student_id: input.studentId,
        form_id: input.formId,
        data: input.data,
        status,
        document_id: input.documentId ?? null,
      });
      const current = getDataCache().formFillsByStudent?.[input.studentId] ?? [];
      const next = [
        saved,
        ...current.filter((fill) => fill.id !== saved.id),
      ];
      setFormFillsInCache(input.studentId, next);
      // מראה מקומית — כדי שהשער יזהה גם לפני/בלי cache מהשרת
      writeLocalMirror(saved);
      return saved;
    } catch (err) {
      // בסביבת dev/prod עם Supabase — לא נופלים בשקט ל-localStorage
      // (זה שובר שליחת מייל/חתימה כי השרת לא מכיר את ה-id המקומי).
      console.error("[saveStudentFormFill] remote upsert failed", err);
      const raw = err instanceof Error ? err.message : "";
      if (raw === "STUDENT_NOT_FOUND") {
        throw new Error(
          "התלמיד לא נמצא בשרת עבור המוסד של החשבון — לא ניתן לשמור או לשלוח מייל. בדקו שהתלמיד נוצר אחרי התחברות לחשבון הנכון."
        );
      }
      if (raw === "UNAUTHORIZED" || raw === "SERVER_UNAVAILABLE") {
        throw new Error("יש להתחבר מחדש כדי לשמור את הטופס בשרת");
      }
      throw new Error(
        raw && !raw.startsWith("TENANT_OP_FAILED")
          ? `שמירת הטופס בשרת נכשלה: ${raw}`
          : "שמירת הטופס בשרת נכשלה — נסו שוב"
      );
    }
  }

  if (input.requireRemote) {
    throw new Error(
      isFreeAccessMode()
        ? "בכניסה חופשית אי אפשר לשלוח מייל — יש להתחבר לחשבון"
        : "חסר חיבור לשרת — בדקו הגדרות Supabase והתחברות"
    );
  }

  const savedLocal = writeLocalMirror();
  return savedLocal;
}

export async function deleteStudentFormFill(fillId: string): Promise<void> {
  assertNotGuestDemoWrite();
  const local = localGetAllFormFills().find((fill) => fill.id === fillId);
  const fromCache = Object.values(getDataCache().formFillsByStudent ?? {})
    .flat()
    .find((fill) => fill.id === fillId);
  const fill = local ?? fromCache;
  if (!fill) {
    throw new Error(FORM_FILL_NOT_FOUND);
  }
  if (!isDeletablePortfolioFormId(fill.form_id)) {
    throw new Error(FORM_FILL_DELETE_NOT_ALLOWED);
  }
  const linkedDoc = fill.document_id
    ? findDocumentById(fill.document_id)
    : null;
  if (
    formFillDeletionBlocked(fill, {
      linkedDocumentName: linkedDoc?.name,
      linkedDocumentIsPaperWaiver: linkedDoc
        ? isActivePaperWaiverScan(linkedDoc) || linkedDoc.is_paper_waiver === true
        : false,
    })
  ) {
    throw new Error(FORM_FILL_SIGNED_DELETE_BLOCKED);
  }

  if (canUseSupabase()) {
    await db.removeStudentFormFill(fillId);
    const studentId = fill.student_id;
    const current = getDataCache().formFillsByStudent?.[studentId] ?? [];
    setFormFillsInCache(
      studentId,
      current.filter((row) => row.id !== fillId)
    );
  }

  writeJSON(
    FORM_FILLS_KEY,
    localGetAllFormFills().filter((row) => row.id !== fillId)
  );

  if (
    linkedDoc &&
    !isSignedArchiveDocumentName(linkedDoc.name) &&
    !isActivePaperWaiverScan(linkedDoc) &&
    linkedDoc.is_paper_waiver !== true
  ) {
    await deleteStudentDocument(linkedDoc.id);
  }
}
