import { createClient, isSupabaseConfigured } from "./supabase/client";
import type {
  Institution,
  Student,
  StudentCustomField,
  StudentDocument,
  StudentFormFill,
  FormFillStatus,
  UserProfile,
} from "./supabase/types";
import type { InstitutionStaffPickerRow, StaffFillRecipient } from "./student-team-staff";
import type { SiteTexts } from "./site-text";
import { isDemoMode } from "./demo-mode";
import { isFreeAccessMode } from "./free-access";
import {
  bytesToDataUrl,
  rememberPrintBytes,
} from "./print-payload";

export function canUseSupabase(): boolean {
  if (isDemoMode() || isFreeAccessMode()) return false;
  return isSupabaseConfigured();
}

/** פעולות תלמידים/מסמכים/טפסים — רק דרך API מאומת (service_role + institution_id). */
async function callTenantData<T>(
  op: string,
  payload: Record<string, unknown> = {},
  options?: { signal?: AbortSignal }
): Promise<T> {
  if (options?.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  const response = await fetch("/api/tenant/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...payload }),
    signal: options?.signal,
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    ok?: boolean;
    error?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("FILE_TOO_LARGE");
    }
    const code = body?.error;
    const message = body?.message || code || `TENANT_OP_FAILED:${op}`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = response.status;
    if (typeof code === "string") err.code = code;
    throw err;
  }
  if (body && "data" in body) {
    return body.data as T;
  }
  return undefined as T;
}

/** מזהה מוסד ברירת מחדל — רק דרך API (service_role). */
export async function fetchDefaultInstitutionId(): Promise<string | null> {
  const response = await fetch("/api/institutions/default", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "DEFAULT_INSTITUTION_READ_FAILED");
  }
  const body = (await response.json()) as { data: { id: string | null } };
  return body.data.id;
}

/** מוצא מוסד לפי קוד או יוצר אחד חדש — רק דרך API (service_role + סשן). */
export async function ensureInstitution(input: {
  code: string;
  name: string;
  school_name: string;
}): Promise<Institution> {
  const response = await fetch("/api/institutions/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "ENSURE_INSTITUTION_FAILED");
  }
  const body = (await response.json()) as { data: Institution };
  return body.data;
}

export async function fetchInstitutionById(
  id: string
): Promise<Institution | null> {
  return callTenantData<Institution | null>("fetchInstitutionById", { id });
}

export async function fetchStudents(
  institutionId: string | null
): Promise<Student[]> {
  if (!institutionId) return [];
  // institutionId נקבע בשרת לפי הסשן — הפרמטר רק כדי לא לקרוא בלי משתמשת
  return callTenantData<Student[]>("fetchStudents");
}

export async function fetchInstitutionStaffForPicker(
  category?: string | null
): Promise<InstitutionStaffPickerRow[]> {
  return callTenantData<InstitutionStaffPickerRow[]>(
    "fetchInstitutionStaffForPicker",
    category ? { category } : {}
  );
}

export async function fetchInstitutionStaffForFill(
  category?: string | null
): Promise<StaffFillRecipient[]> {
  return callTenantData<StaffFillRecipient[]>(
    "fetchInstitutionStaffForFill",
    category ? { category } : {}
  );
}

export async function insertStudent(
  student: Omit<Student, "id" | "created_at" | "updated_at">
): Promise<Student> {
  return callTenantData<Student>("insertStudent", { student });
}

export async function patchStudent(
  id: string,
  patch: Partial<Student>,
  _institutionId?: string | null
): Promise<Student> {
  return callTenantData<Student>("patchStudent", { id, patch });
}

export async function removeStudent(
  id: string,
  _institutionId?: string | null
): Promise<void> {
  await callTenantData<void>("removeStudent", { id });
}

export async function fetchStudentDocuments(
  studentId: string,
  _institutionId?: string | null,
  options?: { includeData?: boolean }
): Promise<StudentDocument[]> {
  return callTenantData<StudentDocument[]>("fetchStudentDocuments", {
    studentId,
    ...(options?.includeData ? { includeData: true } : {}),
  });
}

export const STUDENT_DOCUMENT_DATA_PATH = "/api/tenant/documents";
export const DOCUMENT_DATA_RETRY_ATTEMPTS = 3;
export const DOCUMENT_DATA_RETRY_DELAY_MS = 500;
/** Longer than GET /api/tenant/documents maxDuration (60s) so the server can finish. */
export const DOCUMENT_DATA_FETCH_TIMEOUT_MS = 75_000;

