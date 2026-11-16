import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fillFormPlaceholderPromptLines,
  prepareFillFormForAnthropic,
  resolveFillFormStudentName,
  restoreFillFormFields,
} from "./ai-fill-form-privacy";
import {
  STUDENT_PLACEHOLDER,
  studentNameTokenPromptLines,
} from "./ai-student-placeholder";

function routeSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("A3 fill-form name masking", () => {
  it("resolves studentName from the body, else from the form name field when freeAccess", () => {
    expect(
      resolveFillFormStudentName({
        studentName: "נועה כהן",
        freeAccess: true,
        fields: [{ key: "full_name", currentValue: "מישהי אחרת" }],
      })
    ).toBe("נועה כהן");
    expect(
      resolveFillFormStudentName({
        studentName: "",
        freeAccess: true,
        fields: [{ key: "full_name", currentValue: "  נועה כהן  " }],
      })
    ).toBe("נועה כהן");
    expect(
      resolveFillFormStudentName({
        studentName: "",
        freeAccess: true,
        fields: [
          { key: "first_name", currentValue: "נועה" },
          { key: "last_name", currentValue: "כהן" },
        ],
      })
    ).toBe("נועה כהן");
    expect(
      resolveFillFormStudentName({
        studentName: "",
        freeAccess: false,
        fields: [{ key: "full_name", currentValue: "נועה כהן" }],
      })
    ).toBe("");
  });

  it("produces an Anthropic request body with no token of the student name", () => {
    const prepared = prepareFillFormForAnthropic({
      studentName: "נועה כהן",
      teacherNotes: "נועה מתקשה בכתיבה. כהן שיתפה בשיעור.",
      exampleTemplate: "בדוגמה: נועה כהן מצטיינת.",
      studentContext: {
        notes: "הערות על נועה מהכרטיס",
        gender: "נ",
      },
      fieldSummaries: [
        {
          key: "strengths",
          label: "חוזקות",
          type: "textarea",
          currentValue: "נועה משתפת. יש טלפון 050-1234567",
        },
        {
          key: "full_name",
          label: "שם מלא",
          type: "text",
          currentValue: "נועה כהן",
        },
      ],
      maxNotesChars: 2000,
      maxExampleChars: 12_000,
    });

    const userPayload = {
      formId: "referral-questionnaire",
      studentContext: prepared.studentContext,
      teacherNotes: prepared.teacherNotes || undefined,
      exampleTemplate: prepared.exampleTemplate || undefined,
      fields: prepared.fields,
    };
    const requestBody = JSON.stringify({
      system: prepared.promptLines.join(" "),
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    });

    expect(requestBody).not.toContain("נועה");
    expect(requestBody).not.toContain("כהן");
    expect(prepared.teacherNotes).toMatch(/\[\[NAME_\d+\]\]/);
    expect(prepared.studentContext.notes).toMatch(/\[\[NAME_\d+\]\]/);
    expect(prepared.fields.find((f) => f.key === "strengths")?.currentValue).toMatch(
      /\[\[NAME_\d+\]\]/
    );
    expect(prepared.fields.find((f) => f.key === "full_name")?.currentValue).toBeUndefined();
    expect(prepared.promptLines.join(" ")).toContain(STUDENT_PLACEHOLDER);
    expect(prepared.promptLines.join(" ")).not.toContain("נועה");
    expect(prepared.usesPlaceholder).toBe(true);

    const restored = restoreFillFormFields(
      {
        strengths: `${STUDENT_PLACEHOLDER} משתפת בכיתה`,
      },
      prepared.firstName,
      prepared.restoreMap,
      prepared.teacherLiterals
    );
    expect(restored.strengths).toBe("נועה משתפת בכיתה");
    expect(restored.strengths).not.toContain("כהן");
  });

  it("masks using the form name field when freeAccess and no studentName", () => {
    const prepared = prepareFillFormForAnthropic({
      studentName: "",
      freeAccess: true,
      teacherNotes: "נועה מתקשה",
      exampleTemplate: "",
      studentContext: { notes: "כהן בכיתה" },
      fieldSummaries: [
        {
          key: "full_name",
          label: "שם מלא",
          type: "text",
          currentValue: "נועה כהן",
        },
        {
          key: "strengths",
          label: "חוזקות",
          type: "textarea",
          currentValue: "נועה משתפת",
        },
      ],
      maxNotesChars: 2000,
      maxExampleChars: 12_000,
    });
    const requestBody = JSON.stringify({
      system: prepared.promptLines.join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            teacherNotes: prepared.teacherNotes,
            studentContext: prepared.studentContext,
            fields: prepared.fields,
          }),
        },
      ],
    });
    expect(requestBody).not.toContain("נועה");
    expect(requestBody).not.toContain("כהן");
    expect(prepared.usesPlaceholder).toBe(true);
  });

  it("scrubs URLs and Latin name tokens from the Anthropic body", () => {
    const prepared = prepareFillFormForAnthropic({
      studentName: "נועה כץ",
      teacherNotes: "Noa https://x.com/noa-katz Noah Katz Kats",
      exampleTemplate: "",
      studentContext: { notes: "Noa" },
      fieldSummaries: [
        {
          key: "strengths",
          label: "חוזקות",
          type: "textarea",
          currentValue: "Noa and Katz",
        },
      ],
      maxNotesChars: 2000,
      maxExampleChars: 12_000,
    });
    const requestBody = JSON.stringify({
      system: prepared.promptLines.join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            teacherNotes: prepared.teacherNotes,
            studentContext: prepared.studentContext,
            fields: prepared.fields,
          }),
        },
      ],
    });
    expect(requestBody).toContain("[קישור הוסר]");
    expect(requestBody).not.toMatch(/https?:\/\//i);
    expect(requestBody).not.toMatch(/\bNoa\b/i);
    expect(requestBody).not.toMatch(/\bNoah\b/i);
    expect(requestBody).not.toMatch(/\bKatz\b/i);
    expect(requestBody).not.toMatch(/\bKats\b/i);
    expect(requestBody).not.toContain("נועה");
    expect(requestBody).not.toContain("כץ");
  });

  it("drops currentValue of father/mother/parent/guardian fields", () => {
    const prepared = prepareFillFormForAnthropic({
      studentName: "נועה כהן",
      teacherNotes: "",
      exampleTemplate: "",
      studentContext: {},
      fieldSummaries: [
        {
          key: "father",
          label: "שם האב",
          type: "text",
          currentValue: "דוד כהן",
        },
        {
          key: "mother",
          label: "Mother",
          type: "text",
          currentValue: "רותי לוי",
        },
        {
          key: "custom_note",
          label: "הורה",
          type: "text",
          currentValue: "שם הורה סודי",
        },
        {
          key: "guardian",
          label: "אפוטרופוס",
          type: "text",
          currentValue: "אפוטרופוס סודי",
        },
        {
          key: "strengths",
          label: "חוזקות",
          type: "textarea",
          currentValue: "משתפת",
        },
      ],
      maxNotesChars: 2000,
      maxExampleChars: 12_000,
    });
    expect(prepared.fields.find((f) => f.key === "father")?.currentValue).toBeUndefined();
    expect(prepared.fields.find((f) => f.key === "mother")?.currentValue).toBeUndefined();
    expect(prepared.fields.find((f) => f.key === "guardian")?.currentValue).toBeUndefined();
    expect(prepared.fields.find((f) => f.key === "custom_note")?.currentValue).toBeUndefined();
    expect(prepared.fields.find((f) => f.key === "strengths")?.currentValue).toBe("משתפת");
  });

  it("strips invented tokens and numbers issued tokens past teacher literals", () => {
    const prepared = prepareFillFormForAnthropic({
      studentName: "נועה כהן",
      teacherNotes: "הערה עם [[NAME_1]] ליד נועה",
      exampleTemplate: "",
      studentContext: {},
      fieldSummaries: [
        {
          key: "strengths",
          label: "חוזקות",
          type: "textarea",
          currentValue: "משתפת",
        },
      ],
      maxNotesChars: 2000,
      maxExampleChars: 12_000,
    });
    expect(prepared.teacherNotes).toContain("[[NAME_1]]");
    expect(prepared.teacherNotes).not.toContain("נועה");
    expect(Object.keys(prepared.restoreMap)).not.toContain("NAME_1");
    expect(prepared.teacherLiterals).toContain("[[NAME_1]]");

    const restored = restoreFillFormFields(
      {
        strengths: `${STUDENT_PLACEHOLDER} ו[[NAME_99]] ו[[NAME_1]]`,
      },
      prepared.firstName,
      prepared.restoreMap,
      prepared.teacherLiterals
    );
    expect(restored.strengths).toBe("נועה ו ו[[NAME_1]]");
    expect(restored.strengths).not.toContain("[[NAME_99]]");
  });

  it("includes the shared token prompt block and not אך ורק [[PUPIL]]", () => {
    const joined = fillFormPlaceholderPromptLines().join("\n");
    for (const line of studentNameTokenPromptLines()) {
      expect(joined).toContain(line);
    }
    expect(joined).not.toMatch(/אך ורק[^\n]{0,80}\[\[PUPIL\]\]/);
  });

  it("extract-example and fill-examples do not call Anthropic", () => {
    const extract = routeSource("src/app/api/ai/extract-example/route.ts");
    const fillExamples = routeSource("src/app/api/ai/fill-examples/route.ts");
    expect(extract).not.toMatch(/anthropic/i);
    expect(fillExamples).not.toMatch(/anthropic/i);
    expect(extract).not.toMatch(/ANTHROPIC/);
    expect(fillExamples).not.toMatch(/ANTHROPIC/);
  });
});
