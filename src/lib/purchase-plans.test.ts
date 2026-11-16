import { describe, expect, it } from "vitest";
import {
  getPlansForInstitution,
  isPlanAllowedForInstitution,
  formatPlanPrice,
} from "./purchase-plans";

describe("purchase-plans", () => {
  it("returns regular plans for any institution type with regular framework", () => {
    const plans = getPlansForInstitution("kindergartens", "regular");
    expect(plans).toHaveLength(6);
    expect(plans.every((plan) => plan.category === "regular")).toBe(true);
  });

  it("returns special plans for any institution type with special framework", () => {
    const plans = getPlansForInstitution("schools", "special");
    expect(plans).toHaveLength(6);
    expect(plans.every((plan) => plan.category === "special")).toBe(true);
  });

  it("does not filter plans by institution type", () => {
    const kindergartenPlans = getPlansForInstitution("kindergartens", "special");
    const schoolPlans = getPlansForInstitution("schools", "special");
    expect(kindergartenPlans).toEqual(schoolPlans);
  });

  it("validates plan eligibility by education framework only", () => {
    expect(isPlanAllowedForInstitution("plan-1", "schools", "regular")).toBe(
      true
    );
    expect(isPlanAllowedForInstitution("plan-1", "kindergartens", "special")).toBe(
      false
    );
    expect(
      isPlanAllowedForInstitution("plan-7", "kindergartens", "special")
    ).toBe(true);
    expect(isPlanAllowedForInstitution("plan-7", "schools", "regular")).toBe(
      false
    );
  });

  it("formats ILS prices", () => {
    expect(formatPlanPrice(210_000)).toContain("2");
  });
});
