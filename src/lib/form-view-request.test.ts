import { describe, expect, it } from "vitest";
import {
  isViewableForm,
  getViewRecipientRoles,
  getViewRecipientLabel,
  resolvePrincipalStaffName,
  VIEW_FORMS,
} from "./form-view-request";
import { tableCellKey } from "./form-table-grids";

describe("isViewableForm", () => {
  it("returns true for weekly-schedule", () => {
    expect(isViewableForm("weekly-schedule")).toBe(true);
  });

  it("returns true for accommodations", () => {
    expect(isViewableForm("accommodations")).toBe(true);
  });

  it("returns false for non-viewable forms", () => {
    expect(isViewableForm("waiver-confidentiality")).toBe(false);
    expect(isViewableForm("parent-questionnaire")).toBe(false);
    expect(isViewableForm("some-random-form")).toBe(false);
  });

  it("VIEW_FORMS contains expected forms", () => {
    expect(VIEW_FORMS).toContain("weekly-schedule");
    expect(VIEW_FORMS).toContain("accommodations");
    expect(VIEW_FORMS.length).toBe(2);
  });
});

describe("getViewRecipientRoles", () => {
  it("returns parent, homeroom, principal for weekly-schedule", () => {
    const roles = getViewRecipientRoles("weekly-schedule");
    expect(roles).toEqual(["parent", "homeroom", "principal"]);
  });

  it("returns parent, homeroom for accommodations", () => {
    const roles = getViewRecipientRoles("accommodations");
    expect(roles).toEqual(["parent", "homeroom"]);
  });
});

describe("resolvePrincipalStaffName", () => {
  it("uses principal_name when present", () => {
    expect(resolvePrincipalStaffName({ principal_name: "רות כהן" })).toBe(
      "רות כהן"
    );
  });

  it("falls back to student-team row with מנהל role", () => {
    expect(
      resolvePrincipalStaffName(
        {},
        [
          {
            [tableCellKey("student-team", 0, "role")]: "מנהלת",
            [tableCellKey("student-team", 0, "name")]: "דני לוי",
          },
        ]
      )
    ).toBe("דני לוי");
  });
});

describe("getViewRecipientLabel", () => {
  it("returns correct Hebrew labels", () => {
    expect(getViewRecipientLabel("parent")).toBe("הורים");
    expect(getViewRecipientLabel("homeroom")).toBe("מחנכת");
    expect(getViewRecipientLabel("principal")).toBe("מנהלת");
  });
});
