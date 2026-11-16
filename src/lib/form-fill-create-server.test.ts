import { describe, expect, it } from "vitest";
import { revokePendingFormFillRequestsForRecipients } from "./form-fill-create-server";

type UpdateCall = { table: string; column: string; value: unknown };

describe("revokePendingFormFillRequestsForRecipients", () => {
  it("targets given recipient emails on the same form fill", async () => {
    const updates: UpdateCall[] = [];
    const supabase = {
      from: (table: string) => ({
        update: () => ({
          eq: (column: string, value: unknown) => {
            updates.push({ table, column, value });
            return {
              eq: (nextColumn: string, nextValue: unknown) => {
                updates.push({ table, column: nextColumn, value: nextValue });
                return {
                  in: (inColumn: string, emails: string[]) => {
                    updates.push({ table, column: inColumn, value: emails });
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        }),
      }),
    };

    await revokePendingFormFillRequestsForRecipients(
      supabase as never,
      "fill-1",
      ["father@example.com", "mother@example.com"]
    );

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: "form_fill_id", value: "fill-1" }),
        expect.objectContaining({
          column: "recipient_email",
          value: ["father@example.com", "mother@example.com"],
        }),
      ])
    );
  });
});
