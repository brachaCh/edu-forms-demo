/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mock-store", () => ({
  getStudentFormFill: vi.fn(),
  getStudentDocuments: vi.fn(() => []),
  getStudents: vi.fn(() => []),
  loadStudentFormFill: vi.fn(async () => null),
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentRole: vi.fn(() => "upload"),
  getDocumentSlot: vi.fn(() => null),
}));

vi.mock("@/lib/free-access", () => ({
  isFreeAccessMode: vi.fn(() => false),
}));

vi.mock("@/lib/simplesign-signature-request", () => ({
  loadSimpleSignSubmissions: vi.fn(),
  resendSimpleSignEmail: vi.fn(),
}));

import { getStudentFormFill } from "@/lib/mock-store";
import { loadSimpleSignSubmissions } from "@/lib/simplesign-signature-request";
import { WaiverSignerLockedStatus } from "./WaiverSignerLockedStatus";

const mockedGetFill = vi.mocked(getStudentFormFill);
const mockedList = vi.mocked(loadSimpleSignSubmissions);

describe("WaiverSignerLockedStatus", () => {
  beforeEach(() => {
    mockedGetFill.mockReset();
    mockedList.mockReset();
    mockedGetFill.mockReturnValue({
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: { father_signature: "חתימת אב" },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    mockedList.mockResolvedValue({
      ok: true,
      submissions: [
        {
          id: "sub-mom",
          parentRole: "mother",
          signatureFieldKey: "mother_signature",
          status: "pending",
          signingUrl: "https://sign.example/mom",
          signerEmail: "parent@example.com",
          signerName: "",
          signedAt: null,
          createdAt: "",
        },
      ],
    });
  });

  it("shows father-signed status and a resend button only for the mother", async () => {
    render(<WaiverSignerLockedStatus studentId="s1" />);
    expect(
      screen.getByText("נחתם על ידי האב, ממתין לחתימת האם")
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "שליחת קישור חתימה לאם" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "שליחת קישור חתימה לאב" })).toBeNull();
  });
});
