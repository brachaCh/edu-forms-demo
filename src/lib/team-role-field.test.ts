import { describe, expect, it } from "vitest";
import {
  TEAM_ROLE_OTHER_VALUE,
  composeTeamRoleOtherDraft,
  composeTeamRoleStored,
  finalizeTeamRoleOther,
  formatTeamRoleDisplay,
  shouldUseTeamRoleOtherUi,
  teamRoleOtherText,
  teamRoleSelectValue,
} from "@/lib/team-role-field";

describe("team-role-field (TZ-204)", () => {
  it("stores custom label instead of literal אחר", () => {
    expect(
      composeTeamRoleStored(TEAM_ROLE_OTHER_VALUE, "מטפלת רגשית")
    ).toBe("מטפלת רגשית");
    expect(formatTeamRoleDisplay("מטפלת רגשית")).toBe("מטפלת רגשית");
  });

  it("shows אחר select state for legacy אחר-only value", () => {
    expect(teamRoleSelectValue("אחר")).toBe(TEAM_ROLE_OTHER_VALUE);
    expect(teamRoleOtherText("אחר")).toBe("");
  });

  it("treats unknown stored role as other with custom text", () => {
    const stored = "מנתחת התנהגות";
    expect(teamRoleSelectValue(stored)).toBe(TEAM_ROLE_OTHER_VALUE);
    expect(teamRoleOtherText(stored)).toBe("מנתחת התנהגות");
    expect(formatTeamRoleDisplay(stored)).toBe("מנתחת התנהגות");
  });

  it("keeps preset values unchanged", () => {
    expect(teamRoleSelectValue("מחנכת")).toBe("מחנכת");
    expect(composeTeamRoleStored("מחנכת", "")).toBe("מחנכת");
  });

  it("shouldUseTeamRoleOtherUi is false for empty role", () => {
    expect(shouldUseTeamRoleOtherUi("")).toBe(false);
    expect(shouldUseTeamRoleOtherUi("  ")).toBe(false);
    expect(shouldUseTeamRoleOtherUi(TEAM_ROLE_OTHER_VALUE)).toBe(true);
  });

  it("draft preserves interior spaces; finalize trims ends only", () => {
    expect(composeTeamRoleOtherDraft("מטפלת ")).toBe("מטפלת ");
    expect(composeTeamRoleOtherDraft("מטפלת רגשית")).toBe("מטפלת רגשית");
    expect(finalizeTeamRoleOther("  מטפלת רגשית  ")).toBe("מטפלת רגשית");
    expect(finalizeTeamRoleOther("   ")).toBe("");
  });
});