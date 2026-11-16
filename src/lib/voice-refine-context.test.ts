import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STUDENT_PLACEHOLDER,
  studentNameTokenPromptLines,
} from "./ai-student-placeholder";
import { fillFormPlaceholderPromptLines } from "./ai-fill-form-privacy";
import {
  buildVoiceRefineContext,
  voiceRefinePromptLines,
  voiceRefineUsesPlaceholder,
} from "./voice-refine-context";

describe("voiceRefinePromptLines", () => {
  it("never includes student name and uses generic pupil wording without a restore name", () => {
    const lines = voiceRefinePromptLines({
      formId: "expert-guidance",
      studentGender: "נ",
    });
    const joined = lines.join(" ");
    expect(joined).not.toMatch(/איילה|כהן|דנה/);
    expect(joined).toContain("התלמיד");
    expect(joined).toContain("אל תכתוב בגוף ראשון");
    expect(joined).toContain("הדרכת מומחית");
    expect(joined).not.toContain(STUDENT_PLACEHOLDER);
  });

  it("does not use a placeholder for ID-like or empty names (do not claim names were masked)", () => {
    expect(
      voiceRefineUsesPlaceholder({ studentName: "123456782" })
    ).toBe(false);
    expect(voiceRefineUsesPlaceholder({ studentName: "" })).toBe(false);
    expect(voiceRefineUsesPlaceholder(undefined)).toBe(false);
  });

  it("keeps the name off the prompt and asks for the placeholder when restore is possible", () => {
    const ctx = buildVoiceRefineContext({
      studentName: "  דנה כהן  ",
      studentGender: "נ",
      formId: "expert-guidance",
      formTitle: "הדרכת מומחית תחום",
    });
    expect(ctx).toEqual({
      studentName: "דנה כהן",
      studentGender: "נ",
      formId: "expert-guidance",
      formTitle: "הדרכת מומחית תחום",
    });
    expect(voiceRefineUsesPlaceholder(ctx)).toBe(true);
    const joined = voiceRefinePromptLines(ctx).join(" ");
    expect(joined).toContain(STUDENT_PLACEHOLDER);
    expect(joined).toContain("מפגינה");
    expect(joined).toContain("[[NAME_1]]");
    expect(joined).not.toContain("דנה");
    expect(joined).not.toContain("כהן");
  });
});

describe("shared student name token prompt", () => {
  it("both route prompts contain the shared block and no אך ורק [[PUPIL]] wording", () => {
    const shared = studentNameTokenPromptLines();
    const voice = voiceRefinePromptLines({
      studentName: "נועה כהן",
      studentGender: "נ",
    }).join("\n");
    const fill = fillFormPlaceholderPromptLines().join("\n");
    const refineRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ai/refine-transcript/route.ts"),
      "utf8"
    );
    const fillRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ai/fill-form/route.ts"),
      "utf8"
    );
    const fillRun = readFileSync(
      resolve(process.cwd(), "src/lib/ai-fill-form-run.ts"),
      "utf8"
    );

    expect(shared.length).toBeGreaterThan(0);
    for (const line of shared) {
      expect(voice).toContain(line);
      expect(fill).toContain(line);
    }
    expect(refineRoute).toContain("voiceRefinePromptLines");
    expect(fillRoute).toContain("extraSystemLines");
    expect(fillRun).toContain("extraLines");

    for (const src of [voice, fill, refineRoute, fillRoute, fillRun]) {
      expect(src).not.toMatch(/אך ורק[^\n]{0,80}\[\[PUPIL\]\]/);
      expect(src).not.toMatch(/אך ורק[^\n]{0,80}STUDENT_PLACEHOLDER/);
      expect(src).not.toMatch(/\[\[PUPIL\]\] בלבד/);
      expect(src).not.toMatch(/STUDENT_PLACEHOLDER\} בלבד/);
      expect(src).not.toContain("אך ורק בסימן");
    }
  });
});
