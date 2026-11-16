import {
  CONFIDENTIALITY_WAIVER_FORM_ID,
  isConfidentialityWaiverExempt,
  isSingleResponsiblePartyStudent,
} from "@/lib/confidentiality-waiver-gate";
import { getStudentFormFill } from "@/lib/mock-store";

export const FATHER_SIGNATURE_KEY = "father_signature";
export const MOTHER_SIGNATURE_KEY = "mother_signature";

export type WaiverSignerKey =
  | typeof FATHER_SIGNATURE_KEY
  | typeof MOTHER_SIGNATURE_KEY;

export type WaiverSignerProgress = {
  fatherSigned: boolean;
  motherSigned: boolean;
  formFillId: string | null;
  singleResponsibleParty: boolean;
};

function hasSignedValue(value: string | undefined): boolean {
  // Same trim rule as the gate — do not change completion logic.
  return Boolean(String(value ?? "").trim());
}

export function getWaiverSignerProgress(studentId: string): WaiverSignerProgress {
  const fill = getStudentFormFill(studentId, CONFIDENTIALITY_WAIVER_FORM_ID);
  return {
    fatherSigned: hasSignedValue(fill?.data?.father_signature),
    motherSigned: hasSignedValue(fill?.data?.mother_signature),
    formFillId: fill?.id ?? null,
    singleResponsibleParty: isSingleResponsiblePartyStudent(studentId),
  };
}

/** Hebrew status line for the locked waiver dialog / page. */
export function formatWaiverSignerStatusMessage(
  progress: Pick<
    WaiverSignerProgress,
    "fatherSigned" | "motherSigned" | "singleResponsibleParty"
  >
): string {
  const { fatherSigned, motherSigned, singleResponsibleParty } = progress;
  if (fatherSigned && motherSigned) {
    return "נחתם על ידי האב ועל ידי האם";
  }
  if (fatherSigned) {
    return "נחתם על ידי האב, ממתין לחתימת האם";
  }
  if (motherSigned) {
    return "נחתם על ידי האם, ממתין לחתימת האב";
  }
  if (singleResponsibleParty) {
    return "ממתין לחתימה";
  }
  return "ממתין לחתימת האב והאם";
}

/**
 * Unsigned parent slots. For a single responsible party one signature is
 * enough, so a remaining empty slot is not treated as missing.
 */
export function missingWaiverSignerKeys(
  progress: Pick<
    WaiverSignerProgress,
    "fatherSigned" | "motherSigned" | "singleResponsibleParty"
  >
): WaiverSignerKey[] {
  if (progress.singleResponsibleParty) {
    if (progress.fatherSigned || progress.motherSigned) return [];
    return [FATHER_SIGNATURE_KEY, MOTHER_SIGNATURE_KEY];
  }
  const missing: WaiverSignerKey[] = [];
  if (!progress.fatherSigned) missing.push(FATHER_SIGNATURE_KEY);
  if (!progress.motherSigned) missing.push(MOTHER_SIGNATURE_KEY);
  return missing;
}

export function waiverSignerResendLabel(
  fieldKey: WaiverSignerKey,
  expired?: boolean
): string {
  if (expired) {
    return fieldKey === FATHER_SIGNATURE_KEY
      ? "הקישור פג – שליחת קישור חדש לאב"
      : "הקישור פג – שליחת קישור חדש לאם";
  }
  return fieldKey === FATHER_SIGNATURE_KEY
    ? "שליחת קישור חתימה לאב"
    : "שליחת קישור חתימה לאם";
}

export function resendableWaiverSignerKeys(
  missingKeys: readonly WaiverSignerKey[],
  submissions: ReadonlyArray<{
    signatureFieldKey: string;
    status: string;
  }>
): WaiverSignerKey[] {
  return missingKeys.filter((key) =>
    submissions.some(
      (row) =>
        row.signatureFieldKey === key &&
        (row.status === "pending" || row.status === "expired" || row.status === "renewing")
    )
  );
}

export function expiredWaiverSignerKeys(
  missingKeys: readonly WaiverSignerKey[],
  submissions: ReadonlyArray<{
    signatureFieldKey: string;
    status: string;
  }>
): WaiverSignerKey[] {
  return missingKeys.filter((key) =>
    submissions.some(
      (row) =>
        row.signatureFieldKey === key &&
        (row.status === "expired" || row.status === "renewing")
    )
  );
}

/** Same inbox for father + mother signing links — both still must be signed. */
export const WAIVER_SAME_EMAIL_WARNING =
  "שתי כתובות החתימה זהות — שני קישורי החתימה יישלחו לאותה תיבת דואר, ויש לחתום על שניהם (אב ואם).";

const PARENT_INBOX_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [FATHER_SIGNATURE_KEY, MOTHER_SIGNATURE_KEY],
  ["parent1_sign", "parent2_sign"],
  ["parent1_signature", "parent2_signature"],
];

export function sameParentSignerInboxWarning(
  rows: ReadonlyArray<{ fieldKey: string; email: string }>
): string | null {
  for (const [keyA, keyB] of PARENT_INBOX_PAIRS) {
    let emailA = "";
    let emailB = "";
    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email) continue;
      if (row.fieldKey === keyA && !emailA) emailA = email;
      if (row.fieldKey === keyB && !emailB) emailB = email;
    }
    if (emailA && emailB && emailA === emailB) {
      return WAIVER_SAME_EMAIL_WARNING;
    }
  }
  return null;
}

export function shouldShowPersonalBasketWaiverUploadNote(opts: {
  folderName: string;
  studentStatus?: string | null;
}): boolean {
  return (
    opts.studentStatus === "personal-basket" &&
    isConfidentialityWaiverExempt({ targetLabel: opts.folderName })
  );
}
