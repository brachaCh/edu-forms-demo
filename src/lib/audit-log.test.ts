import { describe, expect, it } from "vitest";
import {
  asAuditEntityId,
  buildTenantAccessAuditFromOp,
  buildTenantAuditFromOp,
  sanitizeAuditMetadata,
} from "./audit-log";

describe("sanitizeAuditMetadata", () => {
  it("strips password token and secret keys", () => {
    const cleaned = sanitizeAuditMetadata({
      studentId: "abc",
      password: "secret",
      token: "tok",
      api_key: "k",
    });
    expect(cleaned).toEqual({ studentId: "abc" });
  });
});

describe("asAuditEntityId", () => {
  it("accepts uuid and rejects other strings", () => {
    expect(asAuditEntityId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(asAuditEntityId("not-a-uuid")).toBeNull();
    expect(asAuditEntityId("")).toBeNull();
  });
});

describe("buildTenantAccessAuditFromOp", () => {
  it("maps fetchStudents to student.list", () => {
    const audit = buildTenantAccessAuditFromOp("fetchStudents", {});
    expect(audit?.action).toBe("student.list");
  });

  it("maps fetchInstitutionStaffForPicker to staff.list_picker", () => {
    const audit = buildTenantAccessAuditFromOp(
      "fetchInstitutionStaffForPicker",
      {}
    );
    expect(audit?.action).toBe("staff.list_picker");
  });

  it("maps fetchInstitutionStaffForFill to staff.list_fill", () => {
    const audit = buildTenantAccessAuditFromOp(
      "fetchInstitutionStaffForFill",
      {}
    );
    expect(audit?.action).toBe("staff.list_fill");
  });

  it("maps document fetch to document.list with student id", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const audit = buildTenantAccessAuditFromOp("fetchStudentDocuments", {
      studentId,
    });
    expect(audit?.action).toBe("document.list");
    expect(audit?.entityId).toBe(studentId);
  });
});

describe("buildTenantAuditFromOp paper waiver", () => {
  it("records who uploaded or removed a scan without student names", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const upload = buildTenantAuditFromOp(
      "upsertPaperWaiverScan",
      { doc: { student_id: studentId, name: "signed-waiver.pdf" } },
      { id: "660e8400-e29b-41d4-a716-446655440000", name: "signed-waiver.pdf" }
    );
    expect(upload?.action).toBe("waiver.paper_upload");
    expect(upload?.summary).toBe("הועלתה סריקת ויתור סודיות");
    expect(upload?.summary).not.toContain("signed-waiver.pdf");
    expect(upload?.metadata).toEqual({
      student_id: studentId,
      paper_waiver: true,
    });
    expect(JSON.stringify(upload)).not.toMatch(
      /תלמיד בדיקה|שם משפחה|signed-waiver\.pdf/
    );

    const remove = buildTenantAuditFromOp(
      "removePaperWaiverScan",
      { studentId },
      null
    );
    expect(remove?.action).toBe("waiver.paper_remove");
    expect(remove?.entityId).toBe(studentId);

    const archive = buildTenantAuditFromOp(
      "archivePaperWaiverScan",
      { studentId },
      null
    );
    expect(archive?.action).toBe("waiver.paper_archive");
    expect(archive?.entityId).toBe(studentId);
    expect(archive?.summary).toBe("סריקת ויתור סודיות הועברה לארכיון");
    expect(archive?.metadata).toEqual({
      student_id: studentId,
      paper_waiver: true,
    });
    expect(JSON.stringify(archive)).not.toMatch(
      /תלמיד בדיקה|שם משפחה|signed-waiver\.pdf/
    );
  });
});
