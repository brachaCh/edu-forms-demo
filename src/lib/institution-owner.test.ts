import { describe, expect, it } from "vitest";
import {
  canInviteInstitutionTeachers,
  canInviteHomeroomTeacher,
  canAssignStudentsToTeachers,
} from "./institution-owner";

describe("canInviteInstitutionTeachers", () => {
  it("allows institution owners only", () => {
    expect(canInviteInstitutionTeachers({ is_institution_owner: true })).toBe(
      true
    );
    expect(canInviteInstitutionTeachers({ is_institution_owner: false })).toBe(
      false
    );
    expect(canInviteInstitutionTeachers(null)).toBe(false);
  });
});

describe("canInviteHomeroomTeacher", () => {
  it("allows institution owners and admins", () => {
    expect(canInviteHomeroomTeacher({ membershipRole: "owner" })).toBe(true);
    expect(canInviteHomeroomTeacher({ membershipRole: "admin" })).toBe(true);
  });

  it("denies regular teachers (members)", () => {
    expect(canInviteHomeroomTeacher({ membershipRole: "member" })).toBe(false);
    expect(canInviteHomeroomTeacher(null)).toBe(false);
  });

  it("allows system admin even as a member", () => {
    expect(
      canInviteHomeroomTeacher({ membershipRole: "member", isAdmin: true })
    ).toBe(true);
  });

  it("falls back to profile owner flag before migration 056", () => {
    expect(
      canInviteHomeroomTeacher({
        membershipRole: null,
        isInstitutionOwner: true,
      })
    ).toBe(true);
    expect(
      canInviteHomeroomTeacher({
        membershipRole: null,
        isInstitutionOwner: false,
      })
    ).toBe(false);
  });
});

describe("TZ-32: canAssignStudentsToTeachers", () => {
  it("owner can assign students to teachers", () => {
    expect(canAssignStudentsToTeachers("owner", false)).toBe(true);
  });

  it("admin CANNOT assign students to teachers", () => {
    expect(canAssignStudentsToTeachers("admin", false)).toBe(false);
  });

  it("member CANNOT assign students to teachers", () => {
    expect(canAssignStudentsToTeachers("member", false)).toBe(false);
  });

  it("system admin (is_admin=true) can assign students to teachers even as member", () => {
    expect(canAssignStudentsToTeachers("member", true)).toBe(true);
  });

  it("system admin (is_admin=true) can assign students to teachers even as admin", () => {
    expect(canAssignStudentsToTeachers("admin", true)).toBe(true);
  });

  it("null role CANNOT assign students to teachers", () => {
    expect(canAssignStudentsToTeachers(null, false)).toBe(false);
  });

  it("undefined role CANNOT assign students to teachers", () => {
    expect(canAssignStudentsToTeachers(undefined, false)).toBe(false);
  });
});
