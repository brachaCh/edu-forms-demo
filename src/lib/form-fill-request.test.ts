import { beforeEach, describe, expect, it, vi } from "vitest";

const reportClientAudit = vi.fn();

vi.mock("@/lib/client-audit", () => ({
  reportClientAudit: (...args: unknown[]) => reportClientAudit(...args),
}));

import { createFormFillRequest } from "./form-fill-request";

describe("createFormFillRequest", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    reportClientAudit.mockReset();
  });

  it("posts to the authenticated Next.js route, not the Edge Function", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, sentTo: ["a@b.com"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFormFillRequest({
      formFillId: "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22",
      formId: "parent-questionnaire",
      formTitle: "שאלון הורים",
      studentName: "תלמיד",
      recipientEmail: "a@b.com",
    });

    expect(result).toEqual({ ok: true, sentTo: ["a@b.com"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/fill/create");
    expect(init.credentials).toBe("include");
    expect(reportClientAudit).toHaveBeenCalled();
  });

  it("maps an unauthenticated response to a login error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        json: async () => ({ ok: false, error: "UNAUTHORIZED" }),
      })
    );

    const result = await createFormFillRequest({
      formFillId: "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22",
      formId: "parent-questionnaire",
      formTitle: "שאלון הורים",
      studentName: "תלמיד",
      recipientEmail: "a@b.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/התחבר/);
    expect(reportClientAudit).not.toHaveBeenCalled();
  });
});
