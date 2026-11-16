import { isParentSignatureField, type FormFieldDef } from "@/lib/form-fields";
import type { FormSchema } from "@/lib/form-schemas";
import { listFormFields } from "@/lib/form-schemas";
import { hasFilledSignatureValue } from "@/lib/simplesign/constants";
import type { Student } from "@/lib/supabase/types";

export type SimpleSignParentRole =
  | "father"
  | "mother"
  | "parent1"
  | "parent2"
  | "parents"
  | "parent"
  | "principal"
  | "inspector"
  | "psychologist"
  | "supervisor"
  | "teacher";

export interface SimpleSignParentSigner {
  role: SimpleSignParentRole;
  signatureFieldKey: string;
  /** slot ב-SimpleSign (1 = חותם ראשון). ברירת מחדל: סדר ב-parentSigners */
  signerSlot?: number;
  defaultSignerName: (student: Student, data: Record<string, string>) => string;
}

export interface SimpleSignFormConfig {
  formId: string;
  documentTokenEnv: string;
  /** אם primary ריק — נופל ל-fallback (נוח ל-POC) */
  documentTokenFallbackEnv?: string;
  /** TZ-30: תבנית ייעודית לתלמיד עם אחראי יחיד (חד הורי). משמשת רק כשה-flag פעיל. */
  singleParentDocumentTokenEnv?: string;
  parentSigners: SimpleSignParentSigner[];
  requiredStaffSignatureKeys: string[];
  signedPdfFolder?: string;
}

