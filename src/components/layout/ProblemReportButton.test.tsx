/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const invokeProblemReport = vi.fn();

vi.mock("@/lib/invokeProblemReport", () => ({
  invokeProblemReport: (...args: unknown[]) => invokeProblemReport(...args),
}));

import { ProblemReportButton } from "./ProblemReportButton";

afterEach(() => {
  cleanup();
  invokeProblemReport.mockReset();
});

describe("ProblemReportButton", () => {
  it("shows the session email as read-only", async () => {
    render(<ProblemReportButton sessionEmail="teacher@school.il" />);
    fireEvent.click(screen.getByRole("button", { name: "דיווח על תקלה" }));
    const email = screen.getByLabelText("כתובת מייל בחשבון") as HTMLInputElement;
    expect(email.value).toBe("teacher@school.il");
    expect(email.readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText("תיאור התקלה"), {
      target: { value: "השמירה נכשלה" },
    });
    invokeProblemReport.mockResolvedValue({ ok: true, ticketId: "TZ-18" });
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(invokeProblemReport).toHaveBeenCalledWith({
        description: "השמירה נכשלה",
        pagePath: expect.any(String),
        browser: expect.any(String),
        website: "",
      });
    });
    expect(invokeProblemReport.mock.calls[0]?.[0]).not.toHaveProperty(
      "reporterEmail"
    );
  });

  it("blocks submit when the session has no email", () => {
    render(<ProblemReportButton sessionEmail="" />);
    fireEvent.click(screen.getByRole("button", { name: "דיווח על תקלה" }));
    expect(
      screen.getByRole("button", { name: /שליחת דיווח/ })
    ).toHaveProperty("disabled", true);
  });
});
