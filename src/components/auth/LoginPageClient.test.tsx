/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRegistrationStep1 = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => <span>{path}</span>,
}));

vi.mock("@/lib/mock-store", () => ({
  getRegistrationStep1: () => getRegistrationStep1(),
}));

vi.mock("@/components/forms/LoginForm", () => ({
  LoginForm: () => <div>login-form</div>,
}));

import { LoginPageClient } from "./LoginPageClient";

describe("LoginPageClient TZ-116 register CTA", () => {
  beforeEach(() => {
    getRegistrationStep1.mockReturnValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a prominent register link to /register without changing the target", async () => {
    render(<LoginPageClient />);

    await waitFor(() => {
      expect(screen.getByText("login-form")).toBeTruthy();
    });

    const registerLink = screen.getByRole("link", {
      name: "auth.registerLink",
    });
    expect(registerLink.getAttribute("href")).toBe("/register");
    expect(registerLink.getAttribute("aria-describedby")).toBe(
      "register-personal-area-hint"
    );
    expect(screen.getByText("auth.noAccountPrompt")).toBeTruthy();
    expect(screen.getByTestId("register-personal-area-cta")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "auth.continuePendingRegistration" })
    ).toBeNull();
  });

  it("keeps the pending-registration link on /register/institution", async () => {
    getRegistrationStep1.mockReturnValue({ full_name: "דנה" });
    render(<LoginPageClient />);

    await waitFor(() => {
      expect(screen.getByText("login-form")).toBeTruthy();
    });

    expect(
      screen.getByRole("link", { name: "auth.registerLink" }).getAttribute("href")
    ).toBe("/register");
    expect(
      screen
        .getByRole("link", { name: "auth.continuePendingRegistration" })
        .getAttribute("href")
    ).toBe("/register/institution");
  });
});
