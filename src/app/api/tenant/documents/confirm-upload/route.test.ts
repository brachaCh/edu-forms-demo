import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyTicket = vi.fn();
const mockConfirmObject = vi.fn();
const mockConfigured = vi.fn();
const mockAssertMember = vi.fn();
const mockInsert = vi.fn();
const mockUpsertPaper = vi.fn();
const mockStorageRefAlreadyUsed = vi.fn();

vi.mock("@/lib/app-request-origin", () => ({
  assertAllowedAppOrigin: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: vi.fn(),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  assertMemberCanAccessStudent: (...args: unknown[]) => mockAssertMember(...args),
  buildMemberAccessContext: vi.fn((session) => ({
    userId: session.userId,
    institutionId: session.institutionId,
    membershipRole: session.membershipRole,
    isAdmin: session.profile?.is_admin === true,
    isDemo: false,
  })),
  storageRefAlreadyUsed: (...args: unknown[]) => mockStorageRefAlreadyUsed(...args),
  tenantInsertStudentDocument: (...args: unknown[]) => mockInsert(...args),
  tenantUpsertPaperWaiverScan: (...args: unknown[]) => mockUpsertPaper(...args),
}));

vi.mock("@/lib/student-document-storage", () => ({
  isStudentDocumentUploadConfigured: (...args: unknown[]) =>
    mockConfigured(...args),
  verifyStudentDocumentUploadTicket: (...args: unknown[]) =>
    mockVerifyTicket(...args),
  confirmStudentDocumentObject: (...args: unknown[]) =>
    mockConfirmObject(...args),
  removeStudentDocumentObject: vi.fn().mockResolvedValue(undefined),
}));

import { requireTenantSession } from "@/lib/server-auth";
import { POST } from "./route";

const session = {
  userId: "user-1",
  institutionId: "inst-1",
  membershipRole: "admin" as const,
  profile: { is_admin: true },
};

function request(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/tenant/documents/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/tenant/documents/confirm-upload (TZ-139)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockAssertMember.mockResolvedValue(true);
    mockStorageRefAlreadyUsed.mockResolvedValue(false);
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session,
    });
    mockVerifyTicket.mockReturnValue({
      ok: true,
      ticket: {
        typ: "student-doc",
        institutionId: "inst-1",
        studentId: "student-1",
        storagePath:
          "inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
        fileName: "scan.pdf",
        mimeType: "application/pdf",
        size: 12 * 1024 * 1024,
        folder: "כללי",
        kind: "upload",
        userId: "user-1",
        expiresAt: Date.now() + 60_000,
      },
    });
    mockConfirmObject.mockResolvedValue({
      ok: true,
      mimeType: "application/pdf",
      sizeBytes: 12 * 1024 * 1024,
      dataUrl:
        "storage://student-documents/inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
    });
    mockInsert.mockResolvedValue({
      id: "doc-1",
      student_id: "student-1",
      name: "scan.pdf",
      mime_type: "application/pdf",
      size: 12 * 1024 * 1024,
      data_url:
        "storage://student-documents/inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
      folder: "כללי",
      uploaded_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("rejects an invalid ticket", async () => {
    mockVerifyTicket.mockReturnValue({ ok: false, error: "invalid_signature" });
    const response = await request({ uploadTicket: "bad" });
    expect(response.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a storage-backed document after the object is verified", async () => {
    const response = await request({ uploadTicket: "good-ticket" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("doc-1");
    expect(mockInsert).toHaveBeenCalledWith(
      "inst-1",
      expect.objectContaining({
        student_id: "student-1",
        size: 12 * 1024 * 1024,
        data_url:
          "storage://student-documents/inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
      }),
      expect.any(Object)
    );
  });

  it("surfaces FILE_TOO_LARGE from object verification", async () => {
    mockConfirmObject.mockResolvedValue({
      ok: false,
      error: "FILE_TOO_LARGE",
    });
    const response = await request({ uploadTicket: "good-ticket" });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "FILE_TOO_LARGE",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects a ticket that was already used (single-use)", async () => {
    mockStorageRefAlreadyUsed.mockResolvedValue(true);
    const response = await request({ uploadTicket: "good-ticket" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "TICKET_ALREADY_USED",
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockConfirmObject).not.toHaveBeenCalled();
  });

  it("removes the storage object if document insert fails (cleanup)", async () => {
    const { removeStudentDocumentObject } = await import(
      "@/lib/student-document-storage"
    );
    mockInsert.mockRejectedValue(new Error("DOCUMENT_WRITE_FAILED"));
    const response = await request({ uploadTicket: "good-ticket" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "DOCUMENT_WRITE_FAILED",
    });
    expect(removeStudentDocumentObject).toHaveBeenCalledWith(
      "inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
      "inst-1"
    );
  });
});
