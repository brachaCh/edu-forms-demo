import { describe, expect, it } from "vitest";
import {
  isIdentifyingAiFieldKey,
  sanitizeAiFieldSummaries,
  sanitizeFreeTextForAi,
  sanitizeStudentContextForAi,
  scrubIdentifyingPatterns,
} from "./ai-privacy";

describe("ai-privacy", () => {
  it("flags identifying field keys", () => {
    expect(isIdentifyingAiFieldKey("full_name")).toBe(true);
    expect(isIdentifyingAiFieldKey("student_id_number")).toBe(true);
    expect(isIdentifyingAiFieldKey("father_phone")).toBe(true);
    expect(isIdentifyingAiFieldKey("parents_email")).toBe(true);
    expect(isIdentifyingAiFieldKey("teacher_name")).toBe(true);
    expect(isIdentifyingAiFieldKey("current_status")).toBe(false);
    expect(isIdentifyingAiFieldKey("gender")).toBe(false);
    expect(isIdentifyingAiFieldKey("father")).toBe(true);
    expect(isIdentifyingAiFieldKey("mother")).toBe(true);
    expect(isIdentifyingAiFieldKey("parent")).toBe(true);
    expect(isIdentifyingAiFieldKey("guardian")).toBe(true);
    expect(isIdentifyingAiFieldKey("אב")).toBe(true);
    expect(isIdentifyingAiFieldKey("הורה")).toBe(true);
  });

  it("keeps only safe student context keys and scrubs notes", () => {
    const sanitized = sanitizeStudentContextForAi({
      full_name: "נועה כהן",
      teacher_name: "רותי לוי",
      gender: "נ",
      status: "integration",
      class_name: "ג1",
      notes: "ליצור קשר ב-050-1234567 או test@example.com ת.ז. 123456782",
      id_number: "123456782",
    });
    expect(sanitized).toEqual({
      gender: "נ",
      status: "integration",
      class_name: "ג1",
      notes: expect.stringContaining("[טלפון הוסר]"),
    });
    expect(sanitized.notes).toContain("[מייל הוסר]");
    expect(sanitized.notes).toContain("[ת.ז. הוסרה]");
    expect(sanitized).not.toHaveProperty("full_name");
    expect(sanitized).not.toHaveProperty("teacher_name");
    expect(sanitized).not.toHaveProperty("id_number");
  });

  it("strips current values from identifying fields", () => {
    const fields = sanitizeAiFieldSummaries([
      {
        key: "full_name",
        label: "שם",
        type: "text",
        currentValue: "נועה כהן",
      },
      {
        key: "baseline",
        label: "קו בסיס",
        type: "textarea",
        currentValue: "מתקשה בקריאה",
      },
    ]);
    expect(fields[0].currentValue).toBeUndefined();
    expect(fields[1].currentValue).toBe("מתקשה בקריאה");
  });

  it("strips current values from parent/guardian keys and Hebrew labels", () => {
    const fields = sanitizeAiFieldSummaries([
      {
        key: "father",
        label: "שם האב",
        type: "text",
        currentValue: "דוד כהן",
      },
      {
        key: "note_x",
        label: "הורה",
        type: "text",
        currentValue: "שם סודי",
      },
      {
        key: "baseline",
        label: "קו בסיס",
        type: "textarea",
        currentValue: "מתקשה בקריאה",
      },
    ]);
    expect(fields[0].currentValue).toBeUndefined();
    expect(fields[1].currentValue).toBeUndefined();
    expect(fields[2].currentValue).toBe("מתקשה בקריאה");
  });

  it("scrubs patterns in free text", () => {
    expect(scrubIdentifyingPatterns("מייל a@b.co.il וטל 052-1112233")).toBe(
      "מייל [מייל הוסר] וטל [טלפון הוסר]"
    );
    expect(sanitizeFreeTextForAi("  hello  ", 10)).toBe("hello");
    expect(
      scrubIdentifyingPatterns("see https://x.com/noa-katz please")
    ).toBe("see [קישור הוסר] please");
    expect(scrubIdentifyingPatterns("www.example.com/path")).toBe(
      "[קישור הוסר]"
    );
  });
});
