/**
 * רישום פריסות "כמו הטופס המקורי" — לפי form_id.
 * buildFormSnapshotHtml (form-snapshot.ts) שואל כאן אם לטופס יש פריסה נאמנה למקור,
 * ואם כן מציב את הגוף שלה במקום הרינדור הגנרי "תווית : ערך".
 */

import type { FormSchema } from "@/lib/form-schemas";
import {
  buildEligibilityRenewalBodyHtml,
  buildExhaustOptionsBodyHtml,
  buildMoeWaiverBodyHtml,
  buildParentApprovalBodyHtml,
  buildPsychologistCodeChangeBodyHtml,
  buildPsychologistRecommendationBodyHtml,
  buildSchoolWebsitePhotoConsentBodyHtml,
  ELIGIBILITY_RENEWAL_FORM_ID,
  EXHAUST_OPTIONS_FORM_ID,
  isMoeWaiverOriginalLook,
  MOE_FORMS_PRINT_CSS,
  PARENT_APPROVAL_FORM_ID,
  PSYCHOLOGIST_CODE_CHANGE_FORM_ID,
  PSYCHOLOGIST_RECOMMENDATION_FORM_ID,
  SCHOOL_WEBSITE_PHOTO_CONSENT_FORM_ID,
} from "@/lib/form-snapshot-moe-forms";
import {
  buildInclusionPlanBodyHtml,
  INCLUSION_PLAN_FORM_ID,
  INCLUSION_PLAN_PRINT_CSS,
} from "@/lib/form-snapshot-inclusion";
import { ORIGINAL_LOOK_BASE_CSS } from "@/lib/form-snapshot-original-shared";
import {
  buildReferralQuestionnaireBodyHtml,
  REFERRAL_QUESTIONNAIRE_FORM_ID,
  REFERRAL_QUESTIONNAIRE_PRINT_CSS,
} from "@/lib/form-snapshot-referral";
import {
  buildReferralMultidisciplinaryBodyHtml,
  REFERRAL_MULTIDISCIPLINARY_FORM_ID,
  REFERRAL_MULTIDISCIPLINARY_PRINT_CSS,
} from "@/lib/form-snapshot-referral-multi";

export interface OriginalLookRenderer {
  /** גוף המסמך (בלי <html>/<style>) */
  body: (
    schema: FormSchema,
    data: Record<string, string>,
    moeLogoSrc: string
  ) => string;
  /** CSS ייעודי — מוזרק אחרי ORIGINAL_LOOK_BASE_CSS */
  css: string;
}

export function getOriginalLookRenderer(
  formId: string
): OriginalLookRenderer | null {
  if (formId === REFERRAL_QUESTIONNAIRE_FORM_ID) {
    return {
      body: buildReferralQuestionnaireBodyHtml,
      css: REFERRAL_QUESTIONNAIRE_PRINT_CSS,
    };
  }
  if (isMoeWaiverOriginalLook(formId)) {
    return {
      body: (schema, data) => buildMoeWaiverBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === PARENT_APPROVAL_FORM_ID) {
    return {
      body: (schema, data) => buildParentApprovalBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === SCHOOL_WEBSITE_PHOTO_CONSENT_FORM_ID) {
    return {
      body: (schema, data) => buildSchoolWebsitePhotoConsentBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === ELIGIBILITY_RENEWAL_FORM_ID) {
    return {
      body: (schema, data) => buildEligibilityRenewalBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === PSYCHOLOGIST_CODE_CHANGE_FORM_ID) {
    return {
      body: (schema, data) => buildPsychologistCodeChangeBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === PSYCHOLOGIST_RECOMMENDATION_FORM_ID) {
    return {
      body: (schema, data) => buildPsychologistRecommendationBodyHtml(schema, data),
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === EXHAUST_OPTIONS_FORM_ID) {
    return {
      body: buildExhaustOptionsBodyHtml,
      css: MOE_FORMS_PRINT_CSS,
    };
  }
  if (formId === REFERRAL_MULTIDISCIPLINARY_FORM_ID) {
    return {
      body: (schema, data) => buildReferralMultidisciplinaryBodyHtml(schema, data),
      css: `${REFERRAL_QUESTIONNAIRE_PRINT_CSS}\n${REFERRAL_MULTIDISCIPLINARY_PRINT_CSS}`,
    };
  }
  if (formId === INCLUSION_PLAN_FORM_ID) {
    return {
      body: (schema, data) => buildInclusionPlanBodyHtml(schema, data),
      css: INCLUSION_PLAN_PRINT_CSS,
    };
  }
  return null;
}

/** האם לטופס יש פריסת "כמו המקור" */
export function hasOriginalLookLayout(formId: string): boolean {
  return getOriginalLookRenderer(formId) !== null;
}

/** CSS מלא לפריסה — בסיס + ייעודי */
export function originalLookCss(formId: string): string {
  const renderer = getOriginalLookRenderer(formId);
  if (!renderer) return "";
  return `${ORIGINAL_LOOK_BASE_CSS}\n${renderer.css}`;
}