function envToken(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** רק טפסים שתבנית SimpleSign שלהם ממופה וחותמים משויכים נכון. */
export const SIMPLESIGN_FORM_CONFIGS: SimpleSignFormConfig[] = [
  {
    formId: "waiver-confidentiality",
    documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_BASIC",
    singleParentDocumentTokenEnv: "SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT",
    parentSigners: [
      {
        role: "father",
        signatureFieldKey: "father_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(d.father_name ?? s.father_name ?? "האב").trim(),
      },
      {
        role: "mother",
        signatureFieldKey: "mother_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(d.mother_name ?? s.mother_name ?? "האם").trim(),
      },
    ],
    // Waiver has parent slots only — no staff signer fields on this template.
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "טופס ויתור סודיות",
  },
  {
    formId: "waiver-multidisciplinary-team",
    documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_MULTI",
    documentTokenFallbackEnv: "SIMPLESIGN_DOC_WAIVER",
    parentSigners: [
      {
        role: "parent1",
        signatureFieldKey: "parent1_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(d.parent1_name ?? d.father_name ?? s.father_name ?? "הורה 1").trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(d.parent2_name ?? d.mother_name ?? s.mother_name ?? "הורה 2").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "ויתור סודיות לצוות רב מקצועי",
  },
  {
    formId: "waiver-eligibility-characterization",
    documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_ELIGIBILITY",
    parentSigners: [
      {
        role: "parent1",
        signatureFieldKey: "parent1_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(d.parent1_name ?? d.father_name ?? s.father_name ?? "הורה 1").trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(d.parent2_name ?? d.mother_name ?? s.mother_name ?? "הורה 2").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "ויתור סודיות לוועדת אפיון וזכאות",
  },
  {
    formId: "waiver-appeal-committee",
    documentTokenEnv: "SIMPLESIGN_DOC_WAIVER_APPEAL",
    parentSigners: [
      {
        role: "parent1",
        signatureFieldKey: "parent1_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(d.parent1_name ?? d.father_name ?? s.father_name ?? "הורה 1").trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(d.parent2_name ?? d.mother_name ?? s.mother_name ?? "הורה 2").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "ויתור סודיות לוועדת השגה",
  },
  {
    formId: "referral-questionnaire",
    documentTokenEnv: "SIMPLESIGN_DOC_REFERRAL_SCHOOL",
    parentSigners: [
      {
        role: "parent1",
        signatureFieldKey: "parent1_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(d.father_name ?? d.parent1_sign_name ?? s.father_name ?? "הורה 1").trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(d.mother_name ?? d.parent2_sign_name ?? s.mother_name ?? "הורה 2").trim(),
      },
      {
        role: "principal",
        signatureFieldKey: "principal_signature",
        signerSlot: 3,
        defaultSignerName: (_student, d) =>
          String(d.principal_name ?? "מנהל/ת").trim(),
      },
      {
        role: "teacher",
        signatureFieldKey: "homeroom_signature",
        signerSlot: 4,
        defaultSignerName: (_student, d) =>
          String(d.homeroom_sign_name ?? d.homeroom_teacher ?? "מחנך/ת").trim(),
      },
      {
        role: "supervisor",
        signatureFieldKey: "supervisor_signature",
        signerSlot: 5,
        defaultSignerName: (_student, d) =>
          String(d.supervisor_name ?? "מפקח/ת").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "לדיון בוועדת אפיון וזכאות",
  },
  {
    formId: "referral-questionnaire-multidisciplinary",
    documentTokenEnv: "SIMPLESIGN_DOC_REFERRAL_MULTI",
    parentSigners: [
      {
        role: "parent",
        signatureFieldKey: "parent_signature",
        signerSlot: 1,
        defaultSignerName: (s, d) => {
          const parts = [
            d.father_name ?? s.father_name,
            d.mother_name ?? s.mother_name,
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean);
          return parts.join(" / ") || "הורים";
        },
      },
      {
        role: "teacher",
        signatureFieldKey: "homeroom_signature",
        signerSlot: 2,
        defaultSignerName: (_student, d) =>
          String(d.homeroom_teacher ?? "מחנך/ת").trim(),
      },
      {
        role: "principal",
        signatureFieldKey: "principal_signature",
        signerSlot: 3,
        defaultSignerName: (_student, d) =>
          String(d.principal_name ?? "מנהל/ת").trim(),
      },
      {
        role: "supervisor",
        signatureFieldKey: "supervisor_signature",
        signerSlot: 4,
        defaultSignerName: (_student, d) =>
          String(d.supervisor_name ?? "מפקח/ת").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "שאלון הפניה ופרוטוקול",
  },
  {
    formId: "referral-questionnaire-kindergarten",
    documentTokenEnv: "SIMPLESIGN_DOC_REFERRAL_KG",
    parentSigners: [
      {
        role: "teacher",
        signatureFieldKey: "signer_signature",
        signerSlot: 1,
        defaultSignerName: (_student, d) =>
          String(d.signer_name ?? "גננת").trim(),
      },
      {
        role: "parent1",
        signatureFieldKey: "parent1_signature",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(
            d.parent1_sign_name ?? d.father_name ?? s.father_name ?? "הורה 1"
          ).trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_signature",
        signerSlot: 3,
        defaultSignerName: (s, d) =>
          String(
            d.parent2_sign_name ?? d.mother_name ?? s.mother_name ?? "הורה 2"
          ).trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "שאלון הפנייה לוועדת אפיון וזכאות",
  },
  {
    formId: "moe-parent-approval-committee-no-presence",
    documentTokenEnv: "SIMPLESIGN_DOC_PARENT_APPROVAL_NO_PRESENCE",
    parentSigners: [
      {
        role: "parent1",
        signatureFieldKey: "parent1_sign",
        signerSlot: 1,
        defaultSignerName: (s, d) =>
          String(
            d.parent1_sign_name ?? d.parent1_name ?? s.father_name ?? "הורה 1"
          ).trim(),
      },
      {
        role: "parent2",
        signatureFieldKey: "parent2_sign",
        signerSlot: 2,
        defaultSignerName: (s, d) =>
          String(
            d.parent2_sign_name ?? d.parent2_name ?? s.mother_name ?? "הורה 2"
          ).trim(),
      },
      {
        role: "principal",
        signatureFieldKey: "principal_sign",
        signerSlot: 3,
        defaultSignerName: (_student, d) =>
          String(d.principal_name ?? "מנהל/ת").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "אישור הורים לוועדת אפיון וזכאות ללא נוכחות הורים",
  },
  {
    formId: "moe-exhaust-options",
    documentTokenEnv: "SIMPLESIGN_DOC_EXHAUST_OPTIONS",
    parentSigners: [
      {
        role: "principal",
        signatureFieldKey: "principal_sign",
        signerSlot: 1,
        defaultSignerName: (_student, d) =>
          String(d.principal_name ?? "מנהל/ת").trim(),
      },
      {
        role: "inspector",
        signatureFieldKey: "inspector_sign",
        signerSlot: 2,
        defaultSignerName: (_student, d) =>
          String(d.inspector_name ?? "מפקח/ת").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "מיצוי אפשרויות",
  },
  {
    formId: "moe-psychologist-recommendation",
    documentTokenEnv: "SIMPLESIGN_DOC_APPENDIX_8",
    parentSigners: [
      {
        role: "psychologist",
        signatureFieldKey: "psychologist_sign",
        signerSlot: 1,
        defaultSignerName: (_student, d) =>
          String(d.psychologist_name ?? "פסיכולוג/ית").trim(),
      },
      {
        role: "supervisor",
        signatureFieldKey: "supervisor_sign",
        signerSlot: 2,
        defaultSignerName: (_student, d) =>
          String(d.supervisor_name ?? "מדריכ/ה או מנהל/ת").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "נספח 8",
  },
  {
    formId: "moe-psychologist-code-change",
    documentTokenEnv: "SIMPLESIGN_DOC_PSYCHOLOGIST_CODE_CHANGE",
    parentSigners: [
      {
        role: "psychologist",
        signatureFieldKey: "psychologist_sign",
        signerSlot: 1,
        defaultSignerName: (_student, d) =>
          String(d.psychologist_name ?? "פסיכולוג").trim(),
      },
      {
        role: "supervisor",
        signatureFieldKey: "supervisor_sign",
        signerSlot: 2,
        defaultSignerName: (_student, d) =>
          String(d.supervisor_name ?? "מדריך/מנהל").trim(),
      },
    ],
    requiredStaffSignatureKeys: [],
    signedPdfFolder: "המלצת פסיכולוג לשינוי קוד אפיון",
  },
];

const CONFIG_BY_FORM_ID = new Map(
  SIMPLESIGN_FORM_CONFIGS.map((c) => [c.formId, c])
);

export function getSimpleSignFormConfig(
  formId: string
): SimpleSignFormConfig | undefined {
  return CONFIG_BY_FORM_ID.get(formId.trim());
}

export function isSimpleSignGloballyEnabled(): boolean {
  return Boolean(process.env.SIMPLESIGN_API_KEY?.trim());
}

export function getSimpleSignDocumentToken(formId: string): string | null {
  const config = getSimpleSignFormConfig(formId);
  if (!config) return null;
  const primary = envToken(config.documentTokenEnv);
  if (primary) return primary;
  if (config.documentTokenFallbackEnv) {
    const fallback = envToken(config.documentTokenFallbackEnv);
    if (fallback) return fallback;
  }
  return null;
}

/**
 * TZ-30: Selects the appropriate SimpleSign template for a student.
 * Uses the dedicated single-parent template when:
 * 1. The form has a singleParentDocumentTokenEnv configured
 * 2. The student is marked as single_responsible_party
 * 3. The single-parent template env var is set
 * Otherwise, falls back to the standard template selection.
 */
export function getSimpleSignDocumentTokenForStudent(
  formId: string,
  singleResponsibleParty: boolean | null | undefined
): string | null {
  const config = getSimpleSignFormConfig(formId);
  if (!config) return null;

  if (singleResponsibleParty === true && config.singleParentDocumentTokenEnv) {
    const singleParentToken = envToken(config.singleParentDocumentTokenEnv);
    if (singleParentToken) return singleParentToken;
  }

  return getSimpleSignDocumentToken(formId);
}

/**
 * TZ-30: Returns true if the dedicated single-parent template env is set
 * and this student is flagged single_responsible_party.
 */
export function isUsingSingleParentTemplate(
  formId: string,
  singleResponsibleParty: boolean | null | undefined
): boolean {
  const config = getSimpleSignFormConfig(formId);
  if (!config) return false;
  if (singleResponsibleParty !== true) return false;
  if (!config.singleParentDocumentTokenEnv) return false;
  return Boolean(envToken(config.singleParentDocumentTokenEnv));
}

export const SIMPLESIGN_FORM_IDS = SIMPLESIGN_FORM_CONFIGS.map((c) => c.formId);

/** בדיקה בצד לקוח — האם הטופס במיפוי SimpleSign (הגדרות env נבדקות בשרת) */
export function formMayUseSimpleSign(formId: string): boolean {
  return SIMPLESIGN_FORM_IDS.includes(formId.trim());
}

export function formSupportsSimpleSign(formId: string): boolean {
  if (!isSimpleSignGloballyEnabled()) return false;
  return Boolean(getSimpleSignDocumentToken(formId));
}

export function listParentSignatureFields(schema: FormSchema) {
  return listFormFields(schema).filter(
    (field) => field.type === "signature" && isParentSignatureField(field.key)
  );
}

export function validateStaffSignaturesBeforeSimpleSign(
  config: SimpleSignFormConfig,
  schema: FormSchema,
  data: Record<string, string>
): string | null {
  const labels = new Map(
    listFormFields(schema).map((f) => [f.key, f.label] as const)
  );
  for (const key of config.requiredStaffSignatureKeys) {
    if (!hasFilledSignatureValue(data[key])) {
      return `יש להשלים חתימת צוות (${labels.get(key) ?? key}) לפני שליחה ל-SimpleSign`;
    }
  }
  return null;
}

export function findSignerByFieldKey(
  config: SimpleSignFormConfig,
  fieldKey: string
): SimpleSignParentSigner | undefined {
  return config.parentSigners.find((s) => s.signatureFieldKey === fieldKey);
}

export function isSimpleSignSignerField(formId: string, fieldKey: string): boolean {
  const config = getSimpleSignFormConfig(formId);
  if (!config) return false;
  return Boolean(findSignerByFieldKey(config, fieldKey));
}

export function resolveSignerSlot(
  config: SimpleSignFormConfig,
  signer: SimpleSignParentSigner
): number {
  const index = config.parentSigners.indexOf(signer);
  return signer.signerSlot ?? (index >= 0 ? index + 1 : 1);
}

export function findSignerBySlot(
  config: SimpleSignFormConfig,
  slot: number
): SimpleSignParentSigner | undefined {
  return config.parentSigners.find(
    (signer, index) => resolveSignerSlot(config, signer) === slot
  );
}

/** סדר יצירת submissions — slot 1 לפני slot 2 */
export function sortSimpleSignAssignments<T extends { fieldKey: string }>(
  config: SimpleSignFormConfig,
  assignments: T[]
): T[] {
  const order = new Map(
    config.parentSigners.map((signer, index) => [
      signer.signatureFieldKey,
      resolveSignerSlot(config, signer) ?? index,
    ])
  );
  return [...assignments].sort(
    (a, b) =>
      (order.get(a.fieldKey) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.fieldKey) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function staffSignatureLabel(
  schema: FormSchema,
  key: string
): string {
  const field = listFormFields(schema).find((f) => f.key === key);
  return field?.label ?? key;
}
