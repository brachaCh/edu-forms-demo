import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveErrorMessage,
  archiveFolderForSchema,
  formArchiveSoftNotice,
  FormArchiveError,
  isNonRetryableArchiveError,
  logFormArchiveError,
  retryArchiveStep,
  retryHtmlArchivePipeline,
} from "./form-fill-archive";

describe("form-fill-archive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a failing archive step and returns the later success", async () => {
    const fn = vi
      .fn<( ) => Promise<string>>()
      .mockRejectedValueOnce(new Error("FILE_TYPE_NOT_ALLOWED"))
      .mockResolvedValueOnce("ok");

    await expect(retryArchiveStep(fn, 2)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not upload a second HTML copy if linking fails then succeeds", async () => {
    const upload = vi.fn().mockResolvedValue({ id: "doc-1" });
    const flag = vi.fn().mockResolvedValue(undefined);
    const link = vi
      .fn()
      .mockRejectedValueOnce(new Error("LINK_FAILED"))
      .mockResolvedValueOnce(undefined);

    await expect(
      retryHtmlArchivePipeline({ upload, flag, link }, 2)
    ).resolves.toEqual({ id: "doc-1" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(flag).toHaveBeenCalledTimes(2);
    expect(link).toHaveBeenCalledTimes(2);
  });

  it("does not retry FILE_TOO_LARGE", async () => {
    const fn = vi
      .fn<( ) => Promise<string>>()
      .mockRejectedValue(new Error("FILE_TOO_LARGE"));

    await expect(retryArchiveStep(fn, 3)).rejects.toThrow("FILE_TOO_LARGE");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("logs form type, student id and step instead of swallowing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logFormArchiveError({
      formId: "personal-basket-card",
      studentId: "2c04593e-a58f-4fd1-b9d9-26be1f4eaf94",
      step: "upload",
      error: new Error("FILE_TYPE_NOT_ALLOWED"),
    });
    expect(spy).toHaveBeenCalledWith(
      "[form-archive]",
      expect.objectContaining({
        formType: "personal-basket-card",
        studentId: "2c04593e-a58f-4fd1-b9d9-26be1f4eaf94",
        step: "upload",
        error: "FILE_TYPE_NOT_ALLOWED",
      })
    );
  });

  it("uses a soft saved-ok notice, not the old alarming archive-failed copy", () => {
    const notice = formArchiveSoftNotice({});
    expect(notice).toContain("הטופס נשמר");
    expect(notice).not.toMatch(/יצירת עותק לארכיון נכשלה/);
    expect(notice).not.toMatch(/השער נפתח/);
    expect(formArchiveSoftNotice({ fileTooLarge: true })).toContain("גדול מדי");
  });

  it("treats FormArchiveError retryable flag and unknown errors consistently", () => {
    expect(isNonRetryableArchiveError(new Error("FILE_TOO_LARGE"))).toBe(true);
    expect(
      isNonRetryableArchiveError(
        new FormArchiveError("boom", "upload", { retryable: false })
      )
    ).toBe(true);
    expect(isNonRetryableArchiveError(new Error("FILE_TYPE_NOT_ALLOWED"))).toBe(
      false
    );
    expect(archiveErrorMessage({})).toBe("UNKNOWN_ARCHIVE_ERROR");
  });

  it("archives personal-basket card into its category folder", () => {
    expect(
      archiveFolderForSchema({
        formId: "personal-basket-card",
        folder: "כרטיס תלמיד סל אישי",
        categoryFolder: "אינפורמציה כללית",
        studentStatus: "personal-basket",
      })
    ).toBe("אינפורמציה כללית");
  });
});
