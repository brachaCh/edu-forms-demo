import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_TEXTS } from "./site-text";
import {
  decideTeacherInviteRegisterNext,
  teacherInviteExistingLoginHref,
} from "./teacher-invite-register-next";

describe("TeacherInviteRegisterForm handling of invite POST success", () => {
  it("treats ok + resumed + needsOtp:false as done — login with existing password", () => {
    expect(
      decideTeacherInviteRegisterNext({
        ok: true,
        needsOtp: false,
        resumed: true,
        redirectHref: "/students?category=schools",
      })
    ).toEqual({
      action: "existing_login",
      href: "/students?category=schools",
      reason: "resumed",
    });
  });

  it("does not leave her on the password step for any ok without OTP", () => {
    expect(
      decideTeacherInviteRegisterNext({
        ok: true,
        needsOtp: false,
        redirectHref: "/personal-area",
      })
    ).toEqual({
      action: "existing_login",
      href: "/personal-area",
      reason: "no_otp",
    });
  });

  it("still opens the OTP step when the account was resumed with a new password", () => {
    expect(
      decideTeacherInviteRegisterNext({
        ok: true,
        needsOtp: true,
        resumed: true,
        redirectHref: "/students",
      })
    ).toEqual({ action: "otp", redirectHref: "/students" });
  });

  it("redirects a logged-in multi-institution accept", () => {
    expect(
      decideTeacherInviteRegisterNext({
        ok: true,
        needsOtp: false,
        multiInstitution: true,
        redirectHref: "/select-institution",
      })
    ).toEqual({ action: "redirect", href: "/select-institution" });
  });

  it("prefers the resumed login message over a silent multiInstitution redirect", () => {
    expect(
      decideTeacherInviteRegisterNext({
        ok: true,
        needsOtp: false,
        resumed: true,
        multiInstitution: true,
        redirectHref: "/select-institution",
      })
    ).toEqual({
      action: "existing_login",
      href: "/select-institution",
      reason: "resumed",
    });
  });

  it("tells her the typed password was not used and to log in with the existing one", () => {
    expect(DEFAULT_SITE_TEXTS.auth.inviteResumedLoginHint).toContain(
      "הסיסמה הקיימת"
    );
    expect(DEFAULT_SITE_TEXTS.auth.inviteResumedLoginHint).toContain(
      "לא נשמרה"
    );
  });

  it("sends a resumed teacher to login, not back to the consumed invite", () => {
    expect(
      teacherInviteExistingLoginHref({
        token: "used-invite-token",
        nextHref: "/students?category=schools",
        resumed: true,
      })
    ).toBe(
      `/login?next=${encodeURIComponent("/students?category=schools")}`
    );
    expect(
      teacherInviteExistingLoginHref({
        token: "pending-token",
        resumed: false,
      })
    ).toBe(
      `/login?next=${encodeURIComponent("/register/invite?token=pending-token")}`
    );
  });
});
