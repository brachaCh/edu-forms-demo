import { beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToDataUrl, ZIP } from "@/lib/upload-magic.test";

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: vi.fn(),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  tenantInsertStudent: vi.fn(),
  tenantPatchStudent: vi.fn(),
  tenantFetchStudents: vi.fn(),
  tenantFetchInstitutionStaffForPicker: vi.fn(),
  tenantRemoveStudent: vi.fn(),
  tenantFetchStudentDocuments: vi.fn(),
  tenantFetchStudentDocumentData: vi.fn(),
  tenantInsertStudentDocument: vi.fn(),
  tenantUpsertPaperWaiverScan: vi.fn(),
  tenantRemovePaperWaiverScan: vi.fn(),
  tenantArchivePaperWaiverScan: vi.fn(),
  tenantRemoveStudentDocument: vi.fn(),
  tenantUpdateStudentDocument: vi.fn(),
  tenantFetchStudentCustomFields: vi.fn(),
  tenantInsertStudentCustomField: vi.fn(),
  tenantPatchStudentCustomField: vi.fn(),
  tenantRemoveStudentCustomField: vi.fn(),
  tenantFetchStudentFormFill: vi.fn(),
  tenantFetchStudentFormFills: vi.fn(),
  tenantFetchStudentFormFillById: vi.fn(),
  tenantUpsertStudentFormFill: vi.fn(),
  tenantRemoveStudentFormFill: vi.fn(),
  tenantFetchInstitutionById: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  buildTenantAccessAuditFromOp: vi.fn(),
  buildTenantAuditFromOp: vi.fn(),
  insertAuditLog: vi.fn(),
  isAccessTenantOp: vi.fn(() => false),
  isMutatingTenantOp: vi.fn(() => false),
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
import {
  tenantArchivePaperWaiverScan,
  tenantFetchStudentDocumentData,
  tenantInsertStudent,
  tenantPatchStudent,
  tenantRemoveStudentFormFill,
  tenantUpsertPaperWaiverScan,
} from "@/lib/server-tenant-data";
import { POST } from "./route";

const adminSession = {
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

describe("TZ-32: tenant data route forbidden errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: adminSession,
    });
  });

  it("returns 403 when insertStudent throws ADMIN_CANNOT_ASSIGN_TEACHER", async () => {
    (tenantInsertStudent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ADMIN_CANNOT_ASSIGN_TEACHER")
    );

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "insertStudent",
        student: {
          category: "schools",
          full_name: "תלמידה",
          teacher_name: "רותי",
        },
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("ADMIN_CANNOT_ASSIGN_TEACHER");
  });

  it("returns 403 when patchStudent throws ADMIN_CANNOT_ASSIGN_TEACHER", async () => {
    (tenantPatchStudent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ADMIN_CANNOT_ASSIGN_TEACHER")
    );

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "patchStudent",
        id: "00000000-0000-4000-8000-000000000099",
        patch: { teacher_name: "רותי חדשה" },
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("ADMIN_CANNOT_ASSIGN_TEACHER");
  });
});

describe("TZ-30: institution admin can set single_responsible_party", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: adminSession,
    });
    (tenantPatchStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
      single_responsible_party: true,
    });
  });

  it("forwards single_responsible_party from a membership admin (not owner)", async () => {
    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "patchStudent",
        id: "00000000-0000-4000-8000-000000000099",
        patch: { single_responsible_party: true },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(tenantPatchStudent).toHaveBeenCalledWith(
      adminSession.institutionId,
      "00000000-0000-4000-8000-000000000099",
      { single_responsible_party: true },
      expect.objectContaining({
        userId: adminSession.userId,
        membershipRole: "admin",
      })
    );
  });
});

describe("TZ-90: document read errors stay generic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: adminSession,
    });
  });

  it("returns DOCUMENT_READ_FAILED instead of a raw Supabase error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (
      tenantFetchStudentDocumentData as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error("password authentication failed for user postgres")
    );

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "fetchStudentDocumentData",
        id: "doc-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "DOCUMENT_READ_FAILED",
    });
    errorSpy.mockRestore();
  });
});

