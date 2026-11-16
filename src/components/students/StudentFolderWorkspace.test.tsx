/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/personal-area/students/folder/s1/folder",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/providers/SiteTextProvider", () => ({
  useSiteText: () => ({ texts: {} }),
}));

vi.mock("@/components/providers/DataStoreProvider", () => ({
  useDataStore: () => ({ guestDemo: false, ready: true }),
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => <span>{path}</span>,
}));

vi.mock("@/components/students/ConfidentialityWaiverRequiredDialog", () => ({
  ConfidentialityWaiverRequiredDialog: () => null,
}));

vi.mock("@/components/students/FolderDocumentUploadPanel", () => ({
  FolderDocumentUploadPanel: () => null,
}));

vi.mock("@/components/students/StudentFolderFilledFormsList", () => ({
  StudentFolderFilledFormsList: () => null,
}));

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: () => [],
  getStudents: () => [
    { id: "s1", status: "integration", category: "schools" },
  ],
}));

vi.mock("@/lib/confidentiality-waiver-gate", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/confidentiality-waiver-gate")
  >("@/lib/confidentiality-waiver-gate");
  return {
    ...actual,
    loadCanAccessPortfolioForm: async () => true,
  };
});

vi.mock("@/lib/student-document-print", () => ({
  printDocumentsInFolders: async () => ({ ok: true }),
}));

import { StudentFolderWorkspace } from "./StudentFolderWorkspace";

describe("StudentFolderWorkspace TZ-100", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("hides the rename pencil on Additional Documents form buttons", async () => {
    render(
      <StudentFolderWorkspace studentId="s1" folderName="מסמכים נוספים" />
    );

    await waitFor(() => {
      expect(
        screen.getByText("חידוש הזכאות לשירותי חינוך מיוחדים")
      ).toBeTruthy();
    });
    expect(screen.queryAllByRole("button", { name: "עריכה" })).toHaveLength(0);
    expect(
      screen.getAllByRole("button", { name: /^הדפסת / }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "מילוי הטופס" }).length
    ).toBeGreaterThan(0);
  });

  it("keeps the rename pencil on other folders", async () => {
    render(<StudentFolderWorkspace studentId="s1" folderName={'תח"י'} />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "עריכה" }).length
      ).toBeGreaterThan(0);
    });
  });
});
