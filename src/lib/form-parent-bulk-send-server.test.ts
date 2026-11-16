import { beforeEach, describe, expect, it, vi } from "vitest";
import { runParentFormBulkSend } from "./form-parent-bulk-send-server";

const sendFormFillLink = vi.fn();
const revokePendingFormFillRequestsForRecipients = vi.fn();
const runSimpleSignCreateSubmissions = vi.fn();
const sendSignatureRequests = vi.fn();
const fetchStudentParentFormSendStatuses = vi.fn();
const tenantFetchStudentFormFills = vi.fn();
const tenantUpsertStudentFormFill = vi.fn();

vi.mock("@/lib/form-fill-create-server", () => ({
  resolveParentFacingOrigin: () => "https://app.example",
  sendFormFillLink: (...args: unknown[]) => sendFormFillLink(...args),
  revokePendingFormFillRequestsForRecipients: (...args: unknown[]) =>
    revokePendingFormFillRequestsForRecipients(...args),
}));

vi.mock("@/lib/simplesign/create-submissions-server", () => ({
  runSimpleSignCreateSubmissions: (...args: unknown[]) =>
    runSimpleSignCreateSubmissions(...args),
}));

vi.mock("@/lib/form-signature-create-server", () => ({
  sendSignatureRequests: (...args: unknown[]) => sendSignatureRequests(...args),
}));

vi.mock("@/lib/form-parent-send-status-server", () => ({
  fetchStudentParentFormSendStatuses: (...args: unknown[]) =>
    fetchStudentParentFormSendStatuses(...args),
}));

vi.mock("@/lib/server-tenant-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server-tenant-data")>();
  return {
    ...actual,
    tenantFetchStudentFormFills: (...args: unknown[]) =>
      tenantFetchStudentFormFills(...args),
    tenantUpsertStudentFormFill: (...args: unknown[]) =>
      tenantUpsertStudentFormFill(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "students") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    id: "s1",
                    institution_id: "inst-1",
                    category: "student",
                    full_name: "תלמידה",
                    father_name: "אב",
                    mother_name: "אם",
                    father_email: "dad@example.com",
                    mother_email: "mom@example.com",
                    email: null,
                    phone: null,
                    status: null,
                    class_name: null,
                    teacher_name: null,
                    notes: null,
                    single_responsible_party: false,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("runParentFormBulkSend fill forms", () => {
  beforeEach(() => {
    sendFormFillLink.mockReset();
    revokePendingFormFillRequestsForRecipients.mockReset();
    fetchStudentParentFormSendStatuses.mockResolvedValue([
      {
        studentId: "s1",
        formFillId: "fill-1",
        fillStatus: "draft",
        lastSentAt: null,
        filled: false,
      },
    ]);
    tenantFetchStudentFormFills.mockResolvedValue([
      {
        id: "fill-1",
        student_id: "s1",
        form_id: "parent-questionnaire",
        data: {},
        status: "draft",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    tenantUpsertStudentFormFill.mockImplementation(
      async (_inst: string, row: { id?: string }) => ({
        ...row,
        id: row.id ?? "fill-1",
        data: {},
        status: "draft",
      })
    );
  });

  it("keeps both parent links valid and rolls back partial sends", async () => {
    sendFormFillLink
      .mockResolvedValueOnce({ ok: true, sentTo: ["dad@example.com"] })
      .mockResolvedValueOnce({ ok: false, error: "מייל נכשל" });

    const result = await runParentFormBulkSend({
      institutionId: "inst-1",
      actorUserId: "user-1",
      requesterEmail: "staff@example.com",
      formId: "parent-questionnaire",
      studentIds: ["s1"],
      skipAlreadySent: true,
      skipAlreadyFilled: true,
      ctx: { mode: "institution", institutionId: "inst-1" } as never,
    });

    expect(sendFormFillLink).toHaveBeenCalledTimes(2);
    expect(revokePendingFormFillRequestsForRecipients).toHaveBeenCalledWith(
      expect.anything(),
      "fill-1",
      ["dad@example.com"]
    );
    expect(result.sent).toEqual([]);
    expect(result.failed).toHaveLength(1);
  });
});

describe("runParentFormBulkSend waiver", () => {
  beforeEach(() => {
    runSimpleSignCreateSubmissions.mockReset();
    sendSignatureRequests.mockReset();
    fetchStudentParentFormSendStatuses.mockResolvedValue([
      {
        studentId: "s1",
        formFillId: "fill-1",
        fillStatus: "draft",
        lastSentAt: null,
        filled: false,
      },
    ]);
    tenantFetchStudentFormFills.mockResolvedValue([
      {
        id: "fill-1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {},
        status: "draft",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    tenantUpsertStudentFormFill.mockResolvedValue({
      id: "fill-1",
      data: {},
      status: "awaiting_parent_signature",
    });
  });

  it("uses SimpleSign instead of Matoah signature requests", async () => {
    runSimpleSignCreateSubmissions.mockResolvedValue({
      ok: true,
      count: 2,
      emailsSent: 2,
    });

    const result = await runParentFormBulkSend({
      institutionId: "inst-1",
      actorUserId: "user-1",
      requesterEmail: "staff@example.com",
      formId: "waiver-confidentiality",
      studentIds: ["s1"],
      skipAlreadySent: false,
      skipAlreadyFilled: false,
      ctx: { mode: "institution", institutionId: "inst-1" } as never,
    });

    expect(runSimpleSignCreateSubmissions).toHaveBeenCalled();
    expect(sendSignatureRequests).not.toHaveBeenCalled();
    expect(result.sent).toEqual(["s1"]);
  });
});
