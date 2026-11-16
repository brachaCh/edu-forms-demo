/**
 * What TeacherInviteRegisterForm does after a successful invite POST.
 * A resumed / no-OTP success must not leave her on the password step
 * (the invite is already consumed; the password she typed is unused).
 */

export type TeacherInviteRegisterSuccess = {
  ok?: boolean;
  redirectHref?: string;
  needsOtp?: boolean;
  multiInstitution?: boolean;
  resumed?: boolean;
};

export type TeacherInviteRegisterNext =
  | { action: "otp"; redirectHref?: string }
  | { action: "redirect"; href: string }
  | { action: "existing_login"; href: string; reason: "resumed" | "no_otp" };

export function decideTeacherInviteRegisterNext(
  data: TeacherInviteRegisterSuccess | null | undefined
): TeacherInviteRegisterNext | null {
  if (!data?.ok) return null;

  if (data.needsOtp) {
    return { action: "otp", redirectHref: data.redirectHref };
  }

  if (data.resumed) {
    return {
      action: "existing_login",
      href: data.redirectHref ?? "/select-institution",
      reason: "resumed",
    };
  }

  if (data.multiInstitution) {
    return {
      action: "redirect",
      href: data.redirectHref ?? "/select-institution",
    };
  }

  return {
    action: "existing_login",
    href: data.redirectHref ?? "/select-institution",
    reason: "no_otp",
  };
}

export function teacherInviteExistingLoginHref(input: {
  token: string;
  nextHref?: string;
  resumed?: boolean;
}): string {
  const next = input.resumed
    ? input.nextHref && input.nextHref !== "/login"
      ? input.nextHref
      : "/select-institution"
    : `/register/invite?token=${input.token}`;
  return `/login?next=${encodeURIComponent(next)}`;
}
