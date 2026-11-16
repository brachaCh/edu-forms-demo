import { CONFIDENTIALITY_WAIVER_FORM_ID } from "@/lib/confidentiality-waiver-gate";
import { isUsingSingleParentTemplate } from "@/lib/simplesign/config";
import { partitionSignerAssignments } from "@/lib/simplesign/signer-email-rows";

export type SignerAssignment = {
  fieldKey: string;
  email: string;
  signerName?: string;
};

export type SignerPlanInput = {
  formId: string;
  singleResponsibleParty: boolean | null | undefined;
  parentSignerKeys: string[];
  assignments: SignerAssignment[];
};

export type SignerPlanResult =
  | { ok: false; error: string }
  | { ok: true; primary: SignerAssignment[]; extras: SignerAssignment[] };

export function isSingleResponsibleWaiver(
  formId: string,
  singleResponsibleParty: boolean | null | undefined
): boolean {
  return (
    formId === CONFIDENTIALITY_WAIVER_FORM_ID &&
    singleResponsibleParty === true
  );
}

export const SINGLE_PARENT_WAIVER_TEMPLATE_ERROR =
  "לא הוגדרה תבנית ויתור סודיות להורה יחיד";

/**
 * TZ-30: Determines whether to use SimpleSign's single-signer API.
 *
 * Returns true when the dedicated single-parent template is selected, or when
 * the inspected document is not multi_signer. Does not fall back to calling
 * the single-signer API on a multi_signer template.
 */
export function shouldUseSingleSignerSimpleSign(input: {
  formId: string;
  singleResponsibleParty: boolean | null | undefined;
  documentIsMultiSigner: boolean;
}): boolean {
  if (isUsingSingleParentTemplate(input.formId, input.singleResponsibleParty)) {
    return true;
  }
  return !input.documentIsMultiSigner;
}

/**
 * Single-parent waivers must use a dedicated single-signer template.
 * Returns a Hebrew error when that env is unset, or when the selected
 * document is still multi_signer — never call SimpleSign in those cases.
 */
export function getSingleParentWaiverTemplateError(input: {
  formId: string;
  singleResponsibleParty: boolean | null | undefined;
  documentIsMultiSigner?: boolean;
}): string | null {
  if (!isSingleResponsibleWaiver(input.formId, input.singleResponsibleParty)) {
    return null;
  }
  if (input.documentIsMultiSigner === true) {
    return SINGLE_PARENT_WAIVER_TEMPLATE_ERROR;
  }
  if (!isUsingSingleParentTemplate(input.formId, input.singleResponsibleParty)) {
    return SINGLE_PARENT_WAIVER_TEMPLATE_ERROR;
  }
  return null;
}

/**
 * TZ-30: Resolve the signer plan for a SimpleSign submission.
 *
 * For confidentiality waivers with single_responsible_party=true, only one
 * parent signer is required. Staff assignments (if any) stay in primary.
 */
export function resolveSimpleSignSignerPlan(
  input: SignerPlanInput
): SignerPlanResult {
  const { formId, singleResponsibleParty, parentSignerKeys, assignments } =
    input;

  const requireOnlyOneParent = isSingleResponsibleWaiver(
    formId,
    singleResponsibleParty
  );

  const requiredSignerKeys = requireOnlyOneParent ? [] : parentSignerKeys;

  const partitioned = partitionSignerAssignments(requiredSignerKeys, assignments);

  if (requireOnlyOneParent) {
    const parentAssignments = assignments.filter((a) =>
      parentSignerKeys.includes(a.fieldKey)
    );
    const staffAssignments = assignments.filter(
      (a) => !parentSignerKeys.includes(a.fieldKey)
    );

    if (parentAssignments.length === 0) {
      return {
        ok: false,
        error: "יש לציין לפחות הורה אחד לחתימה על טופס ויתור הסודיות.",
      };
    }

    return {
      ok: true,
      primary: [...staffAssignments, ...parentAssignments],
      extras: [],
    };
  }

  if (partitioned.missingKeys.length > 0) {
    return {
      ok: false,
      error:
        "מסמך זה דורש שליחה לכל החותמים יחד — הזינו מייל לכל שדות החתימה ושלחו בבת אחת.",
    };
  }

  return {
    ok: true,
    primary: partitioned.primary,
    extras: partitioned.extras,
  };
}
