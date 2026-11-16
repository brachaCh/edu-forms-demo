import { FORM_SCHEMAS, getFormSchema } from "@/lib/form-schemas";
import { listLockableFormKeys } from "@/lib/form-schema-json";
import { getFormLockedKeys } from "@/lib/form-schema-loader";
import { SIMPLESIGN_FORM_CONFIGS } from "@/lib/simplesign/config";

export function simplesignLockedKeysHint(
  formId: string,
  documentTokenEnv: string
): string {
  return `המפתחות הנעולים של ${formId} השתנו. עדכנו את אותם שמות שדות בתבנית SimpleSign (${documentTokenEnv}), ואז עדכנו את simplesign.lockedKeys ב-src/content/forms/${formId}.json.`;
}

export function listSimpleSignLockErrors(): string[] {
  const errors: string[] = [];
  const simpleSignIds = new Set(SIMPLESIGN_FORM_CONFIGS.map((c) => c.formId));

  for (const config of SIMPLESIGN_FORM_CONFIGS) {
    const locked = getFormLockedKeys(config.formId);
    if (!locked || locked.length === 0) {
      errors.push(
        simplesignLockedKeysHint(config.formId, config.documentTokenEnv)
      );
      continue;
    }
    const schema = getFormSchema(config.formId);
    if (!schema) {
      errors.push(
        simplesignLockedKeysHint(config.formId, config.documentTokenEnv)
      );
      continue;
    }
    const fieldKeys = listLockableFormKeys(schema);
    const missingFromForm = locked.filter((key) => !fieldKeys.has(key));
    const missingSignatures = config.parentSigners
      .map((signer) => signer.signatureFieldKey)
      .filter((key) => !locked.includes(key));
    if (missingFromForm.length > 0 || missingSignatures.length > 0) {
      errors.push(
        simplesignLockedKeysHint(config.formId, config.documentTokenEnv)
      );
    }
  }

  for (const schema of FORM_SCHEMAS) {
    if (simpleSignIds.has(schema.id)) continue;
    if (getFormLockedKeys(schema.id)) {
      errors.push(
        `לטופס ${schema.id} יש simplesign.lockedKeys אבל הוא לא ממופה ב-SIMPLESIGN_FORM_CONFIGS`
      );
    }
  }

  return errors;
}
