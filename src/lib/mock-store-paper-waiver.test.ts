/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-db")>();
  return {
    ...actual,
    canUseSupabase: () => false,
  };
});

vi.mock("@/lib/upload-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/upload-guard")>();
  return {
    ...actual,
    fileExceedsUploadLimits: () => false,
  };
});

import {
  addPaperWaiverScan,
  archivePaperWaiverScan,
  archiveStudentDocument,
  deleteStudentDocument,
  getStudentDocuments,
  removePaperWaiverScan,
  restoreStudentDocument,
} from "@/lib/mock-store";

const DOCUMENTS_KEY = "matoah.student-documents";

function seedDocs(
  docs: Array<{
    id: string;
    student_id?: string;
    archived_at?: string | null;
    is_paper_waiver?: boolean;
  }>
) {
  window.localStorage.setItem(
    DOCUMENTS_KEY,
    JSON.stringify(
      docs.map((doc) => ({
        id: doc.id,
        student_id: doc.student_id ?? "s1",
        name: `${doc.id}.pdf`,
        mime_type: "application/pdf",
        size: 12,
        data_url: "data:application/pdf;base64,AAAA",
        folder: "ויתור סודיות",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: doc.archived_at ?? null,
        is_paper_waiver: doc.is_paper_waiver ?? true,
      }))
    )
  );
}

describe("TZ-99 mock-store paper waiver archive safety", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps archived scans when replacing the active scan", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    const file = new File(["%PDF-1.4"], "replacement.pdf", {
      type: "application/pdf",
    });
    const created = await addPaperWaiverScan("s1", file);
    const afterReplace = getStudentDocuments("s1");
    expect(afterReplace.some((doc) => doc.id === "archived")).toBe(true);
    expect(afterReplace.find((doc) => doc.id === "active")?.archived_at).toBeTruthy();
    expect(afterReplace.find((doc) => doc.id === created.id)?.archived_at).toBeNull();
  });

  it("TZ-99: removePaperWaiverScan archives instead of deleting (legal retention)", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    await removePaperWaiverScan("s1");
    const afterRemove = getStudentDocuments("s1");
    expect(afterRemove.map((doc) => doc.id).sort()).toEqual(["active", "archived"]);
    expect(afterRemove.find((doc) => doc.id === "active")?.archived_at).toBeTruthy();
    expect(afterRemove.find((doc) => doc.id === "archived")?.archived_at).toBe(
      "2020-01-01T00:00:00.000Z"
    );
  });

  it("blocks restoring an archived scan while an active one exists", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    await expect(restoreStudentDocument("archived")).rejects.toThrow(
      "PAPER_WAIVER_ACTIVE_EXISTS"
    );
    expect(
      getStudentDocuments("s1").find((doc) => doc.id === "archived")?.archived_at
    ).toBe("2020-01-01T00:00:00.000Z");
  });

  it("archives the active scan in place and never deletes it", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    await archivePaperWaiverScan("s1");
    const afterArchive = getStudentDocuments("s1");
    expect(afterArchive.map((doc) => doc.id).sort()).toEqual([
      "active",
      "archived",
    ]);
    expect(afterArchive.find((doc) => doc.id === "active")?.archived_at).toBeTruthy();
    expect(afterArchive.find((doc) => doc.id === "archived")?.archived_at).toBe(
      "2020-01-01T00:00:00.000Z"
    );
  });

  it("routes generic archive of an active scan through archivePaperWaiverScan", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    await archiveStudentDocument("active");
    const afterArchive = getStudentDocuments("s1");
    expect(afterArchive.map((doc) => doc.id).sort()).toEqual([
      "active",
      "archived",
    ]);
    expect(afterArchive.find((doc) => doc.id === "active")?.archived_at).toBeTruthy();
  });

  it("TZ-99: routes folder-list delete of the active scan through paper-waiver removal (archives)", async () => {
    seedDocs([
      { id: "active", archived_at: null },
      { id: "archived", archived_at: "2020-01-01T00:00:00.000Z" },
    ]);

    await deleteStudentDocument("active");
    const remaining = getStudentDocuments("s1");
    expect(remaining.map((doc) => doc.id).sort()).toEqual(["active", "archived"]);
    expect(remaining.find((doc) => doc.id === "active")?.archived_at).toBeTruthy();

    await expect(deleteStudentDocument("archived")).rejects.toThrow(
      "PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED"
    );
    expect(getStudentDocuments("s1").map((doc) => doc.id).sort()).toEqual([
      "active",
      "archived",
    ]);
  });
});
