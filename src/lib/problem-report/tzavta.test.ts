import { describe, expect, it, vi } from "vitest";
import { PROBLEM_REPORT_DESCRIPTION_MAX } from "./constants";
import { createTzavtaBug, fetchGitiBugReporter } from "./tzavta";

const input = {
  description: "השמירה נכשלה",
  reporterEmail: "teacher@school.il",
  pagePath: "/personal-area",
  browser: "Mozilla/5.0",
};

describe("createTzavtaBug", () => {
  it("returns not_configured without a client", async () => {
    await expect(createTzavtaBug(input, null)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("uses the RPC bug_id to derive ticket id (legacy string format)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: "bug-2610210847-21", error: null }),
      from: vi.fn().mockReturnValue({ upsert }),
    };
    await expect(createTzavtaBug(input, client as never)).resolves.toEqual({
      ok: true,
      ticketId: "TZ-21",
      bugId: "bug-2610210847-21",
    });
    expect(client.rpc).toHaveBeenCalledWith("create_giti_bug_report", {
      p_description: "השמירה נכשלה",
      p_reporter_email: "teacher@school.il",
      p_page_path: "/personal-area",
      p_browser: "Mozilla/5.0",
    });
    expect(client.from).toHaveBeenCalledWith("bug_reporter_contacts");
  });

  it("upserts full contacts description after RPC when provided", async () => {
    const order: string[] = [];
    const truncated = "תיאור:\nא…(המשך בפרטי הדיווח)";
    const fullBody = "א".repeat(PROBLEM_REPORT_DESCRIPTION_MAX);
    const fullContacts =
      "שם: שרה\nמייל: teacher@school.il\n\nתיאור:\n" + fullBody;
    const upsert = vi.fn().mockImplementation(async () => {
      order.push("upsert");
      return { error: null };
    });
    const client = {
      rpc: vi.fn().mockImplementation(async () => {
        order.push("rpc");
        return {
          data: { ticket_id: "TZ-77", bug_id: "bug-2610211250-77", bug_number: 77 },
          error: null,
        };
      }),
      from: vi.fn().mockReturnValue({ upsert }),
    };
    await createTzavtaBug(
      {
        ...input,
        description: truncated,
        contactsDescription: fullContacts,
      },
      client as never
    );
    expect(order).toEqual(["rpc", "upsert"]);
    expect(client.rpc).toHaveBeenCalledWith("create_giti_bug_report", {
      p_description: truncated,
      p_reporter_email: "teacher@school.il",
      p_page_path: "/personal-area",
      p_browser: "Mozilla/5.0",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        bug_id: "bug-2610211250-77",
        description: fullContacts,
      }),
      { onConflict: "bug_id" }
    );
  });

  it("parses new jsonb format with ticket_id and bug_id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { ticket_id: "TZ-42", bug_id: "bug-2610211250-42", bug_number: 42 },
        error: null,
      }),
      from: vi.fn().mockReturnValue({ upsert }),
    };
    await expect(createTzavtaBug(input, client as never)).resolves.toEqual({
      ok: true,
      ticketId: "TZ-42",
      bugId: "bug-2610211250-42",
    });
    expect(client.from).toHaveBeenCalledWith("bug_reporter_contacts");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        bug_id: "bug-2610211250-42",
        email: "teacher@school.il",
        description: "השמירה נכשלה",
      }),
      { onConflict: "bug_id" }
    );
  });

  it("accepts legacy 'TZ-n' string with null bugId", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: "TZ-99", error: null }),
      from: vi.fn(),
    };
    await expect(createTzavtaBug(input, client as never)).resolves.toEqual({
      ok: true,
      ticketId: "TZ-99",
      bugId: null,
    });
  });

  it("does not insert into bugs when the RPC fails", async () => {
    const from = vi.fn();
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: "Could not find the function public.create_giti_bug_report",
        },
      }),
      from,
    };
    await expect(createTzavtaBug(input, client as never)).resolves.toEqual({
      ok: false,
      reason: "insert_failed",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("fetchGitiBugReporter", () => {
  it("returns not_configured without a client", async () => {
    await expect(fetchGitiBugReporter(18, null)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("returns the stored email from get_giti_bug_reporter", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: "  Teacher@School.IL ",
        error: null,
      }),
      from: vi.fn(),
    };
    await expect(fetchGitiBugReporter(18, client as never)).resolves.toEqual({
      ok: true,
      reporterEmail: "teacher@school.il",
    });
    expect(client.rpc).toHaveBeenCalledWith("get_giti_bug_reporter", {
      p_bug_number: 18,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns not_found when the RPC has no email", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: vi.fn(),
    };
    await expect(fetchGitiBugReporter(18, client as never)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns read_failed when the RPC errors", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission denied" },
      }),
      from: vi.fn(),
    };
    await expect(fetchGitiBugReporter(18, client as never)).resolves.toEqual({
      ok: false,
      reason: "read_failed",
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
