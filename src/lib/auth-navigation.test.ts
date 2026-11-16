import { describe, expect, it } from "vitest";
import { institutionProfileHref } from "./personal-sector";
import {
  existingSessionContinueHref,
  postLoginHref,
  safePersonalAreaNext,
  isValidTeacherInviteNext,
  isAuthenticatedAppPath,
  logoHomeHref,
  shouldPromptLoginAfterSessionCheck,
  shouldShowInstitutionProfileBack,
  sidebarHomeHref,
} from "./auth-navigation";

describe("authentication navigation", () => {
  it("lets a platform admin in without setup", () => {
    expect(
      postLoginHref(
        { setup_completed_at: null },
        "/personal-area/students/new",
        { isPlatformAdmin: true }
      )
    ).toBe("/personal-area/students/new");
  });

  it("sends users without setup to the setup wizard", () => {
    expect(
      postLoginHref(
        { setup_completed_at: null },
        "/personal-area/students/new"
      )
    ).toBe("/personal-area/setup");
  });

  it("sends configured users to a safe requested screen", () => {
    expect(
      postLoginHref(
        { setup_completed_at: "2026-08-16T12:00:00.000Z" },
        "/personal-area/students/new"
      )
    ).toBe("/personal-area/students/new");
  });

  it("rejects destinations outside the personal area", () => {
    expect(safePersonalAreaNext("https://evil.example")).toBeNull();
    expect(
      postLoginHref(
        {
          setup_completed_at: "2026-08-16T12:00:00.000Z",
          institution_type: "schools",
          education_framework: "special",
        },
        "//evil.example"
      )
    ).toBe(institutionProfileHref({ institution_type: "schools", education_framework: "special" }));
  });
});

describe("sidebarHomeHref", () => {
  it("keeps guests on the public category picker", () => {
    expect(sidebarHomeHref({ loggedIn: false })).toBe("/dashboard");
    expect(
      sidebarHomeHref({
        loggedIn: false,
        profile: {
          setup_completed_at: "2026-08-16T12:00:00.000Z",
          institution_type: "schools",
          education_framework: "special",
        },
      })
    ).toBe("/dashboard");
  });

  it("sends a logged-in institution user straight to the institution table", () => {
    expect(
      sidebarHomeHref({
        loggedIn: true,
        profile: {
          setup_completed_at: "2026-08-16T12:00:00.000Z",
          institution_type: "schools",
          education_framework: "special",
        },
      })
    ).toBe("/personal-area/sector-table/schools/special");
  });

  it("sends an incomplete setup user to the setup wizard", () => {
    expect(
      sidebarHomeHref({
        loggedIn: true,
        profile: {
          setup_completed_at: null,
          institution_type: "schools",
          education_framework: "special",
        },
      })
    ).toBe("/personal-area/setup");
  });
});

describe("logoHomeHref and institution-profile back (TZ-96)", () => {
  const profile = {
    setup_completed_at: "2026-08-16T12:00:00.000Z",
    institution_type: "schools" as const,
    education_framework: "special" as const,
  };
  const profileHref = "/personal-area/sector-table/schools/special";

  it("keeps the header logo on the landing page for guests", () => {
    expect(logoHomeHref({ loggedIn: false })).toBe("/");
    expect(logoHomeHref({ loggedIn: false, profile })).toBe("/");
  });

  it("sends a logged-in institution user from the logo to the institution profile", () => {
    expect(logoHomeHref({ loggedIn: true, profile })).toBe(profileHref);
  });

  it("shows the institution-profile back link on inner app screens", () => {
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/students/view/abc",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/dashboard",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/dashboard/tutorials",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/admin",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/platform-admin",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/category/integration-teacher/teacher",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/archive",
        profileHref,
      })
    ).toBe(true);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/students/fill/abc/form-1",
        profileHref,
      })
    ).toBe(true);
  });

  it("still offers the institution-profile return on gated app paths before the user snapshot hydrates", () => {
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: false,
        pathname: "/personal-area/category/integration-teacher/teacher",
        profileHref,
      })
    ).toBe(true);
    expect(isAuthenticatedAppPath("/personal-area/plan")).toBe(true);
    expect(isAuthenticatedAppPath("/fill/token")).toBe(false);
    expect(isAuthenticatedAppPath("/login")).toBe(false);
  });

  it("hides the institution-profile back link for guests, auth screens, and the profile itself", () => {
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: false,
        pathname: "/dashboard",
        profileHref,
      })
    ).toBe(false);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: false,
        pathname: "/fill/public-token",
        profileHref,
      })
    ).toBe(false);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/students/view/abc",
        profileHref,
        guestDemo: true,
      })
    ).toBe(false);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/login",
        profileHref,
      })
    ).toBe(false);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: profileHref,
        profileHref,
      })
    ).toBe(false);
    expect(
      shouldShowInstitutionProfileBack({
        loggedIn: true,
        pathname: "/personal-area/sector-table/kindergartens/regular",
        profileHref,
      })
    ).toBe(false);
  });
});

