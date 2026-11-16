import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendFormFillLink } from "./form-fill-create-server";

const sendFormFillLinkEmail = vi.fn();

vi.mock("@/lib/form-fill-otp-email", () => ({
  sendFormFillLinkEmail: (...args: unknown[]) => sendFormFillLinkEmail(...args),
}));

describe("sendFormFillLink recipient-scoped revoke", () => {
  beforeEach(() => {
    sendFormFillLinkEmail.mockReset();
    sendFormFillLinkEmail.mockResolvedValue({ sent: true });
  });

  it("scopes revoke updates to the same recipient email", async () => {
    const revokeFilters: string[] = [];
    const supabase = {
      from: () => ({
        insert: async () => ({ error: null }),
        update: () => ({
          eq: (column: string, value: string) => {
            revokeFilters.push(`${column}=${value}`);
            const chain = {
              eq: (nextColumn: string, nextValue: string) => {
                revokeFilters.push(`${nextColumn}=${nextValue}`);
                return chain;
              },
              neq: async () => ({ error: null }),
            };
            return chain;
          },
        }),
      }),
    };

    await sendFormFillLink({
      supabase: supabase as never,
      origin: "https://app.example",
      formFillId: "fill-1",
      formId: "parent-questionnaire",
      formTitle: "שאלון",
      studentName: "תלמידה",
      recipientEmail: "father@example.com",
    });

    expect(revokeFilters).toContain("recipient_email=father@example.com");
    expect(revokeFilters).not.toContain("recipient_email=mother@example.com");
  });
});
