import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const FILL_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const requireTenantSession = vi.fn();
const loadFormFillForSigning = vi.fn();
const loadStudentForInstitution = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const listSimpleSignSubmissions = vi.fn();
const loadInstitutionDisplayName = vi.fn();
const sendSimpleSignSigningEmail = vi.fn();
const replaceExpiredSubmission = vi.fn();
const markSubmissionRenewing = vi.fn();
const getDocumentInputs = vi.fn();
const createSimpleSignSubmission = vi.fn();
const createMultiSignerSubmission = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: (...args: unknown[]) => requireTenantSession(...args),
}));

const revertRenewingToExpired = vi.fn();
const revertAllRenewingToExpired = vi.fn();
const replaceExpiredSubmissionMultiSigner = vi.fn();
const isStaleRenewing = vi.fn();
const markAllSubmissionsRenewing = vi.fn();

vi.mock("@/lib/simplesign/server-store", () => ({
  loadFormFillForSigning: (...args: unknown[]) =>
    loadFormFillForSigning(...args),
  loadStudentForInstitution: (...args: unknown[]) =>
    loadStudentForInstitution(...args),
  listSimpleSignSubmissions: (...args: unknown[]) =>
    listSimpleSignSubmissions(...args),
  loadInstitutionDisplayName: (...args: unknown[]) =>
    loadInstitutionDisplayName(...args),
  replaceExpiredSubmission: (...args: unknown[]) =>
    replaceExpiredSubmission(...args),
  markSubmissionRenewing: (...args: unknown[]) =>
    markSubmissionRenewing(...args),
  markAllSubmissionsRenewing: (...args: unknown[]) =>
    markAllSubmissionsRenewing(...args),
  revertRenewingToExpired: (...args: unknown[]) =>
    revertRenewingToExpired(...args),
  revertAllRenewingToExpired: (...args: unknown[]) =>
    revertAllRenewingToExpired(...args),
  replaceExpiredSubmissionMultiSigner: (...args: unknown[]) =>
    replaceExpiredSubmissionMultiSigner(...args),
  isStaleRenewing: (...args: unknown[]) =>
    isStaleRenewing(...args),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  buildMemberAccessContext: vi.fn(() => ({ kind: "ctx" })),
  assertMemberCanAccessStudent: (...args: unknown[]) =>
    assertMemberCanAccessStudent(...args),
}));

vi.mock("@/lib/simplesign/signing-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/simplesign/signing-email")>();
  return {
    ...actual,
    resolveSchoolYearLabel: () => "תשפ״ו",
    sendSimpleSignSigningEmail: (...args: unknown[]) =>
      sendSimpleSignSigningEmail(...args),
  };
});

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
  return new Request("http://localhost/api/simplesign/resend-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pendingSubmission() {
  return {
    id: "sub-1",
    form_fill_id: FILL_ID,
    form_id: "waiver-confidentiality",
    student_id: STUDENT_ID,
    institution_id: INST_A,
    parent_role: "mother",
    signature_field_key: "mother_signature",
    submission_token: "pending-token-123",
    document_token: "doc-token-abc",
    status: "pending",
    signing_url: "https://simplesign.co.il/sign/pending",
    signer_email: "mom@example.com",
    signer_name: "דקלה",
    signer_slot: 2,
    signed_pdf_document_id: null,
    webhook_delivery_id: null,
    error_message: null,
    created_at: new Date().toISOString(),
    signed_at: null,
    requested_by_user_id: "user-1",
    requester_email: "staff@example.com",
    requester_notified_at: null,
    teacher_notified_at: null,
  };
}

function expiredSubmission() {
  return {
    ...pendingSubmission(),
    status: "expired",
    submission_token: "expired-token-456",
    signing_url: "https://simplesign.co.il/sign/expired",
  };
}

