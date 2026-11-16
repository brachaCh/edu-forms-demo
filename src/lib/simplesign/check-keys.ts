import { isParentSignatureField } from "@/lib/form-fields";
import { simplesignLockedKeysHint } from "@/lib/simplesign/locked-keys";
import type { SimpleSignDocumentInput } from "@/lib/simplesign/prefill";

export interface SimpleSignLockFormCheck {
  formId: string;
  documentTokenEnv: string;
  documentToken: string | null;
  lockedKeys: string[];
  signerSlots?: Array<{ signatureFieldKey: string; slot: number }>;
}

const FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000] as const;
const FETCH_MAX_ATTEMPTS = 5;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function inputCoversKey(
  input: SimpleSignDocumentInput,
  matoahKey: string
): boolean {
  const token = normalizeToken(matoahKey);
  if (normalizeToken(input.key) === token) return true;
  return Boolean(input.label && normalizeToken(input.label) === token);
}

function httpStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isSimpleSignFetchRetryable(error: unknown): boolean {
  const status = httpStatus(error);
  if (status == null) return true;
  if (status === 401 || status === 403 || status === 404) return false;
  if (status === 429 || status >= 500) return true;
  return false;
}

export function isSimpleSignAuthError(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 401 || status === 403;
}

export type FetchInputsRetryResult =
  | { kind: "success"; inputs: SimpleSignDocumentInput[] }
  | { kind: "auth"; message: string }
  | { kind: "unavailable" }
  | { kind: "fatal"; message: string };

export async function fetchInputsWithRetry(
  fetchInputs: (documentToken: string) => Promise<SimpleSignDocumentInput[]>,
  documentToken: string,
  options: {
    sleep?: (ms: number) => Promise<void>;
    logAttemptFailure?: (line: string) => void;
  } = {}
): Promise<FetchInputsRetryResult> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const logAttemptFailure =
    options.logAttemptFailure ?? ((line: string) => console.error(line));

  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const inputs = await fetchInputs(documentToken);
      return { kind: "success", inputs };
    } catch (error) {
      lastError = error;
      const status = httpStatus(error);
      const statusLabel = status == null ? "network" : String(status);
      logAttemptFailure(
        `SimpleSign inputs fetch attempt ${attempt}/${FETCH_MAX_ATTEMPTS} failed (${statusLabel}): ${errorMessage(error)}`
      );

      if (isSimpleSignAuthError(error)) {
        return { kind: "auth", message: errorMessage(error) };
      }
      if (!isSimpleSignFetchRetryable(error)) {
        return { kind: "fatal", message: errorMessage(error) };
      }
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await sleep(FETCH_RETRY_DELAYS_MS[attempt - 1]!);
      }
    }
  }

  if (lastError != null && isSimpleSignFetchRetryable(lastError)) {
    return { kind: "unavailable" };
  }
  return {
    kind: "fatal",
    message: lastError != null ? errorMessage(lastError) : "unknown error",
  };
}

export function missingLockedKeys(
  lockedKeys: string[],
  inputs: SimpleSignDocumentInput[],
  signerSlots: Array<{ signatureFieldKey: string; slot: number }> = []
): string[] {
  const slotByKey = new Map(
    signerSlots.map((item) => [item.signatureFieldKey, item.slot])
  );
  const missing: string[] = [];
  for (const key of lockedKeys) {
    const slot = slotByKey.get(key);
    if (
      slot != null &&
      inputs.some(
        (input) => input.type === "signature" && input.signer === slot
      )
    ) {
      continue;
    }
    const matches = inputs.filter((input) => inputCoversKey(input, key));
    if (matches.length === 0) {
      missing.push(key);
      continue;
    }
    if (isParentSignatureField(key) && !matches.some((input) => input.type === "signature")) {
      missing.push(key);
    }
  }
  return missing;
}

export async function checkSimpleSignLockedKeys(args: {
  apiKey: string | undefined;
  forms: SimpleSignLockFormCheck[];
  fetchInputs: (
    documentToken: string
  ) => Promise<SimpleSignDocumentInput[]>;
  sleep?: (ms: number) => Promise<void>;
  logAttemptFailure?: (line: string) => void;
  emitWarning?: (line: string) => void;
}): Promise<string[]> {
  const apiKey = args.apiKey?.trim() ?? "";
  if (!apiKey) {
    return ["חסר SIMPLESIGN_API_KEY — לא ניתן לבדוק מפתחות מול SimpleSign"];
  }

  const emitWarning = args.emitWarning ?? ((line) => console.warn(line));
  const errors: string[] = [];
  for (const form of args.forms) {
    const token = form.documentToken?.trim() || null;
    if (!token) {
      errors.push(
        `חסר טוקן מסמך ל-${form.formId} (${form.documentTokenEnv})`
      );
      continue;
    }
    const result = await fetchInputsWithRetry(args.fetchInputs, token, {
      sleep: args.sleep,
      logAttemptFailure: args.logAttemptFailure,
    });
    if (result.kind === "unavailable") {
      emitWarning(
        `::warning:: SimpleSign API unavailable after ${FETCH_MAX_ATTEMPTS} attempts for ${form.formId} (${form.documentTokenEnv}); skipping locked-key check for this document`
      );
      continue;
    }
    if (result.kind === "auth") {
      errors.push(
        `SimpleSign auth failed for ${form.formId} (${form.documentTokenEnv}): ${result.message}`
      );
      continue;
    }
    if (result.kind === "fatal") {
      errors.push(
        `לא ניתן לקרוא את שדות SimpleSign עבור ${form.formId} (${form.documentTokenEnv}): ${result.message}`
      );
      continue;
    }
    const missing = missingLockedKeys(
      form.lockedKeys,
      result.inputs,
      form.signerSlots
    );
    if (missing.length > 0) {
      errors.push(
        `${simplesignLockedKeysHint(form.formId, form.documentTokenEnv)} חסרים: ${missing.join(", ")}`
      );
    }
  }
  return errors;
}
