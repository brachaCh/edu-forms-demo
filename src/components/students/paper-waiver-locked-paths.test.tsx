/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_TEXTS } from "@/lib/site-text";
import { getTextByPath } from "@/lib/get-text-by-path";

const { allowAccess, loadStudentFormFill, paperWaiverCalls } = vi.hoisted(() => ({
  allowAccess: { value: false },
  loadStudentFormFill: vi.fn(
    async (_studentId?: string, _formId?: string) => ({
      id: "fill-1",
      student_id: "s1",
      form_id: "tachi-prep",
      data: { meeting_date: "2026-01-15" },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    })
  ),
  paperWaiverCalls: { archive: [] as string[], remove: [] as string[] },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/personal-area/students/forms/s1/folder",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/providers/SiteTextProvider", () => ({
  useSiteText: () => ({ texts: DEFAULT_SITE_TEXTS }),
}));

vi.mock("@/components/providers/DataStoreProvider", () => ({
  useDataStore: () => ({ guestDemo: false, ready: true }),
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => (
    <span>{getTextByPath(DEFAULT_SITE_TEXTS, path)}</span>
  ),
}));

vi.mock("@/components/students/ConfidentialityWaiverRequiredDialog", () => ({
  ConfidentialityWaiverRequiredDialog: ({
    onUnlocked,
  }: {
    onUnlocked?: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        allowAccess.value = true;
        onUnlocked?.();
      }}
    >
      unlock-from-dialog
    </button>
  ),
}));

vi.mock("@/components/students/WaiverSignerLockedStatus", () => ({
  WaiverSignerLockedStatus: () => <div>signer-status</div>,
}));

vi.mock("@/components/students/PaperWaiverScanPanel", () => ({
  PaperWaiverScanPanel: ({ onChanged }: { onChanged?: () => void }) => (
    <button
      type="button"
      onClick={() => {
        allowAccess.value = true;
        onChanged?.();
      }}
    >
      unlock-from-panel
    </button>
  ),
}));

vi.mock("@/lib/mock-store", async () => {
  const student = {
    id: "s1",
    status: "personal-basket",
    category: "schools",
    full_name: "תלמיד בדיקה",
    archived_at: null,
  };
  return {
    getStudents: () => [student],
    getStudentDocuments: () => [
      {
        id: "scan-1",
        student_id: "s1",
        name: "signed-waiver.pdf",
        mime_type: "application/pdf",
        size: 12,
        data_url: "data:application/pdf;base64,AAAA",
        folder: "אבחון",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: null,
        is_paper_waiver: true,
      },
    ],
    archivePaperWaiverScan: async (studentId: string) => {
      paperWaiverCalls.archive.push(studentId);
      allowAccess.value = false;
    },
    removePaperWaiverScan: async (studentId: string) => {
      paperWaiverCalls.remove.push(studentId);
      allowAccess.value = false;
    },
    getStudentFormFill: () => null,
    loadStudentFormFills: async () => [],
    loadStudentFormFill: (studentId: string, formId: string) =>
      loadStudentFormFill(studentId, formId),
    loadStudentFormFillById: async () => null,
    loadStudentCustomFieldsForUi: async () => [],
    getUser: () => null,
    resolveInstitutionCode: async () => null,
    resolveInstitutionDetails: async () => ({}),
    saveStudentFormFill: async () => ({ id: "fill-1" }),
    updateStudent: async () => student,
    addStudentFormArchiveSnapshot: vi.fn(),
    archiveStudentDocument: vi.fn(),
    addStudentCustomField: vi.fn(),
    getStaffTeachers: () => [],
    updateStudentCustomField: vi.fn(),
  };
});

vi.mock("@/lib/data-cache", () => ({
  ensureStudentDocuments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase-db", () => ({
  canUseSupabase: () => false,
}));

vi.mock("@/lib/confidentiality-waiver-gate", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/confidentiality-waiver-gate")
  >("@/lib/confidentiality-waiver-gate");
  return {
    ...actual,
    loadCanAccessPortfolioForm: async () => allowAccess.value,
    canAccessPortfolioDocuments: () => allowAccess.value,
    isConfidentialityWaiverCompleted: () => allowAccess.value,
  };
});

vi.mock("@/lib/free-access", () => ({
  isFreeAccessMode: () => false,
  getFreeAccessEmail: () => null,
  isFreeAccessStudentFillable: () => true,
}));

import { StudentFolderFormsPageClient } from "./StudentFolderFormsPageClient";
import { StudentFormFillPageClient } from "./StudentFormFillPageClient";

describe("TZ-99 locked-screen unlock after paper waiver scan", () => {
  beforeEach(() => {
    allowAccess.value = false;
    paperWaiverCalls.archive = [];
    paperWaiverCalls.remove = [];
  });

  afterEach(() => {
    cleanup();
    allowAccess.value = false;
    paperWaiverCalls.archive = [];
    paperWaiverCalls.remove = [];
  });

  it("opens the folder page after upload from the lock dialog, without a full refresh", async () => {
    render(
      <StudentFolderFormsPageClient
        id="s1"
        folderName="אבחון"
        backHref="/personal-area/students/portfolio/s1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("unlock-from-dialog")).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "אבחון" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "unlock-from-dialog" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "אבחון" })).toBeTruthy();
    });
  });

  it("re-hydrates the saved fill after the lock lifts", async () => {
    loadStudentFormFill.mockClear();
    render(
      <StudentFormFillPageClient
        id="s1"
        formId="tachi-prep"
        backHref="/personal-area/students/portfolio/s1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "unlock-from-dialog" })
      ).toBeTruthy();
    });
    expect(loadStudentFormFill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "unlock-from-dialog" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "unlock-from-dialog" })).toBeNull();
    });
    await waitFor(() => {
      expect(loadStudentFormFill).toHaveBeenCalled();
      expect(
        screen.getByRole("heading", {
          name: 'דף הכנה לתח"י (היעזרי במחוון)',
        })
      ).toBeTruthy();
    });
  });

  it("archives the active scan without deleting it, then re-locks the folder page", async () => {
    allowAccess.value = true;
    render(
      <StudentFolderFormsPageClient
        id="s1"
        folderName="אבחון"
        backHref="/personal-area/students/portfolio/s1"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "אבחון" })).toBeTruthy();
    });
    fireEvent.click(
      within(screen.getByText("signed-waiver.pdf").closest("li") as HTMLElement).getByRole(
        "button",
        { name: "לארכיון" }
      )
    );

    await waitFor(() => {
      expect(paperWaiverCalls.archive).toEqual(["s1"]);
      expect(paperWaiverCalls.remove).toEqual([]);
      expect(screen.queryByRole("heading", { name: "אבחון" })).toBeNull();
      expect(screen.getByText("unlock-from-dialog")).toBeTruthy();
    });
  });

});
