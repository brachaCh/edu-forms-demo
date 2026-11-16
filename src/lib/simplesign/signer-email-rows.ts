import { CONFIDENTIALITY_WAIVER_FORM_ID } from "@/lib/confidentiality-waiver-gate";
import { isParentSignatureField } from "@/lib/form-fields";
import type { SignatureAssignment } from "@/lib/form-signature-request";
import { personNamesMatch } from "@/lib/person-name";
import type { Student, UserProfile } from "@/lib/supabase/types";

export type SignerEmailRow = {
  fieldKey: string;
  email: string;
  required: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveStaffEmailByFullName(
  name: string,
  staff: Array<Pick<Student, "full_name" | "email">>
): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const match = staff.find((row) => personNamesMatch(row.full_name, trimmed));
  return match?.email?.trim() ?? "";
}

function staffRoleLooksLikeInstitutionManager(
  role: string | null | undefined
): boolean {
  const normalized = (role ?? "").trim();
  if (!normalized) return false;
  if (normalized.includes("מומח")) return false;
  return normalized.includes("מנהל");
}

/**
 * TZ-165: מייל מנהל/ת המוסד לשליחה לחתימה (טופס התאמות — `student_signature`).
 * MOE forms use `principal_name` → staff roster; here there is no principal name field.
 */
export function resolveInstitutionManagerSignatureEmail(input: {
  staff: Array<
    Pick<Student, "full_name" | "email" | "user_profile_id" | "role">
  >;
  sessionUser?: Pick<UserProfile, "id" | "full_name" | "email"> | null;
  /** When true, fall back to the logged-in user's profile email (owner/admin). */
  canManageStudents?: boolean;
  principalName?: string;
}): string {
  const fromPrincipal = resolveStaffEmailByFullName(
    input.principalName ?? "",
    input.staff
  );
  if (fromPrincipal) return fromPrincipal;

  for (const card of input.staff) {
    if (!staffRoleLooksLikeInstitutionManager(card.role)) continue;
    const email = card.email?.trim();
    if (email) return email;
  }

  const session = input.sessionUser;
  if (session && input.canManageStudents) {
    const linked = input.staff.find(
      (row) => row.user_profile_id === session.id
    );
    if (linked?.email?.trim()) return linked.email.trim();

    const fromSessionName = resolveStaffEmailByFullName(
      session.full_name,
      input.staff
    );
    if (fromSessionName) return fromSessionName;
    if (session.email?.trim()) return session.email.trim();
  }

  return "";
}

export function buildSignerEmailRows(input: {
  signatureKeys: string[];
  parentEmails: string[];
  staffEmailByFieldKey?: Record<string, string>;
  /** Direct parent email mapping: maps signature fieldKey (e.g. "father_signature") to email.
   *  Falls back to parentEmails array if not provided or if key is not found. */
  parentEmailByFieldKey?: Record<string, string>;
}): SignerEmailRow[] {
  let parentIndex = 0;
  return input.signatureKeys.map((fieldKey) => {
    const staff = (input.staffEmailByFieldKey?.[fieldKey] ?? "").trim();
    const isParent = isParentSignatureField(fieldKey);
    if (!isParent) {
      return { fieldKey, email: staff, required: true };
    }
    const fallbackEmail = input.parentEmails[parentIndex++] ?? "";
    const directEmail = (input.parentEmailByFieldKey?.[fieldKey] ?? "").trim();
    return { fieldKey, email: directEmail || fallbackEmail, required: true };
  });
}

/**
 * TZ-30: Which parent signature keys the send dialog / form blocks should
 * show. Matches resolveSimpleSignSignerPlan: single-parent waiver → one
 * parent (the filled one, else the first slot); otherwise every parent.
 */
export function resolveVisibleParentSignerKeys(options: {
  formId: string;
  singleResponsibleParty?: boolean | null;
  parentSignerKeys: string[];
  filledParentKeys?: string[];
}): string[] {
  const keys = options.parentSignerKeys.filter(Boolean);
  const requireOnlyOneParent =
    options.formId === CONFIDENTIALITY_WAIVER_FORM_ID &&
    options.singleResponsibleParty === true;
  if (!requireOnlyOneParent) return keys;
  const filled = (options.filledParentKeys ?? []).filter((key) =>
    keys.includes(key)
  );
  if (filled.length > 0) return [filled[0]];
  return keys.slice(0, 1);
}

const WAIVER_PARENT_FIELD_GROUPS: Record<string, readonly string[]> = {
  father_signature: ["father_name", "father_id", "father_signature"],
  mother_signature: ["mother_name", "mother_id", "mother_signature"],
};

