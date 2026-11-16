import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SINGLE_PARENT_WAIVER_TEMPLATE_ERROR } from "@/lib/simplesign/signer-plan";

const INST_A = "11111111-1111-1111-1111-111111111111";
const FILL_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const requireTenantSession = vi.fn();
const loadFormFillForSigning = vi.fn();
const loadStudentForInstitution = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const listSimpleSignSubmissions = vi.fn();
const getDocumentInputs = vi.fn();
const createSimpleSignSubmission = vi.fn();
const createMultiSignerSubmission = vi.fn();
const insertAuditLog = vi.fn();
const insertSimpleSignSubmission = vi.fn();
const loadInstitutionDisplayName = vi.fn();
const sendSimpleSignSigningEmail = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: (...args: unknown[]) => requireTenantSession(...args),
}));

vi.mock("@/lib/simplesign/server-store", () => ({
  loadFormFillForSigning: (...args: unknown[]) =>
    loadFormFillForSigning(...args),
  loadStudentForInstitution: (...args: unknown[]) =>
    loadStudentForInstitution(...args),
  listSimpleSignSubmissions: (...args: unknown[]) =>
    listSimpleSignSubmissions(...args),
  insertSimpleSignSubmission: (...args: unknown[]) =>
    insertSimpleSignSubmission(...args),
  loadInstitutionDisplayName: (...args: unknown[]) =>
    loadInstitutionDisplayName(...args),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  buildMemberAccessContext: vi.fn(() => ({ kind: "ctx" })),
  assertMemberCanAccessStudent: (...args: unknown[]) =>
    assertMemberCanAccessStudent(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

vi.mock("@/lib/simplesign/signing-email", () => ({
  resolveSchoolYearLabel: () => "תשפ״ו",
  sendSimpleSignSigningEmail: (...args: unknown[]) =>
    sendSimpleSignSigningEmail(...args),
}));

vi.mock("@/lib/simplesign/client", () => ({
  getDocumentInputs: (...args: unknown[]) => getDocumentInputs(...args),
  createSimpleSignSubmission: (...args: unknown[]) =>
    createSimpleSignSubmission(...args),
  createMultiSignerSubmission: (...args: unknown[]) =>
    createMultiSignerSubmission(...args),
  isMultiSignerDocument: (payload: Record<string, unknown>) =>
    payload.multi_signer === true,
  SimpleSignApiError: class SimpleSignApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { POST } from "./route";

function session(institutionId = INST_A) {
  return {
    userId: "user-1",
    institutionId,
    profile: { id: "user-1", email: "staff@example.com", institution_id: institutionId },
    membershipRole: "owner" as const,
    hasMultipleInstitutions: false,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/simplesign/create-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    formFillId: FILL_ID,
    assignments: [
      {
        email: "mom@example.com",
        fieldKey: "mother_signature",
        signerName: "דקלה",
      },
    ],
  };
}

describe("POST /api/simplesign/create-submissions — single-parent template", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...savedEnv };
    process.env.SIMPLESIGN_DOC_WAIVER_BASIC = "basic-token";
    delete process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT;

    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(),
    });
    loadFormFillForSigning.mockResolvedValue({
      id: FILL_ID,
      student_id: STUDENT_ID,
      form_id: "waiver-confidentiality",
      data: {},
      status: "draft",
    });
    loadStudentForInstitution.mockResolvedValue({
      id: STUDENT_ID,
      institution_id: INST_A,
      full_name: "תלמידה בדיקה",
      single_responsible_party: true,
    });
    assertMemberCanAccessStudent.mockResolvedValue(true);
    listSimpleSignSubmissions.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns a Hebrew error and does not call SimpleSign when the single-parent env is unset", async () => {
    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: SINGLE_PARENT_WAIVER_TEMPLATE_ERROR,
    });
    expect(getDocumentInputs).not.toHaveBeenCalled();
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
    expect(createMultiSignerSubmission).not.toHaveBeenCalled();
  });

  it("returns the same Hebrew error when the dedicated template is multi_signer, without creating a submission", async () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: true,
      inputs: [{ api_key: "student_name" }],
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: SINGLE_PARENT_WAIVER_TEMPLATE_ERROR,
    });
    expect(getDocumentInputs).toHaveBeenCalledWith("single-parent-token");
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
    expect(createMultiSignerSubmission).not.toHaveBeenCalled();
  });
});
