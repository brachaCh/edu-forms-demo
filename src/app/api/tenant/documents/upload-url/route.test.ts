import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateSignedUploadUrl = vi.fn();
const mockBuildPath = vi.fn();
const mockCreateTicket = vi.fn();
const mockConfigured = vi.fn();
const mockAssertMember = vi.fn();

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
    isDemo: session.userId === "demo-user",
  })),
}));

vi.mock("@/lib/student-document-storage", () => ({
  isStudentDocumentUploadConfigured: (...args: unknown[]) =>
    mockConfigured(...args),
  buildStudentDocumentStoragePath: (...args: unknown[]) => mockBuildPath(...args),
  createStudentDocumentSignedUploadUrl: (...args: unknown[]) =>
    mockCreateSignedUploadUrl(...args),
  createStudentDocumentUploadTicket: (...args: unknown[]) =>
    mockCreateTicket(...args),
}));

import { requireTenantSession } from "@/lib/server-auth";
import { POST } from "./route";

const session = {
  userId: "user-1",
  institutionId: "inst-1",
  membershipRole: "admin" as const,
  profile: { is_admin: true },
};

const STUDENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function request(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/tenant/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/tenant/documents/upload-url (TZ-139)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockAssertMember.mockResolvedValue(true);
    mockBuildPath.mockReturnValue("inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf");
    mockCreateSignedUploadUrl.mockResolvedValue({
      ok: true,
      signedUrl: "https://example.com/upload",
    });
    mockCreateTicket.mockReturnValue("ticket-1");
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a file over 25MB before creating a signed URL", async () => {
    const response = await request({
      studentId: STUDENT_ID,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 26 * 1024 * 1024,
      folder: "כללי",
      kind: "upload",
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "FILE_TOO_LARGE",
    });
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("returns a signed upload URL for a 12MB PDF", async () => {
    const response = await request({
      studentId: STUDENT_ID,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 12 * 1024 * 1024,
      folder: "כללי",
      kind: "upload",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      signedUrl: "https://example.com/upload",
      storagePath: "inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
      uploadTicket: "ticket-1",
    });
  });

  it("rejects a disallowed type", async () => {
    const response = await request({
      studentId: STUDENT_ID,
      fileName: "payload.html",
      mimeType: "text/html",
      size: 1024,
      folder: "כללי",
      kind: "upload",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "FILE_TYPE_NOT_ALLOWED",
    });
  });
});
