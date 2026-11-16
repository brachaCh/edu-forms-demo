import { describe, expect, it } from "vitest";
import {
  isPrintPath,
  isPublicTokenPath,
  shouldShowProblemReportButton,
} from "./visibility";

describe("isPublicTokenPath", () => {
  it("matches public fill, sign, and view token pages", () => {
    expect(isPublicTokenPath("/fill/abc123")).toBe(true);
    expect(isPublicTokenPath("/sign/parent-token")).toBe(true);
    expect(isPublicTokenPath("/sign-document/ext-token")).toBe(true);
    expect(isPublicTokenPath("/view/view-token")).toBe(true);
    expect(isPublicTokenPath("/fill/abc123?x=1")).toBe(true);
  });

  it("does not match in-app fill pages or other routes", () => {
    expect(isPublicTokenPath("/personal-area/students/fill/id/formId")).toBe(
      false
    );
    expect(isPublicTokenPath("/fill")).toBe(false);
    expect(isPublicTokenPath("/sign")).toBe(false);
    expect(isPublicTokenPath("/view")).toBe(false);
    expect(isPublicTokenPath("/personal-area")).toBe(false);
    expect(isPublicTokenPath("/dashboard")).toBe(false);
  });
});

describe("isPrintPath", () => {
  it("matches print pages", () => {
    expect(isPrintPath("/print")).toBe(true);
    expect(isPrintPath("/print/abc123")).toBe(true);
    expect(isPrintPath("/print/key/extra")).toBe(true);
  });

  it("does not match other routes", () => {
    expect(isPrintPath("/personal-area")).toBe(false);
    expect(isPrintPath("/dashboard")).toBe(false);
    expect(isPrintPath("/printer")).toBe(false);
  });
});

describe("shouldShowProblemReportButton", () => {
  it("shows for logged-in users on in-app screens", () => {
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/personal-area",
      })
    ).toBe(true);
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/dashboard",
      })
    ).toBe(true);
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/personal-area/students/fill/s1/parent-questionnaire",
      })
    ).toBe(true);
  });

  it("hides for guests", () => {
    expect(
      shouldShowProblemReportButton({
        loggedIn: false,
        pathname: "/personal-area",
      })
    ).toBe(false);
  });

  it("hides on public /fill/[token], /sign/[token], and /view/[token] even when logged in", () => {
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/fill/secret-token",
      })
    ).toBe(false);
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/sign/secret-token",
      })
    ).toBe(false);
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/view/view-token",
      })
    ).toBe(false);
  });

  it("hides on /print pages even when logged in", () => {
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/print/abc123",
      })
    ).toBe(false);
    expect(
      shouldShowProblemReportButton({
        loggedIn: true,
        pathname: "/print",
      })
    ).toBe(false);
  });
});
