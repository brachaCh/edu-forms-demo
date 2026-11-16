import { describe, expect, it } from "vitest";
import {
  decideExistingUserInviteAccept,
  pendingInviteAllowsLinkedStaffCard,
  staffCardLinkForExistingUser,
} from "./teacher-invite-accept";

describe("decideExistingUserInviteAccept", () => {
  const inviteInstitutionId = "institution-b";
  const existing = { id: "user-a", institution_id: "institution-a" };

  it("accepts a logged-in existing user from another institution without registration", () => {
    expect(
      decideExistingUserInviteAccept({
        existingProfile: existing,
        inviteInstitutionId,
        inviteEmail: "Dana@School.IL",
        session: { userId: "user-a", email: "dana@school.il" },
      })
    ).toEqual({ action: "accept_without_register", userId: "user-a" });
  });

  it("requires login — does not send her through registration", () => {
    expect(
      decideExistingUserInviteAccept({
        existingProfile: existing,
        inviteInstitutionId,
        inviteEmail: "dana@school.il",
        session: null,
      })
    ).toEqual({ action: "login_required" });
  });

  it("rejects a session whose email does not match the invite", () => {
    expect(
      decideExistingUserInviteAccept({
        existingProfile: existing,
        inviteInstitutionId,
        inviteEmail: "dana@school.il",
        session: { userId: "other", email: "other@school.il" },
      })
    ).toEqual({ action: "session_mismatch" });
  });

  it("registers a new user when no profile exists", () => {
    expect(
      decideExistingUserInviteAccept({
        existingProfile: null,
        inviteInstitutionId,
        inviteEmail: "new@school.il",
        session: null,
      })
    ).toEqual({ action: "register_new" });
  });

  it("keeps the same-institution resume path", () => {
    expect(
      decideExistingUserInviteAccept({
        existingProfile: { id: "user-b", institution_id: inviteInstitutionId },
        inviteInstitutionId,
        inviteEmail: "dana@school.il",
        session: null,
      })
    ).toEqual({ action: "same_institution" });
  });

  it("never asks an existing other-institution user to register", () => {
    const loggedIn = decideExistingUserInviteAccept({
      existingProfile: existing,
      inviteInstitutionId,
      inviteEmail: "dana@school.il",
      session: { userId: "user-a", email: "dana@school.il" },
    });
    const loggedOut = decideExistingUserInviteAccept({
      existingProfile: existing,
      inviteInstitutionId,
      inviteEmail: "dana@school.il",
      session: null,
    });
    expect(loggedIn.action).toBe("accept_without_register");
    expect(loggedOut.action).toBe("login_required");
    expect(loggedIn.action).not.toBe("register_new");
    expect(loggedOut.action).not.toBe("register_new");
  });
});

describe("staffCardLinkForExistingUser", () => {
  it("links an unlinked staff card in the invite institution", () => {
    expect(
      staffCardLinkForExistingUser({
        staffCard: {
          id: "staff-1",
          institution_id: "institution-b",
          user_profile_id: null,
        },
        inviteInstitutionId: "institution-b",
        userId: "user-a",
      })
    ).toEqual({ staffCardId: "staff-1", userId: "user-a" });
  });

  it("does not overwrite an already linked staff card", () => {
    expect(
      staffCardLinkForExistingUser({
        staffCard: {
          id: "staff-1",
          institution_id: "institution-b",
          user_profile_id: "someone-else",
        },
        inviteInstitutionId: "institution-b",
        userId: "user-a",
      })
    ).toBeNull();
  });

  it("does not overwrite a card already linked to the same user", () => {
    expect(
      staffCardLinkForExistingUser({
        staffCard: {
          id: "staff-1",
          institution_id: "institution-b",
          user_profile_id: "user-a",
        },
        inviteInstitutionId: "institution-b",
        userId: "user-a",
      })
    ).toBeNull();
  });

  it("does not link a staff card from another institution", () => {
    expect(
      staffCardLinkForExistingUser({
        staffCard: {
          id: "staff-1",
          institution_id: "institution-c",
          user_profile_id: null,
        },
        inviteInstitutionId: "institution-b",
        userId: "user-a",
      })
    ).toBeNull();
  });
});

describe("pendingInviteAllowsLinkedStaffCard", () => {
  it("allows an unlinked staff card", () => {
    expect(
      pendingInviteAllowsLinkedStaffCard({
        staffCard: {
          status: "integration-teacher",
          user_profile_id: null,
        },
        invitedUserId: "user-a",
      })
    ).toBe(true);
  });

  it("allows a card already linked to the same invited user (rejoin)", () => {
    expect(
      pendingInviteAllowsLinkedStaffCard({
        staffCard: {
          status: "integration-teacher",
          user_profile_id: "user-a",
        },
        invitedUserId: "user-a",
      })
    ).toBe(true);
  });

  it("rejects a card linked to a different user", () => {
    expect(
      pendingInviteAllowsLinkedStaffCard({
        staffCard: {
          status: "integration-teacher",
          user_profile_id: "someone-else",
        },
        invitedUserId: "user-a",
      })
    ).toBe(false);
  });

  it("rejects a linked card when the invite email has no profile", () => {
    expect(
      pendingInviteAllowsLinkedStaffCard({
        staffCard: {
          status: "integration-teacher",
          user_profile_id: "user-a",
        },
        invitedUserId: null,
      })
    ).toBe(false);
  });
});
