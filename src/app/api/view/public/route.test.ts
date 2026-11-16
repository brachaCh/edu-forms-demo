import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "A".repeat(48);

const fromMock = vi.fn();

vi.mock("@/lib/form-fill-otp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/form-fill-otp")>();
  return {
    ...actual,
    hashFormFillToken: vi.fn(async () => "hash"),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}));

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/view/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function selectQuery(data: unknown) {
  const q: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data, error: null });
  return q;
}

describe("POST /api/view/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for an unknown token", async () => {
    fromMock.mockReturnValue(selectQuery(null));

    const response = await POST(jsonRequest({ action: "get", token: TOKEN }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "הקישור אינו תקין או פג תוקף",
    });
  });

  it("returns 410 when the link is expired", async () => {
    const q = selectQuery({
      id: "req-1",
      form_title: "מערכת שעות",
      student_name: "נועה",
      snapshot_html: "<p>x</p>",
      expires_at: new Date(Date.now() - 1000).toISOString(),
      status: "pending",
    });
    fromMock.mockReturnValue(q);

    const response = await POST(jsonRequest({ action: "get", token: TOKEN }));
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      ok: false,
      error: "פג תוקף הקישור",
    });
  });

  it("returns snapshot html for a valid pending token", async () => {
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const q = selectQuery({
      id: "req-1",
      form_title: "מערכת שעות",
      student_name: "נועה",
      snapshot_html: "<p>טופס</p>",
      expires_at: expires,
      status: "pending",
    });
    fromMock.mockReturnValue(q);

    const response = await POST(jsonRequest({ action: "get", token: TOKEN }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.request).toMatchObject({
      formTitle: "מערכת שעות",
      studentName: "נועה",
      snapshotHtml: "<p>טופס</p>",
    });
  });
});