describe("TZ-99: paper waiver scan tenant op", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: adminSession,
    });
  });

  it("stores the scan through the same tenant document access path", async () => {
    (
      tenantUpsertPaperWaiverScan as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000088",
      name: "signed-waiver.pdf",
      is_paper_waiver: true,
    });

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "upsertPaperWaiverScan",
        doc: {
          student_id: "00000000-0000-4000-8000-000000000099",
          name: "signed-waiver.pdf",
          mime_type: "application/pdf",
          size: 128,
          data_url: "data:application/pdf;base64,JVBERi0xLjQ=",
          folder: "ויתור סודיות",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(tenantUpsertPaperWaiverScan).toHaveBeenCalledWith(
      adminSession.institutionId,
      expect.objectContaining({
        name: "signed-waiver.pdf",
        student_id: "00000000-0000-4000-8000-000000000099",
      }),
      expect.objectContaining({ userId: adminSession.userId })
    );
  });

  it("returns 400 for PAPER_WAIVER_TYPE_NOT_ALLOWED without logging an error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "upsertPaperWaiverScan",
        doc: {
          student_id: "00000000-0000-4000-8000-000000000099",
          name: "waiver.docx",
          mime_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: ZIP.length,
          data_url: bytesToDataUrl(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ZIP
          ),
          folder: "ויתור סודיות",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "PAPER_WAIVER_TYPE_NOT_ALLOWED",
    });
    expect(tenantUpsertPaperWaiverScan).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("TZ-189: removes a portfolio form fill through the tenant route", async () => {
    (
      tenantRemoveStudentFormFill as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    const fillId = "00000000-0000-4000-8000-000000000088";

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "removeStudentFormFill",
        id: fillId,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(tenantRemoveStudentFormFill).toHaveBeenCalledWith(
      adminSession.institutionId,
      fillId,
      expect.objectContaining({ userId: adminSession.userId })
    );
  });

  it("archives a paper waiver through the dedicated tenant op", async () => {
    (
      tenantArchivePaperWaiverScan as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "archivePaperWaiverScan",
        studentId: "00000000-0000-4000-8000-000000000099",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(tenantArchivePaperWaiverScan).toHaveBeenCalledWith(
      adminSession.institutionId,
      "00000000-0000-4000-8000-000000000099",
      expect.objectContaining({ userId: adminSession.userId })
    );
  });
});

describe("TZ-139: storage ref rejection in generic routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireTenantSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      session: adminSession,
    });
  });

  it("rejects storage:// ref in insertStudentDocument", async () => {
    const { tenantInsertStudentDocument } = await import(
      "@/lib/server-tenant-data"
    );

    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "insertStudentDocument",
        doc: {
          student_id: "00000000-0000-4000-8000-000000000099",
          name: "injected.pdf",
          mime_type: "application/pdf",
          size: 1024,
          data_url:
            "storage://student-documents/other-inst/other-student/file.pdf",
          folder: "כללי",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "STORAGE_REF_NOT_ALLOWED",
    });
    expect(tenantInsertStudentDocument).not.toHaveBeenCalled();
  });

  it("rejects storage:// ref in upsertPaperWaiverScan", async () => {
    const request = new Request("http://localhost/api/tenant/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "upsertPaperWaiverScan",
        doc: {
          student_id: "00000000-0000-4000-8000-000000000099",
          name: "waiver.pdf",
          mime_type: "application/pdf",
          size: 1024,
          data_url:
            "storage://student-documents/other-inst/other-student/scan.pdf",
          folder: "ויתור סודיות",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "STORAGE_REF_NOT_ALLOWED",
    });
    expect(tenantUpsertPaperWaiverScan).not.toHaveBeenCalled();
  });
});
