import { describe, expect, it, vi } from "vitest";
import type { StudentDocument } from "@/lib/supabase/types";
import { bytesToDataUrl, PDF, ZIP } from "@/lib/upload-magic.test";
import {
  applyPaperWaiverListAction,
  applyPaperWaiverListArchiveAction,
  assertPaperWaiverScanUpload,
  canRestorePaperWaiverScan,
  documentsAfterRemovingActivePaperWaiver,
  documentsAfterReplacingActivePaperWaiver,
  findPaperWaiverScan,
  hasPaperWaiverScanInDocs,
  isActivePaperWaiverScan,
  isPaperWaiverScanFileName,
  isPaperWaiverScanMime,
  paperWaiverErrorTextPath,
  paperWaiverListDeleteDecision,
  waiverSatisfactionSource,
} from "./paper-waiver-scan";

function doc(
  extras: Partial<StudentDocument> & Pick<StudentDocument, "id">
): StudentDocument {
  return {
    student_id: "s1",
    name: "signed-waiver.pdf",
    mime_type: "application/pdf",
    size: 20,
    data_url: "data:application/pdf;base64,AAAA",
    folder: "ויתור סודיות",
    uploaded_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    is_paper_waiver: true,
    ...extras,
  };
}

describe("TZ-99 paper waiver scan helpers", () => {
  it("accepts PDF and image names/mimes only", () => {
    expect(isPaperWaiverScanMime("application/pdf")).toBe(true);
    expect(isPaperWaiverScanMime("image/jpeg")).toBe(true);
    expect(isPaperWaiverScanMime("image/png")).toBe(true);
    expect(isPaperWaiverScanMime("application/msword")).toBe(false);
    expect(isPaperWaiverScanFileName("signed-waiver.PDF")).toBe(true);
    expect(isPaperWaiverScanFileName("scan.jpg")).toBe(true);
    expect(isPaperWaiverScanFileName("notes.docx")).toBe(false);
  });

  it("rejects a Word file even if the generic upload path would allow it", () => {
    const dataUrl = bytesToDataUrl(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ZIP
    );
    expect(
      assertPaperWaiverScanUpload({
        name: "waiver.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: ZIP.length,
        dataUrl,
      })
    ).toEqual({ ok: false, error: "PAPER_WAIVER_TYPE_NOT_ALLOWED" });
  });

  it("accepts a PDF that passes the shared upload guard", () => {
    const dataUrl = bytesToDataUrl("application/pdf", PDF);
    const result = assertPaperWaiverScanUpload({
      name: "signed-waiver.pdf",
      mimeType: "application/pdf",
      size: PDF.length,
      dataUrl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe("application/pdf");
  });

  it("ignores archived scans and generic folder uploads", () => {
    expect(
      isActivePaperWaiverScan({ is_paper_waiver: true, archived_at: null })
    ).toBe(true);
    expect(
      isActivePaperWaiverScan({
        is_paper_waiver: true,
        archived_at: "2026-01-02T00:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isActivePaperWaiverScan({ is_paper_waiver: false, archived_at: null })
    ).toBe(false);

    const docs = [
      doc({ id: "old", uploaded_at: "2026-01-01T00:00:00.000Z" }),
      doc({
        id: "archived",
        uploaded_at: "2026-02-01T00:00:00.000Z",
        archived_at: "2026-02-02T00:00:00.000Z",
      }),
      doc({
        id: "folder-upload",
        is_paper_waiver: false,
        uploaded_at: "2026-03-01T00:00:00.000Z",
      }),
    ];
    expect(findPaperWaiverScan(docs)?.id).toBe("old");
    expect(hasPaperWaiverScanInDocs(docs)).toBe(true);
    expect(hasPaperWaiverScanInDocs([docs[2]])).toBe(false);
  });

  it("replace and remove keep archived legal copies", () => {
    const docs = [
      doc({ id: "active" }),
      doc({
        id: "archived",
        archived_at: "2026-02-02T00:00:00.000Z",
        uploaded_at: "2026-02-01T00:00:00.000Z",
      }),
      doc({ id: "other-student", student_id: "s2" }),
    ];
    const replaced = documentsAfterReplacingActivePaperWaiver(
      docs,
      "s1",
      "2026-03-01T00:00:00.000Z"
    );
    expect(replaced.find((item) => item.id === "active")?.archived_at).toBe(
      "2026-03-01T00:00:00.000Z"
    );
    expect(replaced.find((item) => item.id === "archived")?.archived_at).toBe(
      "2026-02-02T00:00:00.000Z"
    );
    expect(replaced.find((item) => item.id === "other-student")?.archived_at).toBeNull();

    const removed = documentsAfterRemovingActivePaperWaiver(docs, "s1");
    expect(removed.map((item) => item.id)).toEqual(["archived", "other-student"]);
  });

  it("blocks restoring an archived scan while another active scan exists", () => {
    const docs = [
      doc({ id: "active" }),
      doc({
        id: "archived",
        archived_at: "2026-02-02T00:00:00.000Z",
      }),
    ];
    expect(canRestorePaperWaiverScan(docs, docs[1])).toBe(false);
    expect(canRestorePaperWaiverScan(docs, docs[0])).toBe(true);
    expect(
      canRestorePaperWaiverScan(
        [docs[1]],
        { id: "archived", student_id: "s1", is_paper_waiver: true }
      )
    ).toBe(true);
  });

  it("routes folder-list delete of a paper scan through removal or a block", () => {
    expect(
      paperWaiverListDeleteDecision({
        is_paper_waiver: true,
        archived_at: null,
      })
    ).toEqual({ action: "remove-active" });
    expect(
      paperWaiverListDeleteDecision({
        is_paper_waiver: true,
        archived_at: "2026-02-02T00:00:00.000Z",
      })
    ).toEqual({ action: "block-archived" });
    expect(
      paperWaiverListDeleteDecision({
        is_paper_waiver: false,
        archived_at: null,
      })
    ).toEqual({ action: "regular" });
    expect(paperWaiverErrorTextPath("PAPER_WAIVER_TYPE_NOT_ALLOWED")).toBe(
      "studentPortfolio.paperWaiverTypeError"
    );
    expect(paperWaiverErrorTextPath("PAPER_WAIVER_ACTIVE_EXISTS")).toBe(
      "studentPortfolio.paperWaiverRestoreBlocked"
    );
  });

  it("routes archive of an active scan through archive, never delete", async () => {
    const archiveActive = vi.fn(async () => undefined);
    const removeActive = vi.fn(async () => undefined);
    const regular = vi.fn(async () => undefined);
    const result = await applyPaperWaiverListArchiveAction({
      doc: doc({ id: "active" }),
      documentId: "active",
      archiveActive,
      regular,
    });
    expect(result).toBe("archived-paper");
    expect(archiveActive).toHaveBeenCalledWith("s1");
    expect(regular).not.toHaveBeenCalled();
    expect(removeActive).not.toHaveBeenCalled();

    const deleteResult = await applyPaperWaiverListAction({
      doc: doc({ id: "active" }),
      documentId: "active",
      removeActive,
      regular,
    });
    expect(deleteResult).toBe("removed-paper");
    expect(removeActive).toHaveBeenCalledWith("s1");
  });

  it("reports digital, paper, both, or neither", () => {
    expect(
      waiverSatisfactionSource({
        digitalComplete: true,
        paperScanComplete: false,
      })
    ).toBe("digital");
    expect(
      waiverSatisfactionSource({
        digitalComplete: false,
        paperScanComplete: true,
      })
    ).toBe("paper-scan");
    expect(
      waiverSatisfactionSource({
        digitalComplete: true,
        paperScanComplete: true,
      })
    ).toBe("both");
    expect(
      waiverSatisfactionSource({
        digitalComplete: false,
        paperScanComplete: false,
      })
    ).toBeNull();
  });
});
