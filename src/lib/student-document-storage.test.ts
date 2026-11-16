import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  fileExceedsUploadLimits,
  needsDirectStorageUpload,
} from "@/lib/upload-guard";
import {
  createStudentDocumentUploadTicket,
  verifyStudentDocumentUploadTicket,
} from "@/lib/student-document-storage";

const SECRET = "a-secure-test-secret-key-at-least-32-chars-long";
const INST_A = "550e8400-e29b-41d4-a716-446655440000";
const INST_B = "660f9500-f39c-52e5-b817-557766551111";
const STUDENT_ID = "550e8400-e29b-41d4-a716-446655440001";
const PATH = `${INST_A}/${STUDENT_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf`;
const CROSS_TENANT_PATH = `${INST_B}/${STUDENT_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf`;

describe("student document upload tickets", () => {
  beforeEach(() => {
    process.env.UPLOAD_TICKET_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.UPLOAD_TICKET_SECRET;
  });

  it("round-trips a ticket for the same user and institution", () => {
    const token = createStudentDocumentUploadTicket({
      institutionId: INST_A,
      studentId: STUDENT_ID,
      storagePath: PATH,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 12 * 1024 * 1024,
      folder: "כללי",
      kind: "upload",
      userId: "user-1",
    });
    const verified = verifyStudentDocumentUploadTicket(token, "user-1", INST_A);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.ticket.storagePath).toBe(PATH);
      expect(verified.ticket.size).toBe(12 * 1024 * 1024);
    }
  });

  it("rejects a ticket for another user or institution", () => {
    const token = createStudentDocumentUploadTicket({
      institutionId: INST_A,
      studentId: STUDENT_ID,
      storagePath: PATH,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 1024,
      folder: "כללי",
      kind: "upload",
      userId: "user-1",
    });
    expect(verifyStudentDocumentUploadTicket(token, "user-2", INST_A).ok).toBe(
      false
    );
    expect(verifyStudentDocumentUploadTicket(token, "user-1", INST_B).ok).toBe(
      false
    );
    expect(verifyStudentDocumentUploadTicket("not-a-ticket", "user-1", INST_A).ok).toBe(
      false
    );
  });

  it("TZ-139: rejects cross-tenant storage path (path institution differs from ticket institution)", () => {
    const token = createStudentDocumentUploadTicket({
      institutionId: INST_A,
      studentId: STUDENT_ID,
      storagePath: CROSS_TENANT_PATH,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 1024,
      folder: "כללי",
      kind: "upload",
      userId: "user-1",
    });
    const verified = verifyStudentDocumentUploadTicket(token, "user-1", INST_A);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.error).toBe("path_institution_mismatch");
    }
  });
});

describe("TZ-139 size validation", () => {
  it("accepts a 20MB PDF and rejects 26MB before upload", () => {
    expect(fileExceedsUploadLimits({ size: 20 * 1024 * 1024 })).toBe(false);
    expect(fileExceedsUploadLimits({ size: MAX_UPLOAD_BYTES })).toBe(false);
    expect(fileExceedsUploadLimits({ size: MAX_UPLOAD_BYTES + 1 })).toBe(true);
    expect(needsDirectStorageUpload({ size: 20 * 1024 * 1024 })).toBe(true);
  });
});