describe("existing session continue / no re-login", () => {
  const profile = {
    setup_completed_at: "2026-08-16T12:00:00.000Z",
    institution_type: "schools" as const,
    education_framework: "special" as const,
  };

  it("continues a live session to the institution table without a login form", () => {
    expect(existingSessionContinueHref(profile)).toBe(
      institutionProfileHref(profile)
    );
    expect(
      existingSessionContinueHref(profile, "/personal-area")
    ).toBe("/personal-area");
    expect(existingSessionContinueHref(null)).toBeNull();
  });

  it("does not ask for a password when session check fails but a cached user exists", () => {
    expect(
      shouldPromptLoginAfterSessionCheck({
        sessionProfile: profile,
        sessionCheckFailed: false,
        cachedProfile: profile,
      })
    ).toBe(false);
    expect(
      shouldPromptLoginAfterSessionCheck({
        sessionProfile: null,
        sessionCheckFailed: true,
        cachedProfile: profile,
      })
    ).toBe(false);
  });

  it("asks for login when the server says there is no session", () => {
    expect(
      shouldPromptLoginAfterSessionCheck({
        sessionProfile: null,
        sessionCheckFailed: false,
        cachedProfile: profile,
      })
    ).toBe(true);
    expect(
      shouldPromptLoginAfterSessionCheck({
        sessionProfile: null,
        sessionCheckFailed: true,
        cachedProfile: null,
      })
    ).toBe(true);
  });
});

describe("isValidTeacherInviteNext", () => {
  it("accepts /register/invite?token=X", () => {
    expect(isValidTeacherInviteNext("/register/invite?token=abc123def")).toBe(true);
    expect(isValidTeacherInviteNext("/register/invite?token=some-long-token-value")).toBe(true);
  });

  it("rejects empty or missing token", () => {
    expect(isValidTeacherInviteNext("/register/invite")).toBe(false);
    expect(isValidTeacherInviteNext("/register/invite?token=")).toBe(false);
    expect(isValidTeacherInviteNext("/register/invite?token=   ")).toBe(false);
  });

  it("rejects extra query params", () => {
    expect(isValidTeacherInviteNext("/register/invite?token=abc&evil=1")).toBe(false);
    expect(isValidTeacherInviteNext("/register/invite?foo=bar&token=abc")).toBe(false);
  });

  it("rejects wrong paths", () => {
    expect(isValidTeacherInviteNext("/register/invite/extra?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("/register?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("/invite?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("/other/register/invite?token=abc")).toBe(false);
  });

  it("rejects open redirect attempts with //", () => {
    expect(isValidTeacherInviteNext("//evil.com/register/invite?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("//evil.com?token=abc")).toBe(false);
  });

  it("rejects scheme-based open redirects", () => {
    expect(isValidTeacherInviteNext("https://evil.com/register/invite?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("http://evil.com/register/invite?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("javascript:alert(1)")).toBe(false);
  });

  it("rejects backslash-based open redirects", () => {
    expect(isValidTeacherInviteNext("/\\evil.com/register/invite?token=abc")).toBe(false);
    expect(isValidTeacherInviteNext("\\\\evil.com/register/invite?token=abc")).toBe(false);
  });

  it("rejects null and empty strings", () => {
    expect(isValidTeacherInviteNext("")).toBe(false);
    expect(isValidTeacherInviteNext(null as unknown as string)).toBe(false);
  });
});

describe("safePersonalAreaNext with teacher invite", () => {
  it("allows /register/invite?token=X as a valid next URL", () => {
    const next = "/register/invite?token=abc123";
    expect(safePersonalAreaNext(next)).toBe(next);
  });

  it("login with next=/register/invite?token=X lands there", () => {
    const profile = {
      setup_completed_at: "2026-08-16T12:00:00.000Z",
      institution_type: "schools" as const,
      education_framework: "special" as const,
    };
    expect(postLoginHref(profile, "/register/invite?token=abc123")).toBe(
      "/register/invite?token=abc123"
    );
  });

  it("rejects malicious variants even with token param", () => {
    expect(safePersonalAreaNext("//evil.com/register/invite?token=abc")).toBeNull();
    expect(safePersonalAreaNext("https://evil.com/register/invite?token=abc")).toBeNull();
    expect(safePersonalAreaNext("/register/invite?token=abc&redirect=evil.com")).toBeNull();
  });

  it("still allows /personal-area paths", () => {
    expect(safePersonalAreaNext("/personal-area")).toBe("/personal-area");
    expect(safePersonalAreaNext("/personal-area/students")).toBe("/personal-area/students");
  });

  it("rejects other paths", () => {
    expect(safePersonalAreaNext("/other-page")).toBeNull();
    expect(safePersonalAreaNext("/register")).toBeNull();
  });
});
