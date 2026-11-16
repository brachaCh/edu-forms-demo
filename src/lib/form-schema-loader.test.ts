import { describe, expect, it } from "vitest";
import { FORM_SCHEMAS, getFormSchema } from "@/lib/form-schemas";

describe("form schema JSON catalog", () => {
  it("loads every exported form with a unique id", () => {
    const ids = FORM_SCHEMAS.map((schema) => schema.id);
    expect(ids).toHaveLength(55);
    expect(new Set(ids).size).toBe(55);
    expect(getFormSchema("student-questionnaire")?.folder).toBe("שאלון תלמיד");
    expect(getFormSchema("waiver-confidentiality")?.folder).toBe(
      "טופס ויתור סודיות"
    );
    expect(getFormSchema("moe-eligibility-renewal")?.folder).toBe(
      "חידוש הזכאות לשירותי חינוך מיוחדים"
    );
    expect(getFormSchema("moe-school-website-photo-consent")?.folder).toBe(
      "טופס לקבלת הסכמת הורה / אפוטרופוס לפעילות באתר בית הספר/ פרסום תמונות"
    );
  });
});