describe("POST /api/simplesign/resend-email", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...savedEnv };
    process.env.SIMPLESIGN_DOC_WAIVER_BASIC = "basic-token";
    process.env.SIMPLESIGN_API_KEY = "test-api-key";

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
      single_responsible_party: false,
    });
    assertMemberCanAccessStudent.mockResolvedValue(true);
    loadInstitutionDisplayName.mockResolvedValue("בית ספר בדיקה");
    sendSimpleSignSigningEmail.mockResolvedValue({ sent: true });
    isStaleRenewing.mockReturnValue(false);
    revertRenewingToExpired.mockResolvedValue(undefined);
    revertAllRenewingToExpired.mockResolvedValue(undefined);
    markAllSubmissionsRenewing.mockImplementation((_token, keys) => Promise.resolve(keys));
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("resends the same URL for a pending submission", async () => {
    listSimpleSignSubmissions.mockResolvedValue([pendingSubmission()]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(sendSimpleSignSigningEmail).toHaveBeenCalledTimes(1);
    expect(sendSimpleSignSigningEmail.mock.calls[0]?.[0]?.signingUrl).toBe(
      "https://simplesign.co.il/sign/pending"
    );
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
    expect(replaceExpiredSubmission).not.toHaveBeenCalled();
  });

  it("creates a new submission when the existing one is expired", async () => {
    listSimpleSignSubmissions.mockResolvedValue([expiredSubmission()]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: false,
      inputs: [{ api_key: "student_name" }],
    });
    createSimpleSignSubmission.mockResolvedValue({
      submissionToken: "new-token-789",
      signingUrl: "https://simplesign.co.il/sign/new",
      status: "pending",
    });
    replaceExpiredSubmission.mockResolvedValue({
      ...expiredSubmission(),
      submission_token: "new-token-789",
      signing_url: "https://simplesign.co.il/sign/new",
      status: "pending",
    });

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.renewed).toBe(true);

    expect(markSubmissionRenewing).toHaveBeenCalledWith(
      "expired-token-456",
      "mother_signature"
    );
    expect(createSimpleSignSubmission).toHaveBeenCalledTimes(1);
    expect(replaceExpiredSubmission).toHaveBeenCalledWith({
      oldSubmissionToken: "expired-token-456",
      newSubmissionToken: "new-token-789",
      newSigningUrl: "https://simplesign.co.il/sign/new",
      signatureFieldKey: "mother_signature",
    });

    expect(sendSimpleSignSigningEmail).toHaveBeenCalledTimes(1);
    expect(sendSimpleSignSigningEmail.mock.calls[0]?.[0]?.signingUrl).toBe(
      "https://simplesign.co.il/sign/new"
    );
  });

  it("returns 409 when no pending or expired submission exists", async () => {
    listSimpleSignSubmissions.mockResolvedValue([
      { ...pendingSubmission(), status: "signed" },
    ]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("אין שליחה ממתינה לשדה זה");
  });

  it("prefers pending over expired when both exist for the same field", async () => {
    listSimpleSignSubmissions.mockResolvedValue([
      expiredSubmission(),
      pendingSubmission(),
    ]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(200);
    expect(sendSimpleSignSigningEmail.mock.calls[0]?.[0]?.signingUrl).toBe(
      "https://simplesign.co.il/sign/pending"
    );
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
  });

  it("returns 500 when replaceExpiredSubmission returns null", async () => {
    listSimpleSignSubmissions.mockResolvedValue([expiredSubmission()]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: false,
      inputs: [{ api_key: "student_name" }],
    });
    createSimpleSignSubmission.mockResolvedValue({
      submissionToken: "new-token-789",
      signingUrl: "https://simplesign.co.il/sign/new",
      status: "pending",
    });
    replaceExpiredSubmission.mockResolvedValue(null);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("עדכון הקישור נכשל — נסו שוב");
    expect(sendSimpleSignSigningEmail).not.toHaveBeenCalled();
  });

  it("returns 409 when renewing is already in progress", async () => {
    listSimpleSignSubmissions.mockResolvedValue([expiredSubmission()]);
    markSubmissionRenewing.mockResolvedValue(false);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("הקישור כבר בתהליך חידוש או לא נמצא");
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
    expect(sendSimpleSignSigningEmail).not.toHaveBeenCalled();
  });

  it("handles multi-signer document with expired father submission correctly", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      parent_role: "father",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
    };
    const motherPending = {
      ...pendingSubmission(),
      signature_field_key: "mother_signature",
      parent_role: "mother",
      signer_slot: 2,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherPending]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: true,
      inputs: [{ api_key: "student_name", signer: 0 }],
    });
    createMultiSignerSubmission.mockResolvedValue({
      submissionToken: "new-multi-token",
      status: "pending",
      signers: [{ slot: 1, signingUrl: "https://simplesign.co.il/sign/new-father" }],
    });
    replaceExpiredSubmission.mockResolvedValue({
      ...fatherExpired,
      submission_token: "new-multi-token",
      signing_url: "https://simplesign.co.il/sign/new-father",
      status: "pending",
    });

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.renewed).toBe(true);

    expect(replaceExpiredSubmission).toHaveBeenCalledWith({
      oldSubmissionToken: "expired-token-456",
      newSubmissionToken: "new-multi-token",
      newSigningUrl: "https://simplesign.co.il/sign/new-father",
      signatureFieldKey: "father_signature",
    });
    expect(sendSimpleSignSigningEmail.mock.calls[0]?.[0]?.to).toBe("dad@example.com");
    expect(sendSimpleSignSigningEmail.mock.calls[0]?.[0]?.signingUrl).toBe(
      "https://simplesign.co.il/sign/new-father"
    );
  });

  it("treats stale renewing (>5 min) as expired", async () => {
    const staleRenewing = {
      ...pendingSubmission(),
      status: "renewing",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    };
    isStaleRenewing.mockImplementation((row) => row.status === "renewing");
    listSimpleSignSubmissions.mockResolvedValue([staleRenewing]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: false,
      inputs: [{ api_key: "student_name" }],
    });
    createSimpleSignSubmission.mockResolvedValue({
      submissionToken: "new-token",
      signingUrl: "https://simplesign.co.il/sign/new",
      status: "pending",
    });
    replaceExpiredSubmission.mockResolvedValue({
      ...staleRenewing,
      submission_token: "new-token",
      signing_url: "https://simplesign.co.il/sign/new",
      status: "pending",
    });

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.renewed).toBe(true);
  });

  it("reverts to expired when createNewSubmission throws", async () => {
    listSimpleSignSubmissions.mockResolvedValue([expiredSubmission()]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockRejectedValue(new Error("API error"));

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(500);
    expect(revertRenewingToExpired).toHaveBeenCalledWith(
      "expired-token-456",
      "mother_signature"
    );
  });

  it("returns 409 for active renewing row (not stale)", async () => {
    const activeRenewing = {
      ...pendingSubmission(),
      status: "renewing",
      created_at: new Date().toISOString(),
    };
    isStaleRenewing.mockReturnValue(false);
    listSimpleSignSubmissions.mockResolvedValue([activeRenewing]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("הקישור כבר בתהליך חידוש, נסו שוב בעוד דקה");
  });

  it("returns 409 for pending without URL when markRenewing fails", async () => {
    const pendingNoUrl = {
      ...pendingSubmission(),
      signing_url: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([pendingNoUrl]);
    markSubmissionRenewing.mockResolvedValue(false);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(409);
    expect(createSimpleSignSubmission).not.toHaveBeenCalled();
  });

  it("renews all signers when both father and mother are expired and neither signed", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      parent_role: "father",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      parent_role: "mother",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: true,
      inputs: [{ api_key: "student_name", signer: 0 }],
    });
    createMultiSignerSubmission.mockResolvedValue({
      submissionToken: "new-shared-token",
      status: "pending",
      signers: [
        { slot: 1, signingUrl: "https://simplesign.co.il/sign/father-new" },
        { slot: 2, signingUrl: "https://simplesign.co.il/sign/mother-new" },
      ],
    });
    replaceExpiredSubmissionMultiSigner.mockResolvedValue(2);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.allSignersRenewed).toBe(true);
    expect(replaceExpiredSubmissionMultiSigner).toHaveBeenCalledWith({
      oldSubmissionToken: "expired-token-456",
      newSubmissionToken: "new-shared-token",
      signerUpdates: expect.arrayContaining([
        expect.objectContaining({ signatureFieldKey: "father_signature" }),
        expect.objectContaining({ signatureFieldKey: "mother_signature" }),
      ]),
      lockedKeys: ["father_signature", "mother_signature"],
    });
    expect(sendSimpleSignSigningEmail).toHaveBeenCalledTimes(2);
  });

  it("reverts to expired when createNewSubmission returns error", async () => {
    listSimpleSignSubmissions.mockResolvedValue([expiredSubmission()]);
    markSubmissionRenewing.mockResolvedValue(true);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: false,
      inputs: [],
    });
    createSimpleSignSubmission.mockResolvedValue({
      submissionToken: "new-token",
      signingUrl: "https://simplesign.co.il/sign/new",
      status: "pending",
    });
    replaceExpiredSubmission.mockResolvedValue(null);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(500);
    expect(revertRenewingToExpired).toHaveBeenCalledWith(
      "expired-token-456",
      "mother_signature"
    );
    expect(sendSimpleSignSigningEmail).not.toHaveBeenCalled();
  });

  it("reverts all signers when multi-signer renewal fails", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markAllSubmissionsRenewing.mockResolvedValue(["father_signature", "mother_signature"]);
    getDocumentInputs.mockRejectedValue(new Error("SimpleSign API error"));

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(500);
    expect(revertAllRenewingToExpired).toHaveBeenCalledWith(
      "expired-token-456",
      ["father_signature", "mother_signature"]
    );
  });

  it("reverts all signers when partial update occurs", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markAllSubmissionsRenewing.mockResolvedValue(["father_signature", "mother_signature"]);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: true,
      inputs: [{ api_key: "student_name", signer: 0 }],
    });
    createMultiSignerSubmission.mockResolvedValue({
      submissionToken: "new-shared-token",
      status: "pending",
      signers: [
        { slot: 1, signingUrl: "https://simplesign.co.il/sign/father-new" },
        { slot: 2, signingUrl: "https://simplesign.co.il/sign/mother-new" },
      ],
    });
    replaceExpiredSubmissionMultiSigner.mockResolvedValue(1);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("עדכון הקישורים נכשל — נסו שוב");
    expect(revertAllRenewingToExpired).toHaveBeenCalledWith(
      "expired-token-456",
      ["father_signature", "mother_signature"]
    );
    expect(sendSimpleSignSigningEmail).not.toHaveBeenCalled();
  });

  it("reports error when some emails fail to send", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markAllSubmissionsRenewing.mockResolvedValue(["father_signature", "mother_signature"]);
    getDocumentInputs.mockResolvedValue({
      ready: true,
      multi_signer: true,
      inputs: [{ api_key: "student_name", signer: 0 }],
    });
    createMultiSignerSubmission.mockResolvedValue({
      submissionToken: "new-shared-token",
      status: "pending",
      signers: [
        { slot: 1, signingUrl: "https://simplesign.co.il/sign/father-new" },
        { slot: 2, signingUrl: "https://simplesign.co.il/sign/mother-new" },
      ],
    });
    replaceExpiredSubmissionMultiSigner.mockResolvedValue(2);
    sendSimpleSignSigningEmail
      .mockResolvedValueOnce({ sent: true })
      .mockResolvedValueOnce({
        sent: false,
        status: 422,
        detail: 'Invalid `to` field. Invalid email address',
      });

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.renewed).toBe(true);
    expect(json.allSignersRenewed).toBe(true);
    expect(json.emailFailures).toBe(1);
    expect(json.error).toBe("הקישורים חודשו אך שליחת המיילים נכשלה: כתובת המייל לא תקינה — יש לעדכן אותה בכרטיס התלמידה");
  });

  it("returns 502 without exposing env var names when single-signer email send fails", async () => {
    listSimpleSignSubmissions.mockResolvedValue([pendingSubmission()]);
    sendSimpleSignSigningEmail.mockResolvedValue({
      sent: false,
      status: 503,
      detail: "missing_api_key",
    });

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "mother_signature",
      })
    );

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("שגיאה בהגדרות השרת — פנו לתמיכה");
    expect(json.error).not.toMatch(/RESEND/i);
    expect(json.error).not.toMatch(/missing_api_key/i);
  });

  it("returns 409 when no signers can be marked renewing", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markAllSubmissionsRenewing.mockResolvedValue([]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("הקישורים כבר בתהליך חידוש או לא נמצאו");
    expect(createMultiSignerSubmission).not.toHaveBeenCalled();
  });

  it("returns 409 and reverts when only some signers can be locked", async () => {
    const fatherExpired = {
      ...expiredSubmission(),
      signature_field_key: "father_signature",
      signer_slot: 1,
      signer_email: "dad@example.com",
      signer_name: "אבא",
      signed_at: null,
    };
    const motherExpired = {
      ...expiredSubmission(),
      signature_field_key: "mother_signature",
      signer_slot: 2,
      signer_email: "mom@example.com",
      signer_name: "אמא",
      signed_at: null,
    };
    listSimpleSignSubmissions.mockResolvedValue([fatherExpired, motherExpired]);
    markAllSubmissionsRenewing.mockResolvedValue(["father_signature"]);

    const response = await POST(
      jsonRequest({
        formFillId: FILL_ID,
        signatureFieldKey: "father_signature",
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("חידוש כבר מתבצע עבור חלק מהחותמים");
    expect(createMultiSignerSubmission).not.toHaveBeenCalled();
    expect(revertAllRenewingToExpired).toHaveBeenCalledWith(
      "expired-token-456",
      ["father_signature"]
    );
  });
});
