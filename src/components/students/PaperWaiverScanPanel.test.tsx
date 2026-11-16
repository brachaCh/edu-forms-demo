/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_TEXTS } from "@/lib/site-text";
import { getTextByPath } from "@/lib/get-text-by-path";

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: vi.fn(() => []),
  addPaperWaiverScan: vi.fn(),
  removePaperWaiverScan: vi.fn(),
  getStudentFormFill: vi.fn(() => null),
  getStudents: vi.fn(() => []),
}));

vi.mock("@/lib/data-cache", () => ({
  ensureStudentDocuments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/student-document-open", () => ({
  openStudentDocument: vi.fn(),
}));

vi.mock("@/components/providers/SiteTextProvider", () => ({
  useSiteText: () => ({ texts: DEFAULT_SITE_TEXTS }),
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => (
    <span>{getTextByPath(DEFAULT_SITE_TEXTS, path)}</span>
  ),
}));

import {
  addPaperWaiverScan,
  getStudentDocuments,
  getStudentFormFill,
  removePaperWaiverScan,
} from "@/lib/mock-store";
import { openStudentDocument } from "@/lib/student-document-open";
import { PaperWaiverScanPanel } from "./PaperWaiverScanPanel";

const mockedGetDocs = vi.mocked(getStudentDocuments);
const mockedAdd = vi.mocked(addPaperWaiverScan);
const mockedRemove = vi.mocked(removePaperWaiverScan);
const mockedGetFill = vi.mocked(getStudentFormFill);
const mockedOpen = vi.mocked(openStudentDocument);

const paperDoc = {
  id: "paper-1",
  student_id: "s1",
  name: "signed-waiver.pdf",
  mime_type: "application/pdf",
  size: 20,
  data_url: "data:application/pdf,abc",
  folder: "ויתור סודיות",
  uploaded_at: "2026-01-01T12:00:00.000Z",
  archived_at: null,
  is_paper_waiver: true,
};

describe("PaperWaiverScanPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedGetDocs.mockReset();
    mockedAdd.mockReset();
    mockedRemove.mockReset();
    mockedGetFill.mockReset();
    mockedOpen.mockReset();
    mockedGetDocs.mockReturnValue([]);
    mockedGetFill.mockReturnValue(null);
    mockedAdd.mockResolvedValue(paperDoc);
    mockedRemove.mockResolvedValue(undefined);
  });

  it("shows the upload action when no scan exists", () => {
    render(<PaperWaiverScanPanel studentId="s1" />);
    expect(screen.getByText("סריקה חתומה של ויתור סודיות")).toBeTruthy();
    expect(screen.getByRole("button", { name: "העלאת סריקה חתומה" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "צפייה בסריקה" })).toBeNull();
  });

  it("distinguishes a paper-scan satisfaction from a digital signature", async () => {
    mockedGetDocs.mockReturnValue([paperDoc]);
    render(<PaperWaiverScanPanel studentId="s1" />);
    await waitFor(() => {
      expect(screen.getByText("הויתור קוים בסריקה חתומה שהועלתה")).toBeTruthy();
    });
    expect(screen.getByText("signed-waiver.pdf")).toBeTruthy();
    expect(screen.queryByText("הויתור קוים בחתימה דיגיטלית")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "צפייה בסריקה" }));
    expect(mockedOpen).toHaveBeenCalledWith(paperDoc);
  });

  it("shows both sources when digital signatures and a scan exist", async () => {
    mockedGetDocs.mockReturnValue([paperDoc]);
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {
        father_signature: "חתימת אב",
        mother_signature: "חתימת אם",
      },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    render(<PaperWaiverScanPanel studentId="s1" />);
    await waitFor(() => {
      expect(
        screen.getByText("הויתור קוים בחתימה דיגיטלית וגם בסריקה חתומה")
      ).toBeTruthy();
    });
  });

  it("replaces and removes the scan through the store helpers", async () => {
    mockedGetDocs.mockReturnValue([paperDoc]);
    const onChanged = vi.fn();
    render(<PaperWaiverScanPanel studentId="s1" onChanged={onChanged} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הסרת הסריקה" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "הסרת הסריקה" }));
    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith("s1");
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("uses site text for type errors and remove failure", async () => {
    mockedAdd.mockRejectedValueOnce(new Error("PAPER_WAIVER_TYPE_NOT_ALLOWED"));
    const { rerender } = render(<PaperWaiverScanPanel studentId="s1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(
        screen.getByText(DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverTypeError)
      ).toBeTruthy();
    });

    mockedGetDocs.mockReturnValue([paperDoc]);
    mockedRemove.mockRejectedValueOnce(new Error("network"));
    rerender(<PaperWaiverScanPanel studentId="s1" refreshKey={1} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הסרת הסריקה" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "הסרת הסריקה" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverRemoveFailed
        )
      ).toBeTruthy();
    });
  });
});
