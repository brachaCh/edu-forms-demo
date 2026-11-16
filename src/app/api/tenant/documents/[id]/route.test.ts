import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: vi.fn(),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  tenantFetchStudentDocumentData: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((fn: () => void) => {
      void fn();
    }),
  };
});

import { requireTenantSession } from "@/lib/server-auth";
import { tenantFetchStudentDocumentData } from "@/lib/server-tenant-data";
import { insertAuditLog } from "@/lib/audit-log";
import { DOCUMENT_DATA_URL_MAX_CHARS, GET } from "./route";

const session = {
  userId: "admin-user",
  institutionId: "00000000-0000-4000-8000-000000000001",
  membershipRole: "admin" as const,
  hasMultipleInstitutions: false,
  profile: {
    id: "admin-user",
    full_name: "מנהלת",
    phone: "",
    email: "admin@example.com",
    institution_id: "00000000-0000-4000-8000-000000000001",
    institution_code: null,
    setup_completed_at: null,
    terms_accepted_at: null,
    is_admin: false,
    is_institution_owner: false,
    created_at: new Date().toISOString(),
  },
};

function request(id = "doc-1", query = "") {
  return GET(
    new Request(`http://localhost/api/tenant/documents/${id}${query}`),
    {
      params: Promise.resolve({ id }),
    }
  );
}

describe("GET /api/tenant/documents/[id] (TZ-90)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session,
    });
  });

  it("returns the raw data URL without a JSON wrapper", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: "data:application/pdf;base64,JVBERi0=",
    });

    const response = await request();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe(
      "data:application/pdf;base64,JVBERi0="
    );
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.view",
        entityId: "doc-1",
      })
    );
  });

  it("returns 404 when the document has no payload and does not audit", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "doc-1", data_url: "" });

    const response = await request();
    expect(response.status).toBe(404);
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no tenant session", async () => {
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });
    const response = await request();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    expect(tenantFetchStudentDocumentData).not.toHaveBeenCalled();
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 for a tenant-forbidden error and does not audit", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("MEMBER_CANNOT_EDIT_FIELD"));
    const response = await request();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "MEMBER_CANNOT_EDIT_FIELD",
    });
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("passes the member access context through", async () => {
    const memberSession = {
      ...session,
      userId: "member-1",
      membershipRole: "member" as const,
      profile: { ...session.profile, id: "member-1", is_admin: false },
    };
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: memberSession,
    });
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: "data:application/pdf;base64,JVBERi0=",
    });

    await request();

    expect(tenantFetchStudentDocumentData).toHaveBeenCalledWith(
      memberSession.institutionId,
      "doc-1",
      expect.objectContaining({
        userId: "member-1",
        institutionId: memberSession.institutionId,
        membershipRole: "member",
        isAdmin: false,
        isDemo: false,
      })
    );
  });

  it("returns 413 DOCUMENT_TOO_LARGE only for print purpose", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: `data:application/pdf;base64,${"A".repeat(DOCUMENT_DATA_URL_MAX_CHARS)}`,
    });

    const response = await request("doc-1", "?purpose=print");
    expect(response.status).toBe(413);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({
      error: "DOCUMENT_TOO_LARGE",
    });
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("returns DOCUMENT_READ_FAILED instead of a raw Supabase error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error("password authentication failed for user postgres")
    );

    const response = await request();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "DOCUMENT_READ_FAILED",
    });
    expect(insertAuditLog).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns 413 for format=bytes when stored size exceeds the print cap (TZ-139)", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: "https://proj.supabase.co/storage/v1/object/sign/student-documents/x.pdf?token=t",
      size: 12 * 1024 * 1024,
    });

    const response = await request("doc-1", "?purpose=print&format=bytes");
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "DOCUMENT_TOO_LARGE",
    });
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("returns decoded bytes for format=bytes (TZ-102)", async () => {
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: "data:application/pdf;base64,JVBERi0=",
    });

    const response = await request("doc-1", "?purpose=print&format=bytes");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/octet-stream"
    );
    expect(response.headers.get("x-document-mime")).toContain("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.toString("utf8")).toContain("%PDF");
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ via: "bytes" }),
      })
    );
  });

  it("returns a ~4.4M data URL for view/download instead of 413", async () => {
    const dataUrl = `data:application/pdf;base64,${"A".repeat(4_400_000)}`;
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "doc-1",
      data_url: dataUrl,
    });

    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.text()).length).toBe(dataUrl.length);
    expect(insertAuditLog).toHaveBeenCalled();
  });
});
