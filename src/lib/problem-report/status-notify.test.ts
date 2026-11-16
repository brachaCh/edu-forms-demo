import { describe, expect, it, vi } from "vitest";
import { notifyProblemReportStatus } from "./status-notify";

describe("notifyProblemReportStatus", () => {
  it("emails the stored reporter from get_giti_bug_reporter", async () => {
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const fetchReporter = vi.fn().mockResolvedValue({
      ok: true,
      reporterEmail: "teacher@school.il",
    });
    const result = await notifyProblemReportStatus(
      { ticketId: "TZ-18", status: "fixed" },
      { fetchReporter, sendMail }
    );
    expect(result).toEqual({
      ok: true,
      ticketId: "TZ-18",
      statusLabel: "טופל",
    });
    expect(fetchReporter).toHaveBeenCalledWith(18);
    const payload = sendMail.mock.calls[0]?.[0] as {
      to: string[];
      text: string;
      subject: string;
    };
    expect(payload.to).toEqual(["teacher@school.il"]);
    expect(payload.subject).toContain("TZ-18");
    expect(payload.text).toContain("TZ-18");
    expect(payload.text).toContain("טופל");
  });

  it("returns 404 when no stored reporter email exists", async () => {
    const sendMail = vi.fn();
    const result = await notifyProblemReportStatus(
      { ticketId: "TZ-18", status: "open" },
      {
        fetchReporter: async () => ({ ok: false, reason: "not_found" }),
        sendMail,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 422 when the reporter lookup is unavailable", async () => {
    const sendMail = vi.fn();
    const result = await notifyProblemReportStatus(
      { ticketId: "TZ-18", status: "in_progress" },
      {
        fetchReporter: async () => ({ ok: false, reason: "read_failed" }),
        sendMail,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 422 when Tzavta is not configured", async () => {
    const sendMail = vi.fn();
    const result = await notifyProblemReportStatus(
      { ticketId: "TZ-18", status: "waiting" },
      {
        fetchReporter: async () => ({ ok: false, reason: "not_configured" }),
        sendMail,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