/** Hide the unused parent name/id/signature block on a single-parent waiver. */
export function isHiddenSingleParentWaiverField(
  fieldKey: string,
  visibleParentSignerKeys: string[] | null | undefined
): boolean {
  if (!visibleParentSignerKeys) return false;
  for (const [signerKey, group] of Object.entries(WAIVER_PARENT_FIELD_GROUPS)) {
    if (group.includes(fieldKey) && !visibleParentSignerKeys.includes(signerKey)) {
      return true;
    }
  }
  return false;
}

/**
 * TZ-30: For confidentiality waiver + single_responsible_party, the send
 * dialog shows one parent signer (staff rows stay as-is). Two-parent
 * waivers keep both mother and father rows, including empty ones.
 */
export function prepareSignerEmailRowsForSend(
  rows: SignerEmailRow[],
  options: {
    formId: string;
    singleResponsibleParty?: boolean | null;
  }
): SignerEmailRow[] {
  const requireOnlyOneParent =
    options.formId === CONFIDENTIALITY_WAIVER_FORM_ID &&
    options.singleResponsibleParty === true;
  if (!requireOnlyOneParent) return rows;

  const parentRows = rows.filter((row) => isParentSignatureField(row.fieldKey));
  const otherRows = rows.filter((row) => !isParentSignatureField(row.fieldKey));
  const visibleKeys = resolveVisibleParentSignerKeys({
    formId: options.formId,
    singleResponsibleParty: options.singleResponsibleParty,
    parentSignerKeys: parentRows.map((row) => row.fieldKey),
    filledParentKeys: parentRows
      .filter((row) => row.email.trim())
      .map((row) => row.fieldKey),
  });
  const visibleParents = visibleKeys.map((fieldKey) => {
    const existing = parentRows.find((row) => row.fieldKey === fieldKey);
    return {
      fieldKey,
      email: existing?.email ?? "",
      required: true,
    };
  });
  return [...otherRows, ...visibleParents];
}

export type SignatureDialogRow = {
  email: string;
  fieldKey: string;
  fieldLabel: string;
  required: boolean;
};

export type CollectSignatureAssignmentsResult =
  | { ok: true; assignments: SignatureAssignment[] }
  | { ok: false; error: string };

/**
 * Validate send-dialog rows. Empty optional rows are skipped so a single
 * parent can send a confidentiality waiver without a second email.
 */
export function collectSignatureAssignments(
  rows: SignatureDialogRow[],
  options?: { lockedEmail?: string | null }
): CollectSignatureAssignmentsResult {
  const locked = (options?.lockedEmail ?? "").trim().toLowerCase();
  const candidates = rows.filter((row) => {
    const email = (locked || row.email).trim();
    return row.required || Boolean(email);
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "יש לציין לפחות כתובת מייל אחת לחתימה",
    };
  }

  const assignments: SignatureAssignment[] = candidates.map((row) => ({
    email: (locked || row.email).trim().toLowerCase(),
    fieldKey: row.fieldKey,
    fieldLabel: row.fieldLabel,
  }));

  const invalidRows = candidates.filter((row) => {
    const email = (locked || row.email).trim().toLowerCase();
    return !EMAIL_RE.test(email) || !row.fieldKey || !row.fieldLabel;
  });
  if (invalidRows.length > 0) {
    const principalRow = invalidRows.find((row) => {
      const k = row.fieldKey.trim().toLowerCase();
      return k === "principal_sign" || k === "principal_signature";
    });
    if (principalRow) {
      const label = principalRow.fieldLabel.trim() || "מנהל/ת המוסד";
      return {
        ok: false,
        error: `יש להזין כתובת מייל תקינה עבור «${label}»`,
      };
    }
    return {
      ok: false,
      error: "יש להשלים כתובת מייל תקינה ושדה חתימה בכל שורה",
    };
  }

  if (locked && assignments.some((row) => row.email !== locked)) {
    return {
      ok: false,
      error: "בכניסה חופשית אפשר לשלוח רק למייל שנרשמתם איתו",
    };
  }

  const pairKeys = assignments.map((row) => `${row.fieldKey}\0${row.email}`);
  if (new Set(pairKeys).size !== pairKeys.length) {
    return {
      ok: false,
      error: "אותה כתובת כבר משויכת לאותו שדה חתימה",
    };
  }

  return { ok: true, assignments };
}

/** First email per fieldKey is the SimpleSign slot recipient; the rest are copies. */
export function partitionSignerAssignments<T extends { fieldKey: string }>(
  requiredKeys: string[],
  assignments: T[]
): { primary: T[]; extras: T[]; missingKeys: string[] } {
  const allowed = new Set(requiredKeys);
  const primary: T[] = [];
  const extras: T[] = [];
  const seen = new Set<string>();
  for (const row of assignments) {
    if (!allowed.has(row.fieldKey)) continue;
    if (seen.has(row.fieldKey)) extras.push(row);
    else {
      seen.add(row.fieldKey);
      primary.push(row);
    }
  }
  return {
    primary,
    extras,
    missingKeys: requiredKeys.filter((key) => !seen.has(key)),
  };
}
