import { describe, expect, it } from "vitest";
import {
  calculateCustomPlanPriceAg,
  buildCustomPlanFeatures,
  parseCustomPlanSelection,
  resolveCustomPlanLimits,
  CUSTOM_PLAN_ID,
} from "./custom-plan";

describe("custom-plan", () => {
  it("calculates price from class and student unit prices", () => {
    const price = calculateCustomPlanPriceAg(
      { classes: 3, students: 20 },
      { classPriceAg: 100_000, studentPriceAg: 4_500 }
    );
    expect(price).toBe(300_000 + 90_000);
  });

  it("uses a manual special price override when provided", () => {
    expect(
      calculateCustomPlanPriceAg(
        { classes: 3, students: 20 },
        { classPriceAg: 100_000, studentPriceAg: 4_500 },
        77_000
      )
    ).toBe(77_000);
  });

  it("builds Hebrew features for schools vs kindergartens", () => {
    expect(
      buildCustomPlanFeatures({ classes: 2, students: 5 }, "schools")
    ).toEqual(["5 תיקי שילוב / סל אישי", "2 כיתות ח״מ"]);
    expect(
      buildCustomPlanFeatures({ classes: 1, students: 0 }, "kindergartens")
    ).toEqual(["1 גני חנ״מ"]);
  });

  it("validates custom plan selection", () => {
    expect(parseCustomPlanSelection({ classes: 1, students: 2 })).toEqual({
      classes: 1,
      students: 2,
    });
    expect(parseCustomPlanSelection({ classes: 0, students: 0 })).toBeNull();
    expect(parseCustomPlanSelection({ classes: -1, students: 1 })).toBeNull();
  });

  it("uses stable custom plan id", () => {
    expect(CUSTOM_PLAN_ID).toBe("plan-custom");
  });

  it("maps portfolio quota to combined integration/personal-basket limits in regular education", () => {
    expect(resolveCustomPlanLimits({ classes: 2, students: 4 }, "regular")).toEqual({
      classes: 2,
      students: 34,
      integrationPortfolios: 4,
      personalBaskets: true,
    });
  });

  it("derives only class student quota in special education", () => {
    expect(resolveCustomPlanLimits({ classes: 2, students: 4 }, "special")).toEqual({
      classes: 2,
      students: 34,
    });
  });
});
