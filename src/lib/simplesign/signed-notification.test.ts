import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSubmissionsByToken: vi.fn(),
  claimRequesterNotification: vi.fn(),
  claimTeacherNotification: vi.fn(),
  clearRequesterNotificationClaim: vi.fn(),
  clearTeacherNotificationClaim: vi.fn(),
  loadStudentForInstitution: vi.fn(),
  loadInstitutionDisplayName: vi.fn(),
  loadUserProfileContact: vi.fn(),
  findStaffCardForTeacherName: vi.fn(),
  sendSimpleSignSignedNotificationEmail: vi.fn(),
}));

const {
  findSubmissionsByToken,
  claimRequesterNotification,
  claimTeacherNotification,
  clearRequesterNotificationClaim,
  clearTeacherNotificationClaim,
  loadStudentForInstitution,
  loadInstitutionDisplayName,
  loadUserProfileContact,
  findStaffCardForTeacherName,
  sendSimpleSignSignedNotificationEmail,
} = mocks;

vi.mock("@/lib/simplesign/server-store", () => ({
  findSubmissionsByToken: mocks.findSubmissionsByToken,
  claimRequesterNotification: mocks.claimRequesterNotification,
  claimTeacherNotification: mocks.claimTeacherNotification,
  clearRequesterNotificationClaim: mocks.clearRequesterNotificationClaim,
  clearTeacherNotificationClaim: mocks.clearTeacherNotificationClaim,
  loadStudentForInstitution: mocks.loadStudentForInstitution,
  loadInstitutionDisplayName: mocks.loadInstitutionDisplayName,
  loadUserProfileContact: mocks.loadUserProfileContact,
  findStaffCardForTeacherName: mocks.findStaffCardForTeacherName,
}));

vi.mock("@/lib/simplesign/signing-email", () => ({
  sendSimpleSignSignedNotificationEmail: mocks.sendSimpleSignSignedNotificationEmail,
}));

vi.mock("@/lib/form-schemas", () => ({
  getFormSchema: () => ({ title: "טופס בדיקה" }),
  studentPortfolioFillHref: () => "/students/s1/forms/f1",
}));

vi.mock("@/lib/app-origin", () => ({
  appOrigin: () => "https://app.test",
}));

import { notifyRequesterDocumentSigned } from "@/lib/simplesign/signed-notification";

const baseRow = {
  id: "sub-1",
  form_fill_id: "fill-1",
  form_id: "waiver",
  student_id: "student-1",
  institution_id: "inst-1",
  parent_role: "father",
  signature_field_key: "sig",
  submission_token: "tok-abc",
  document_token: "doc",
  signer_slot: null,
  status: "signed",
  signing_url: null,
  signer_email: "parent@example.com",
  signer_name: "הורה",
  signed_pdf_document_id: null,
  webhook_delivery_id: null,
  error_message: null,
  created_at: "2026-01-01T00:00:00Z",
  signed_at: "2026-01-02T00:00:00Z",
  requested_by_user_id: "user-requester",
  requester_email: null,
  requester_notified_at: null,
  teacher_notified_at: null,
};

describe("notifyRequesterDocumentSigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findSubmissionsByToken.mockResolvedValue([baseRow]);
    claimRequesterNotification.mockResolvedValue(true);
    claimTeacherNotification.mockResolvedValue(true);
    sendSimpleSignSignedNotificationEmail.mockResolvedValue({ sent: true });
    loadInstitutionDisplayName.mockResolvedValue("בית ספר");
    loadStudentForInstitution.mockResolvedValue({
      id: "student-1",
      institution_id: "inst-1",
      full_name: "נועה כהן",
      teacher_name: "רותי לוי",
      father_name: null,
      mother_name: null,
      email: null,
      calendar_year: 5786,
    });
    loadUserProfileContact.mockImplementation(async (userId: string) => {
      if (userId === "user-requester") {
        return { email: "requester@example.com", fullName: "שולח" };
      }
      if (userId === "user-teacher") {
        return { email: "teacher@example.com", fullName: "רותי לוי" };
      }
      return null;
    });
    findStaffCardForTeacherName.mockResolvedValue({
      id: "staff-1",
      full_name: "רותי לוי",
      user_profile_id: "user-teacher",
    });
  });

  it("sends requester and responsible-teacher notifications", async () => {
    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(2);
    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "requester@example.com",
        recipientRole: "requester",
      })
    );
    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "teacher@example.com",
        recipientRole: "teacher",
        recipientName: "רותי לוי",
      })
    );
    expect(findStaffCardForTeacherName).toHaveBeenCalledWith("inst-1", "רותי לוי");
    expect(loadStudentForInstitution).toHaveBeenCalledTimes(1);
  });

  it("uses unchanged requester idempotency role and teacher-specific role", async () => {
    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRole: "requester" })
    );
    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRole: "teacher" })
    );
  });

  it("sends only one round of emails when invoked again after claims", async () => {
    findSubmissionsByToken
      .mockResolvedValueOnce([baseRow])
      .mockResolvedValueOnce([
        {
          ...baseRow,
          requester_notified_at: "2026-01-03T00:00:00Z",
          teacher_notified_at: "2026-01-03T00:00:00Z",
        },
      ]);

    await notifyRequesterDocumentSigned("tok-abc");
    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(2);
    expect(claimRequesterNotification).toHaveBeenCalledTimes(1);
    expect(claimTeacherNotification).toHaveBeenCalledTimes(1);
  });

  it("skips teacher when they are the requester (same user id)", async () => {
    findStaffCardForTeacherName.mockResolvedValue({
      id: "staff-1",
      full_name: "רותי לוי",
      user_profile_id: "user-requester",
    });
    loadUserProfileContact.mockImplementation(async (userId: string) => {
      if (userId === "user-requester") {
        return { email: "same@example.com", fullName: "רותי" };
      }
      return null;
    });

    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(1);
    expect(claimTeacherNotification).not.toHaveBeenCalled();
  });

  it("skips teacher when email matches requester snapshot", async () => {
    findSubmissionsByToken.mockResolvedValue([
      {
        ...baseRow,
        requested_by_user_id: null,
        requester_email: "teacher@example.com",
      },
    ]);

    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(1);
    expect(claimTeacherNotification).not.toHaveBeenCalled();
  });

  it("skips teacher when profile has no email", async () => {
    loadUserProfileContact.mockImplementation(async (userId: string) => {
      if (userId === "user-requester") {
        return { email: "requester@example.com", fullName: "שולח" };
      }
      if (userId === "user-teacher") {
        return { email: null, fullName: "רותי לוי" };
      }
      return null;
    });

    await notifyRequesterDocumentSigned("tok-abc");

    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(1);
    expect(claimTeacherNotification).not.toHaveBeenCalled();
  });

  it("does not notify teacher again when already marked", async () => {
    findSubmissionsByToken.mockResolvedValue([
      { ...baseRow, teacher_notified_at: "2026-01-03T00:00:00Z" },
    ]);

    await notifyRequesterDocumentSigned("tok-abc");

    expect(claimTeacherNotification).not.toHaveBeenCalled();
    expect(sendSimpleSignSignedNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("clears teacher claim when email send fails", async () => {
    sendSimpleSignSignedNotificationEmail
      .mockResolvedValueOnce({ sent: true })
      .mockResolvedValueOnce({ sent: false, detail: "fail" });

    await notifyRequesterDocumentSigned("tok-abc");

    expect(clearTeacherNotificationClaim).toHaveBeenCalledWith("tok-abc");
  });
});
