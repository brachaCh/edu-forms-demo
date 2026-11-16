/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_TEXTS } from "@/lib/site-text";
import { getTextByPath } from "@/lib/get-text-by-path";
import { removeSubscriptionConfirmMessage } from "@/lib/platform-subscription-admin";

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => (
    <span>{getTextByPath(DEFAULT_SITE_TEXTS, path)}</span>
  ),
}));

import { PlatformAdminSubscriptions } from "./PlatformAdminSubscriptions";

const noneRow = {
  institutionId: "inst-none",
  institutionName: "  ",
  schoolName: null,
  institutionCode: "",
  institutionType: "schools",
  planId: "plan-1",
  planTitle: "פרוטוקול עד 60 תיקים",
  educationFramework: "regular" as const,
  planCustomClasses: null,
  planCustomStudents: null,
  subscriptionStatus: "none",
  paymentMethod: null,
  paidAt: null,
  planExpiresAt: null,
  userFullName: "מורה דמו",
  userEmail: "demo@example.com",
  userPhone: null,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PlatformAdminSubscriptions remove", () => {
  const confirmSpy = vi.fn<(message?: string) => boolean>(() => true);

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    confirmSpy.mockReset();
    confirmSpy.mockReturnValue(true);
  });

  beforeEach(() => {
    vi.stubGlobal("confirm", confirmSpy);
  });

  it("confirms with a fallback name and shows a Hebrew error when remove fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/subscriptions") && !url.includes("inst-")) {
        return jsonResponse({
          subscriptions: [noneRow],
          plans: [],
        });
      }
      return jsonResponse({ error: "UPDATE_FAILED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAdminSubscriptions />);

    const removeButton = await screen.findByRole("button", { name: "הסר מנוי" });
    fireEvent.click(removeButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      removeSubscriptionConfirmMessage("מורה דמו")
    );
    expect(confirmSpy.mock.calls[0]?.[0]).not.toMatch(/של\s{2,}/);

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent
      ).toBe("לא ניתן להשלים את הפעולה. נסו שוב.");
    });
    expect(screen.getByText("פרוטוקול עד 60 תיקים")).toBeTruthy();
    expect(screen.getAllByText("ללא מנוי").length).toBeGreaterThan(0);
  });

  it("clears leftover plan fields on a none-status row after confirm", async () => {
    let removed = false;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        removed = true;
        return jsonResponse({ ok: true, subscriptionStatus: "none" });
      }
      return jsonResponse({
        subscriptions: [
          removed
            ? { ...noneRow, planId: null, planTitle: null }
            : noneRow,
        ],
        plans: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAdminSubscriptions />);

    const removeButton = await screen.findByRole("button", { name: "הסר מנוי" });
    expect(screen.getByText("פרוטוקול עד 60 תיקים")).toBeTruthy();
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/המנוי הוסר/);
    });
    expect(screen.queryByText("פרוטוקול עד 60 תיקים")).toBeNull();
    expect(screen.getAllByText("ללא מנוי").length).toBeGreaterThan(0);

    const patchCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "PATCH"
    );
    expect(patchCall?.[0]).toBe("/api/platform/subscriptions/inst-none");
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
      action: "remove",
    });
  });
});
