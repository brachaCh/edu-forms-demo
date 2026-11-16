import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyProblemReportStatus = vi.fn();

vi.mock("@/lib/problem-report/status-notify", () => ({
  notifyProblemReportStatus: (...args: unknown[]) =>
    notifyProblemReportStatus(...args),
}));

import { POST } from "./route";

function jsonRequest(body: unknown, secret = "expected-secret") {
  return new Request("http://localhost/api/problem-report/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/problem-report/status", () => {
  const prev = process.env.TZAVTA_STATUS_WEBHOOK_SECRET;

  beforeEach(() => {
    notifyProblemReportStatus.mockReset();
    process.env.TZAVTA_STATUS_WEBHOOK_SECRET = "expected-secret";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.TZAVTA_STATUS_WEBHOOK_SECRET;
    else process.env.TZAVTA_STATUS_WEBHOOK_SECRET = prev;
    vi.restoreAllMocks();
  });

  it("rejects a missing or wrong secret", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      jsonRequest({ ticketId: "TZ-1", status: "open" }, "wrong")
    );
    expect(response.status).toBe(401);
    expect(notifyProblemReportStatus).not.toHaveBeenCalled();
  });

  it("notifies with a normalized ticket id and official status", async () => {
    notifyProblemReportStatus.mockResolvedValue({
      ok: true,
      ticketId: "TZ-18",
      statusLabel: "טופל",
    });
    const response = await POST(
      jsonRequest({ ticketId: "TZ-18", status: "fixed" })
    );
    expect(response.status).toBe(200);
    expect(notifyProblemReportStatus).toHaveBeenCalledWith({
      ticketId: "TZ-18",
      status: "fixed",
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ticketId: "TZ-18",
      statusLabel: "טופל",
    });
  });

  it("rejects unofficial statuses", async () => {
    const response = await POST(
      jsonRequest({ ticketId: "TZ-18", status: "resolved" })
    );
    expect(response.status).toBe(400);
    expect(notifyProblemReportStatus).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied reporterEmail", async () => {
    const response = await POST(
      jsonRequest({
        ticketId: "TZ-18",
        status: "fixed",
        reporterEmail: "spoof@school.il",
      })
    );
    expect(response.status).toBe(400);
    expect(notifyProblemReportStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the stored reporter is missing", async () => {
    notifyProblemReportStatus.mockResolvedValue({
      ok: false,
      status: 404,
      error: "הפנייה לא נמצאה",
    });
    const response = await POST(
      jsonRequest({ ticketId: "TZ-18", status: "closed" })
    );
    expect(response.status).toBe(404);
  });
});