export class StudentDocumentDataError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status: number) {
    super(code);
    this.name = "StudentDocumentDataError";
    this.code = code;
    this.status = status;
  }
}

export function isStudentDocumentDataError(
  error: unknown
): error is StudentDocumentDataError {
  return error instanceof StudentDocumentDataError;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function studentDocumentDataUrl(
  id: string,
  purpose?: "print",
  format?: "bytes"
): string {
  const path = `${STUDENT_DOCUMENT_DATA_PATH}/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  if (purpose === "print") params.set("purpose", "print");
  if (format === "bytes") params.set("format", "bytes");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function parseDocumentDataErrorCode(bodyText: string): string | null {
  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

export function parseRawDocumentDataResponse(
  id: string,
  status: number,
  bodyText: string
): { id: string; data_url: string } | null {
  if (status < 200 || status >= 300) return null;
  const dataUrl = bodyText.trim();
  if (!dataUrl) return null;
  return { id, data_url: dataUrl };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStudentDocumentDataRaw(
  id: string,
  signal?: AbortSignal,
  purpose?: "print",
  format?: "bytes"
): Promise<{ id: string; data_url: string } | null> {
  const response = await fetch(studentDocumentDataUrl(id, purpose, format), {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (format === "bytes") {
    if (response.status >= 400 && response.status < 500) {
      const bodyText = await response.text();
      throw new StudentDocumentDataError(
        parseDocumentDataErrorCode(bodyText) ?? `HTTP_${response.status}`,
        response.status
      );
    }
    if (!response.ok) {
      throw new Error(`DOCUMENT_DATA_HTTP_${response.status}`);
    }
    const mime =
      response.headers.get("x-document-mime")?.split(";")[0]?.trim() ||
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return null;
    rememberPrintBytes(id, bytes);
    return { id, data_url: bytesToDataUrl(bytes, mime) };
  }
  const bodyText = await response.text();
  if (response.status >= 400 && response.status < 500) {
    throw new StudentDocumentDataError(
      parseDocumentDataErrorCode(bodyText) ?? `HTTP_${response.status}`,
      response.status
    );
  }
  if (!response.ok) {
    throw new Error(`DOCUMENT_DATA_HTTP_${response.status}`);
  }
  return parseRawDocumentDataResponse(id, response.status, bodyText);
}

export interface FetchStudentDocumentDataOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  purpose?: "print";
}

function withFetchTimeout(signal?: AbortSignal, timeoutMs?: number): {
  signal?: AbortSignal;
  cancel: () => void;
} {
  if (!timeoutMs && !signal) return { signal, cancel: () => undefined };
  if (!timeoutMs) return { signal, cancel: () => undefined };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** תוכן (data URL) של מסמך יחיד — לצפייה/הורדה */
export async function fetchStudentDocumentData(
  id: string,
  options?: FetchStudentDocumentDataOptions
): Promise<{ id: string; data_url: string } | null> {
  const { signal, cancel } = withFetchTimeout(
    options?.signal,
    options?.timeoutMs ?? DOCUMENT_DATA_FETCH_TIMEOUT_MS
  );
  try {
    if (options?.purpose === "print") {
      try {
        const binary = await fetchStudentDocumentDataRaw(
          id,
          signal,
          "print",
          "bytes"
        );
        if (binary?.data_url) return binary;
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        if (isStudentDocumentDataError(error) && error.status === 413) {
          // Bytes are already over the function cap — the print data-URL
          // and view GET are the same file and cannot succeed.
          throw error;
        }
        // 422/5xx/missing bytes route — one print data-URL GET
      }
    }
    const raw = await fetchStudentDocumentDataRaw(id, signal, options?.purpose);
    if (raw?.data_url) return raw;
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }
    if (isStudentDocumentDataError(error)) {
      if (error.status === 413 && options?.purpose === "print") {
        throw error;
      }
      const viewTooLargeFallback =
        error.status === 413 && options?.purpose !== "print";
      if (!viewTooLargeFallback) throw error;
    }
    // network / 5xx / view 413 — נופלים ל-JSON הקיים
  } finally {
    cancel();
  }
  if (signal?.aborted || options?.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  return callTenantData<{ id: string; data_url: string } | null>(
    "fetchStudentDocumentData",
    { id },
    { signal: options?.signal }
  );
}

/** כמה ניסיונות — רק על רשת / 5xx. 4xx לא מנסים שוב. Abort של 75ש׳ הוא סופי. */
export async function fetchStudentDocumentDataWithRetry(
  id: string,
  attempts = DOCUMENT_DATA_RETRY_ATTEMPTS,
  options?: FetchStudentDocumentDataOptions
): Promise<{ id: string; data_url: string } | null> {
  const total = Math.max(1, attempts);
  let last: { id: string; data_url: string } | null = null;
  for (let i = 0; i < total; i += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    try {
      last = await fetchStudentDocumentData(id, options);
      if (last?.data_url?.trim()) return last;
      return last;
    } catch (error) {
      if (isStudentDocumentDataError(error)) throw error;
      if (isAbortError(error)) throw error;
      last = null;
    }
    if (i < total - 1) {
      await delay(DOCUMENT_DATA_RETRY_DELAY_MS * (i + 1));
    }
  }
  return last;
}

export async function insertStudentDocument(
  doc: Omit<StudentDocument, "id" | "uploaded_at">
): Promise<StudentDocument> {
  return callTenantData<StudentDocument>("insertStudentDocument", { doc });
}

export async function upsertPaperWaiverScan(
  doc: Omit<StudentDocument, "id" | "uploaded_at">
): Promise<StudentDocument> {
  return callTenantData<StudentDocument>("upsertPaperWaiverScan", { doc });
}

export async function removePaperWaiverScan(studentId: string): Promise<void> {
  await callTenantData<void>("removePaperWaiverScan", { studentId });
}

export async function archivePaperWaiverScan(studentId: string): Promise<void> {
  await callTenantData<void>("archivePaperWaiverScan", { studentId });
}

/** עותק HTML של טופס ממולא — רק דרך ה-guard הייעודי, לא insertStudentDocument */
export async function insertStudentFormArchiveSnapshot(
  doc: Omit<StudentDocument, "id" | "uploaded_at">
): Promise<StudentDocument> {
  return callTenantData<StudentDocument>("insertStudentFormArchiveSnapshot", {
    doc,
  });
}

export async function removeStudentDocument(id: string): Promise<void> {
  await callTenantData<void>("removeStudentDocument", { id });
}

export async function updateStudentDocument(
  id: string,
  patch: Partial<
    Pick<StudentDocument, "folder" | "archived_at" | "name" | "calendar_year">
  >
): Promise<StudentDocument> {
  return callTenantData<StudentDocument>("updateStudentDocument", {
    id,
    patch,
  });
}

export async function fetchStudentCustomFields(
  studentId: string,
  _institutionId?: string | null
): Promise<StudentCustomField[]> {
  return callTenantData<StudentCustomField[]>("fetchStudentCustomFields", {
    studentId,
  });
}

export async function insertStudentCustomField(
  field: Omit<StudentCustomField, "id" | "created_at" | "updated_at">
): Promise<StudentCustomField> {
  return callTenantData<StudentCustomField>("insertStudentCustomField", {
    field,
  });
}

export async function patchStudentCustomField(
  id: string,
  patch: Partial<Pick<StudentCustomField, "label" | "value">>
): Promise<StudentCustomField> {
  return callTenantData<StudentCustomField>("patchStudentCustomField", {
    id,
    patch,
  });
}

export async function removeStudentCustomField(id: string): Promise<void> {
  await callTenantData<void>("removeStudentCustomField", { id });
}

export interface TenantReadOptions {
  /** ריענון רקע — לא נרשם שוב ללוג הגישה */
  quiet?: boolean;
}

export async function fetchStudentFormFill(
  studentId: string,
  formId: string,
  _institutionId?: string | null,
  options?: TenantReadOptions
): Promise<StudentFormFill | null> {
  return callTenantData<StudentFormFill | null>("fetchStudentFormFill", {
    studentId,
    formId,
    ...(options?.quiet ? { quiet: true } : {}),
  });
}

export async function fetchStudentFormFills(
  studentId: string,
  _institutionId?: string | null,
  options?: TenantReadOptions
): Promise<StudentFormFill[]> {
  return callTenantData<StudentFormFill[]>("fetchStudentFormFills", {
    studentId,
    ...(options?.quiet ? { quiet: true } : {}),
  });
}

export async function fetchStudentFormFillById(
  studentId: string,
  fillId: string,
  _institutionId?: string | null,
  options?: TenantReadOptions
): Promise<StudentFormFill | null> {
  return callTenantData<StudentFormFill | null>("fetchStudentFormFillById", {
    studentId,
    fillId,
    ...(options?.quiet ? { quiet: true } : {}),
  });
}

export async function upsertStudentFormFill(input: {
  id?: string;
  createNew?: boolean;
  student_id: string;
  form_id: string;
  data: Record<string, string>;
  status?: FormFillStatus;
  document_id?: string | null;
}): Promise<StudentFormFill> {
  return callTenantData<StudentFormFill>("upsertStudentFormFill", { input });
}

export async function removeStudentFormFill(fillId: string): Promise<void> {
  await callTenantData<void>("removeStudentFormFill", { id: fillId });
}

export async function upsertUserProfile(
  user: UserProfile,
  passwordHash?: string
): Promise<UserProfile> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    institution_id: user.institution_id,
    institution_code: user.institution_code ?? null,
    terms_accepted_at: user.terms_accepted_at,
    is_admin: user.is_admin,
    is_institution_owner: user.is_institution_owner ?? false,
  };
  if (passwordHash) {
    payload.password_hash = passwordHash;
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "email" })
    .select(
      "id, full_name, phone, email, institution_id, institution_code, terms_accepted_at, is_admin, is_institution_owner, created_at"
    )
    .single();
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

const USER_PROFILE_PUBLIC_COLUMNS =
  "id, full_name, phone, email, institution_id, institution_code, terms_accepted_at, is_admin, is_institution_owner, created_at";

export async function fetchUserProfileByEmail(
  email: string
): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(USER_PROFILE_PUBLIC_COLUMNS)
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as UserProfile | null;
}

export type SiteTextOverridesRow = {
  data: Partial<SiteTexts>;
  updatedAt: string | null;
};

export async function fetchSiteTextOverrides(): Promise<SiteTextOverridesRow | null> {
  const response = await fetch("/api/site-text", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "SITE_TEXT_READ_FAILED");
  }
  const body = (await response.json()) as { data: SiteTextOverridesRow | null };
  return body.data;
}

export class SiteTextWriteDeniedError extends Error {
  constructor() {
    super("SITE_TEXT_FORBIDDEN");
    this.name = "SiteTextWriteDeniedError";
  }
}

function isSiteTextWriteDenied(status: number): boolean {
  return status === 401 || status === 403;
}

async function writeSiteTextOverrides(
  method: "PUT" | "DELETE",
  texts?: SiteTexts
): Promise<void> {
  const response = await fetch("/api/site-text", {
    method,
    headers: texts ? { "Content-Type": "application/json" } : undefined,
    body: texts ? JSON.stringify({ texts }) : undefined,
  });
  if (isSiteTextWriteDenied(response.status)) {
    throw new SiteTextWriteDeniedError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "SITE_TEXT_WRITE_FAILED");
  }
}

export function upsertSiteTextOverrides(texts: SiteTexts): Promise<void> {
  return writeSiteTextOverrides("PUT", texts);
}

export function clearSiteTextOverrides(): Promise<void> {
  return writeSiteTextOverrides("DELETE");
}

export type AiFillExamplesRow = {
  examples: unknown[];
  updatedAt: string | null;
};

/** קריאה/כתיבה ל-ai_fill_examples_store — רק דרך API (service_role). */
export async function fetchAiFillExamples(
  scopeKey: string
): Promise<AiFillExamplesRow | null> {
  const response = await fetch(
    `/api/ai/fill-examples?scopeKey=${encodeURIComponent(scopeKey)}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "AI_FILL_EXAMPLES_READ_FAILED");
  }
  const body = (await response.json()) as { data: AiFillExamplesRow | null };
  return body.data;
}

export async function upsertAiFillExamples(
  scopeKey: string,
  examples: unknown[]
): Promise<void> {
  const response = await fetch("/api/ai/fill-examples", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeKey, examples }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "AI_FILL_EXAMPLES_WRITE_FAILED");
  }
}
