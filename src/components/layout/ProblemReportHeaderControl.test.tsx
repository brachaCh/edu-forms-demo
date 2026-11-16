/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/personal-area",
  loggedIn: true,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/components/layout/useSessionHome", () => ({
  useSessionHome: () => ({
    loggedIn: state.loggedIn,
    user: { email: "teacher@school.il" },
  }),
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => false,
}));

vi.mock("@/components/layout/ProblemReportButton", () => ({
  ProblemReportButton: () => (
    <button type="button">דיווח על תקלה</button>
  ),
}));

import { ProblemReportHeaderControl } from "./ProblemReportHeaderControl";

afterEach(() => {
  cleanup();
  state.pathname = "/personal-area";
  state.loggedIn = true;
});

describe("ProblemReportHeaderControl", () => {
  it("shows the button for a logged-in user on an in-app page", () => {
    render(<ProblemReportHeaderControl />);
    expect(
      screen.getByRole("button", { name: "דיווח על תקלה" })
    ).toBeTruthy();
  });

  it("hides the button on public /fill/[token] pages", () => {
    state.pathname = "/fill/secret-token";
    render(<ProblemReportHeaderControl />);
    expect(screen.queryByRole("button", { name: "דיווח על תקלה" })).toBeNull();
  });

  it("hides the button on public /sign/[token] pages", () => {
    state.pathname = "/sign/secret-token";
    render(<ProblemReportHeaderControl />);
    expect(screen.queryByRole("button", { name: "דיווח על תקלה" })).toBeNull();
  });

  it("hides the button for guests", () => {
    state.loggedIn = false;
    render(<ProblemReportHeaderControl />);
    expect(screen.queryByRole("button", { name: "דיווח על תקלה" })).toBeNull();
  });
});
