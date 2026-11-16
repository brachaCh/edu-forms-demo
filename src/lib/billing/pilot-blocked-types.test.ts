import { describe, expect, it } from "vitest";
import {
  PILOT_BLOCKED_INSTITUTION_TYPES,
  PILOT_BLOCKED_SETUP_MESSAGE,
  PILOT_BLOCKED_ERROR_CODE,
  isPilotBlockedInstitutionType,
  isSetupBlockedForInstitutionType,
} from "./pilot-blocked-types";

describe("pilot-blocked-types", () => {
  describe("constants", () => {
    it("lists kindergartens and high-schools as blocked types", () => {
      expect(PILOT_BLOCKED_INSTITUTION_TYPES).toContain("kindergartens");
      expect(PILOT_BLOCKED_INSTITUTION_TYPES).toContain("high-schools");
      expect(PILOT_BLOCKED_INSTITUTION_TYPES).not.toContain("schools");
    });

    it("has Hebrew setup blocked message", () => {
      expect(PILOT_BLOCKED_SETUP_MESSAGE).toBe(
        "המערכת אינה זמינה כרגע לגנים ותיכונים. לפרטים נוספים צרו קשר."
      );
    });

    it("has stable error code", () => {
      expect(PILOT_BLOCKED_ERROR_CODE).toBe("PILOT_BLOCKED_INSTITUTION_TYPE");
    });
  });

  describe("isPilotBlockedInstitutionType", () => {
    it("returns true for kindergartens", () => {
      expect(isPilotBlockedInstitutionType("kindergartens")).toBe(true);
    });

    it("returns true for high-schools", () => {
      expect(isPilotBlockedInstitutionType("high-schools")).toBe(true);
    });

    it("returns false for schools (not blocked)", () => {
      expect(isPilotBlockedInstitutionType("schools")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isPilotBlockedInstitutionType(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isPilotBlockedInstitutionType(undefined)).toBe(false);
    });
  });

  describe("isSetupBlockedForInstitutionType - setup/registration blocking", () => {
    describe("blocks new selection of kindergartens/high-schools", () => {
      it("blocks setting kindergartens for new accounts (null current type)", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", null, null)).toBe(true);
        expect(isSetupBlockedForInstitutionType("kindergartens", null, "none")).toBe(true);
      });

      it("blocks setting high-schools for new accounts (null current type)", () => {
        expect(isSetupBlockedForInstitutionType("high-schools", null, null)).toBe(true);
        expect(isSetupBlockedForInstitutionType("high-schools", null, "none")).toBe(true);
      });

      it("blocks changing from schools to blocked type", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", "schools", null)).toBe(true);
        expect(isSetupBlockedForInstitutionType("high-schools", "schools", null)).toBe(true);
      });
    });

    describe("allows schools type (never blocked)", () => {
      it("allows setting schools type for new accounts", () => {
        expect(isSetupBlockedForInstitutionType("schools", null, null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", null, "none")).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", null, "pending_payment")).toBe(false);
      });

      it("allows changing from blocked type to schools", () => {
        expect(isSetupBlockedForInstitutionType("schools", "kindergartens", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "high-schools", null)).toBe(false);
      });
    });

    describe("null/undefined type not blocked (accounts without type set yet)", () => {
      it("does not block when new type is null", () => {
        expect(isSetupBlockedForInstitutionType(null, null, null)).toBe(false);
        expect(isSetupBlockedForInstitutionType(null, "schools", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType(null, "kindergartens", null)).toBe(false);
      });

      it("does not block when new type is undefined", () => {
        expect(isSetupBlockedForInstitutionType(undefined, null, null)).toBe(false);
        expect(isSetupBlockedForInstitutionType(undefined, "schools", null)).toBe(false);
      });
    });

    describe("existing accounts of blocked types can edit settings", () => {
      it("allows existing kindergarten accounts to save same type", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", "kindergartens", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("kindergartens", "kindergartens", "none")).toBe(false);
        expect(isSetupBlockedForInstitutionType("kindergartens", "kindergartens", "pending_payment")).toBe(false);
      });

      it("allows existing high-school accounts to save same type", () => {
        expect(isSetupBlockedForInstitutionType("high-schools", "high-schools", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", "high-schools", "none")).toBe(false);
      });

      it("allows switching between blocked types for existing accounts", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", "high-schools", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", "kindergartens", null)).toBe(false);
      });
    });

    describe("active subscriptions not blocked (existing paying customers)", () => {
      it("does not block any type for institutions with active subscriptions", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", null, "active")).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", null, "active")).toBe(false);
        expect(isSetupBlockedForInstitutionType("kindergartens", "schools", "active")).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", "schools", "active")).toBe(false);
      });

      it("allows schools type with active subscription", () => {
        expect(isSetupBlockedForInstitutionType("schools", null, "active")).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "kindergartens", "active")).toBe(false);
      });
    });

    describe("payment/purchase NOT blocked (regression test for TZ-14 fix)", () => {
      it("schools can pay regardless of subscription status", () => {
        expect(isSetupBlockedForInstitutionType("schools", "schools", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "schools", "none")).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "schools", "pending_payment")).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "schools", "expired")).toBe(false);
        expect(isSetupBlockedForInstitutionType("schools", "schools", "cancelled")).toBe(false);
      });

      it("existing kindergartens/high-schools can pay (setup returns false when current=new)", () => {
        expect(isSetupBlockedForInstitutionType("kindergartens", "kindergartens", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("kindergartens", "kindergartens", "pending_payment")).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", "high-schools", null)).toBe(false);
        expect(isSetupBlockedForInstitutionType("high-schools", "high-schools", "pending_payment")).toBe(false);
      });
    });
  });
});
