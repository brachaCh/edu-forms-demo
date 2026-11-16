import { describe, expect, it } from "vitest";
import {
  isFillRequestForm,
  isHomeroomFillForm,
  isStaffFillForm,
} from "./homeroom-fill-forms";

describe("isStaffFillForm", () => {
  it("allows referral, exhaust-options, inclusion and tachi forms", () => {
    expect(isStaffFillForm({ id: "referral-questionnaire" })).toBe(true);
    expect(
      isStaffFillForm({ id: "referral-questionnaire-kindergarten" })
    ).toBe(true);
    expect(isStaffFillForm({ id: "moe-exhaust-options" })).toBe(true);
    expect(isStaffFillForm({ id: "moe-inclusion-plan" })).toBe(true);
    expect(isStaffFillForm({ id: "moe-psychologist-recommendation" })).toBe(
      true
    );
    expect(isStaffFillForm({ id: "functional-educational-report" })).toBe(
      true
    );
    expect(isStaffFillForm({ id: "tachi" })).toBe(true);
    expect(isStaffFillForm({ id: "tachi-integrative" })).toBe(true);
    expect(isStaffFillForm({ id: "tachi-prep" })).toBe(true);
    expect(isStaffFillForm({ id: "tla" })).toBe(true);
    expect(isStaffFillForm({ id: "tla-integrative" })).toBe(true);
    expect(isStaffFillForm({ id: "tla-prep" })).toBe(true);
    expect(isStaffFillForm({ id: "tla-presentation" })).toBe(true);
    expect(isStaffFillForm({ id: "student-questionnaire" })).toBe(true);
    expect(isStaffFillForm({ id: "parent-questionnaire" })).toBe(false);
    expect(isStaffFillForm(null)).toBe(false);
  });

  it("keeps the legacy homeroom helper as an alias", () => {
    expect(isHomeroomFillForm({ id: "tachi" })).toBe(true);
  });
});

describe("isFillRequestForm", () => {
  it("allows staff-fill forms and parent questionnaires", () => {
    expect(isFillRequestForm("referral-questionnaire")).toBe(true);
    expect(isFillRequestForm({ id: "parent-questionnaire" })).toBe(true);
    expect(isFillRequestForm("parent-questionnaire-tla")).toBe(true);
    expect(isFillRequestForm("moe-parent-questionnaire-alt")).toBe(true);
    expect(isFillRequestForm("student-questionnaire")).toBe(true);
    expect(isFillRequestForm("confidentiality-waiver")).toBe(false);
    expect(isFillRequestForm(null)).toBe(false);
  });
});
