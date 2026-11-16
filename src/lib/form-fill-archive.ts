/**
 * עותק ארכיון אחרי שמירת טופס: PDF חתום (אם יש) או snapshot HTML.
 * כשל בארכיון לא מבטל שמירה שהצליחה.
 */

export const FORM_ARCHIVE_RETRY_ATTEMPTS = 2;

export type FormArchiveStep =
  | "signed-pdf"
  | "html-snapshot"
  | "upload"
  | "archive-flag"
  | "link-fill";

export class FormArchiveError extends Error {
  readonly step: FormArchiveStep;
  readonly retryable: boolean;

  constructor(
    message: string,
    step: FormArchiveStep,
    options?: { cause?: unknown; retryable?: boolean }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "FormArchiveError";
    this.step = step;
    this.retryable = options?.retryable ?? message !== "FILE_TOO_LARGE";
  }
}

export function archiveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "UNKNOWN_ARCHIVE_ERROR";
}

export function isNonRetryableArchiveError(error: unknown): boolean {
  if (error instanceof FormArchiveError) return !error.retryable;
  return archiveErrorMessage(error) === "FILE_TOO_LARGE";
}

export async function retryArchiveStep<T>(
  fn: () => Promise<T>,
  attempts = FORM_ARCHIVE_RETRY_ATTEMPTS
): Promise<T> {
  let last: unknown;
  const max = Math.max(1, Math.floor(attempts));
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (isNonRetryableArchiveError(error) || i === max - 1) {
        throw error;
      }
    }
  }
  throw last;
}

export type HtmlArchivePipeline<T extends { id: string }> = {
  upload: () => Promise<T>;
  afterUpload?: (doc: T) => void | Promise<void>;
  flag: (doc: T) => Promise<void>;
  link: (doc: T) => Promise<void>;
  onStepError?: (step: FormArchiveStep, error: unknown) => void;
};

/**
 * Retry after a successful HTML upload must not create a second copy.
 * Snapshot+upload run once; only archive-flag / link-fill are retried.
 */
export async function retryHtmlArchivePipeline<T extends { id: string }>(
  pipeline: HtmlArchivePipeline<T>,
  attempts = FORM_ARCHIVE_RETRY_ATTEMPTS
): Promise<T> {
  let uploaded: T | null = null;
  return retryArchiveStep(async () => {
    let step: FormArchiveStep = uploaded ? "archive-flag" : "html-snapshot";
    try {
      if (!uploaded) {
        step = "html-snapshot";
        uploaded = await pipeline.upload();
        step = "upload";
        await pipeline.afterUpload?.(uploaded);
      }
      step = "archive-flag";
      await pipeline.flag(uploaded);
      step = "link-fill";
      await pipeline.link(uploaded);
      return uploaded;
    } catch (error) {
      pipeline.onStepError?.(step, error);
      throw error;
    }
  }, attempts);
}

export function logFormArchiveError(context: {
  formId: string;
  studentId: string;
  step: FormArchiveStep;
  error: unknown;
}): void {
  const message = archiveErrorMessage(context.error);
  console.error("[form-archive]", {
    formType: context.formId,
    studentId: context.studentId,
    step: context.step,
    error: message,
  });
}

/** הודעה רכה כשהשמירה הצליחה והארכיון נכשל — לא התראה מבהילה */
export function formArchiveSoftNotice(options: {
  fileTooLarge?: boolean;
}): string {
  if (options.fileTooLarge) {
    return "הטופס נשמר. העותק לארכיון גדול מדי ויישמר מאוחר יותר — אפשר להמשיך.";
  }
  return "הטופס נשמר. עותק הארכיון יישמר מאוחר יותר — אפשר להמשיך.";
}

export function archiveFolderForSchema(options: {
  formId: string;
  folder: string;
  categoryFolder?: string | null;
  studentStatus?: string | null;
  isReferralProtocol?: boolean;
  referralProtocolFolder?: string;
}): string {
  if (
    (options.formId === "tla-integrative" || options.formId === "tla") &&
    options.studentStatus !== "special-ed-class"
  ) {
    return 'תח"י';
  }
  if (options.isReferralProtocol && options.referralProtocolFolder) {
    return options.referralProtocolFolder;
  }
  return options.categoryFolder || options.folder;
}
