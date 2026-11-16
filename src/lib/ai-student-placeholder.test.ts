import { describe, expect, it } from "vitest";
import {
  STUDENT_PLACEHOLDER,
  createNameMaskContext,
  maskStudentNamesForAi,
  nameTokenPlaceholder,
  prepareTranscriptForAi,
  restoreStudentFirstName,
  studentNamePartsForAi,
  studentNameTokenPromptLines,
  type NameMaskContext,
  type StudentNamePartsForAi,
} from "./ai-student-placeholder";

const PROCLITICS = ["ו", "ל", "מ", "ב", "ש", "כ", "ה"] as const;
const STACKED_PROCLITICS = ["ול", "וכש"] as const;
const ALL_PREFIXES = [...PROCLITICS, ...STACKED_PROCLITICS];
const NAME_1 = nameTokenPlaceholder(1);
const NAME_2 = nameTokenPlaceholder(2);
const NAME_3 = nameTokenPlaceholder(3);
const NAME_4 = nameTokenPlaceholder(4);
const NAME_5 = nameTokenPlaceholder(5);

function maskWithCtx(
  text: string,
  parts: StudentNamePartsForAi,
  ctx: NameMaskContext = createNameMaskContext()
) {
  return { masked: maskStudentNamesForAi(text, parts, ctx), ctx };
}

function roundTrip(text: string, studentName: string) {
  const { textForModel, firstName, restoreMap, teacherLiterals } =
    prepareTranscriptForAi(text, studentName);
  return {
    textForModel,
    firstName,
    restoreMap,
    teacherLiterals,
    restored: restoreStudentFirstName(
      textForModel,
      firstName,
      restoreMap,
      teacherLiterals
    ),
  };
}

describe("studentNamePartsForAi", () => {
  it("keeps only a usable first name and last name", () => {
    expect(studentNamePartsForAi("  נועה כהן  ")).toEqual({
      firstName: "נועה",
      lastName: "כהן",
    });
  });

  it("drops ID-like tokens and single-character fragments", () => {
    expect(studentNamePartsForAi("123456782")).toEqual({
      firstName: "",
      lastName: "",
    });
    expect(studentNamePartsForAi("א")).toEqual({
      firstName: "",
      lastName: "",
    });
  });

  it("keeps a two-letter first name for restore", () => {
    expect(studentNamePartsForAi("טל כהן")).toEqual({
      firstName: "טל",
      lastName: "כהן",
    });
  });

  it("puts middle names in the last-name blob", () => {
    expect(studentNamePartsForAi("נועה רחל מרים כהן")).toEqual({
      firstName: "נועה",
      lastName: "רחל מרים כהן",
    });
  });

  it("keeps a hyphenated first name as one given name", () => {
    expect(studentNamePartsForAi("בת-שבע כהן")).toEqual({
      firstName: "בת-שבע",
      lastName: "כהן",
    });
    expect(studentNamePartsForAi("בת־שבע כהן")).toEqual({
      firstName: "בת-שבע",
      lastName: "כהן",
    });
  });

  it("uses an explicit two-word first-name field as one unit", () => {
    expect(
      studentNamePartsForAi("בת שבע כהן", { firstName: "בת שבע" })
    ).toEqual({
      firstName: "בת שבע",
      lastName: "כהן",
    });
  });

  it("infers בת/בן + next token as the first name without explicit.firstName", () => {
    expect(studentNamePartsForAi("בת שבע כהן")).toEqual({
      firstName: "בת שבע",
      lastName: "כהן",
    });
    expect(studentNamePartsForAi("בן ציון לוי")).toEqual({
      firstName: "בן ציון",
      lastName: "לוי",
    });
  });
});

describe("maskStudentNamesForAi", () => {
  it("masks first name, last name and full name with NAME_n", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    const masked = maskStudentNamesForAi(
      "נועה כהן מפגינה מוטיבציה. נועה משתפת. כהן שיתפה.",
      parts
    );
    expect(masked).toBe(
      `${NAME_1} מפגינה מוטיבציה. ${NAME_2} משתפת. ${NAME_3} שיתפה.`
    );
    expect(masked).not.toContain("נועה");
    expect(masked).not.toContain("כהן");
  });

  it("masks נועה כהן מפגינה as a single placeholder", () => {
    const masked = maskStudentNamesForAi("נועה כהן מפגינה", {
      firstName: "נועה",
      lastName: "כהן",
    });
    expect(masked).toBe(`${NAME_1} מפגינה`);
  });

  it("does not mask a longer word that only contains the name as a substring", () => {
    const masked = maskStudentNamesForAi("שירה שרה", {
      firstName: "שיר",
      lastName: "",
    });
    expect(masked).toBe("שירה שרה");
  });

  it("leaves text unchanged when no usable name exists", () => {
    expect(
      maskStudentNamesForAi("התלמידה מפגינה מוטיבציה", {
        firstName: "",
        lastName: "",
      })
    ).toBe("התלמידה מפגינה מוטיבציה");
  });

  it("masks every middle-name token as well as the full string", () => {
    const parts = studentNamePartsForAi("נועה רחל מרים כהן");
    const masked = maskStudentNamesForAi(
      "נועה רחל מרים כהן בכיתה. רחל שיתפה. מרים הקשיבה. כהן כתבה. נועה מפגינה.",
      parts
    );
    expect(masked).not.toContain("נועה");
    expect(masked).not.toContain("רחל");
    expect(masked).not.toContain("מרים");
    expect(masked).not.toContain("כהן");
    expect(masked).toBe(
      `${NAME_1} בכיתה. ${NAME_4} שיתפה. ${NAME_2} הקשיבה. ${NAME_5} כתבה. ${NAME_3} מפגינה.`
    );
  });

  it("masks a niqqud/maqaf full name without rewriting the rest of the source", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    const masked = maskStudentNamesForAi("נֹועַה־כהן", parts);
    expect(masked).toBe(NAME_1);
    expect(masked).not.toContain("נועה");
    expect(masked).not.toContain("כהן");
  });

  it("tolerates an STT space inside the first name", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    const masked = maskStudentNamesForAi("נו עה משתפת", parts);
    expect(masked).toBe(`${NAME_1} משתפת`);
    expect(masked).not.toContain("נו");
    expect(masked).not.toContain("עה");
  });

  it("matches final and non-final letter forms equivalently", () => {
    const parts = { firstName: "נועה", lastName: "כהן" };
    expect(maskStudentNamesForAi("כהנ בכיתה", parts)).toBe(`${NAME_1} בכיתה`);
  });
});

describe("Hebrew proclitics", () => {
  const parts = studentNamePartsForAi("נועה כהן");

  it.each(ALL_PREFIXES)(
    "masks first name after prefix %s and keeps the prefix",
    (prefix) => {
      const masked = maskStudentNamesForAi(`${prefix}נועה משתפת`, parts);
      expect(masked).toBe(`${prefix}${NAME_1} משתפת`);
      expect(masked).not.toContain("נועה");
    }
  );

  it.each(ALL_PREFIXES)(
    "masks last name after prefix %s and keeps the prefix",
    (prefix) => {
      const masked = maskStudentNamesForAi(`${prefix}כהן שיתפה`, parts);
      expect(masked).toBe(`${prefix}${NAME_1} שיתפה`);
      expect(masked).not.toContain("כהן");
    }
  );

  it.each(ALL_PREFIXES)(
    "masks full name after prefix %s and keeps the prefix",
    (prefix) => {
      const masked = maskStudentNamesForAi(`${prefix}נועה כהן מפגינה`, parts);
      expect(masked).toBe(`${prefix}${NAME_1} מפגינה`);
      expect(masked).not.toContain("נועה");
      expect(masked).not.toContain("כהן");
    }
  );

  it("masks stacked ולנועה in a sentence", () => {
    const masked = maskStudentNamesForAi("דיברתי עם ולנועה", parts);
    expect(masked).toBe(`דיברתי עם ול${NAME_1}`);
  });

  it("does not treat a spaced function word as an attached prefix", () => {
    const { masked, ctx } = maskWithCtx("המשימה של נועה בכיתה", parts);
    expect(masked).toBe(`המשימה של ${NAME_1} בכיתה`);
    expect(restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)).toBe(
      "המשימה של נועה בכיתה"
    );
    expect(maskStudentNamesForAi("כמו נועה", parts)).toBe(`כמו ${NAME_1}`);
    expect(maskStudentNamesForAi("למה נועה", parts)).toBe(`למה ${NAME_1}`);
  });

  it("keeps the space in של נועה so restore is not שלנועה", () => {
    const { masked, ctx } = maskWithCtx("של נועה", parts);
    expect(masked).toBe(`של ${NAME_1}`);
    expect(masked).not.toBe(`של${NAME_1}`);
    const restored = restoreStudentFirstName(
      masked,
      parts.firstName,
      ctx.restoreMap
    );
    expect(restored).toBe("של נועה");
    expect(restored).not.toBe("שלנועה");
  });
});

describe("short last names and function-word first names", () => {
  it.each(["טל", "גל", "שי", "דן"])(
    "masks two-letter first name %s standalone and with a proclitic",
    (firstName) => {
      const parts = { firstName, lastName: "כהן" };
      expect(maskStudentNamesForAi(`${firstName} מפגין`, parts)).toBe(
        `${NAME_1} מפגין`
      );
      expect(maskStudentNamesForAi(`ל${firstName} משימה`, parts)).toBe(
        `ל${NAME_1} משימה`
      );
    }
  );

  it.each(["כץ", "בר", "חן", "טל"])(
    "masks two-letter last name %s even without the first name",
    (lastName) => {
      const masked = maskStudentNamesForAi(`${lastName} בכיתה`, {
        firstName: "",
        lastName,
      });
      expect(masked).toBe(`${NAME_1} בכיתה`);
      expect(masked).not.toContain(lastName);
      expect(restoreStudentFirstName(masked, "")).not.toContain(lastName);
    }
  );

  it("masks a function-word first name לי and restores it only for the teacher", () => {
    const parts = studentNamePartsForAi("לי כהן");
    const { masked, ctx } = maskWithCtx("יש לי קושי", parts);
    expect(masked).toBe(`יש ${NAME_1} קושי`);
    expect(masked).not.toContain("לי");
    expect(restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)).toBe(
      "יש לי קושי"
    );
  });

  it("still masks the surname when the first name is לי", () => {
    const parts = studentNamePartsForAi("לי כהן");
    const masked = maskStudentNamesForAi("לי כהן מפגינה", parts);
    expect(masked).toBe(`${NAME_1} מפגינה`);
    expect(masked).not.toContain("לי");
    expect(masked).not.toContain("כהן");
  });
});

describe("apostrophe-equivalent first names", () => {
  const parts = { firstName: "ג'ני", lastName: "כהן" };

  it.each(["ג'ני", "ג׳ני", "ג’ני", "ג`ני", "גני"] as const)(
    "masks %s for a card name ג'ני",
    (spoken) => {
      const masked = maskStudentNamesForAi(`${spoken} משתפת`, parts);
      expect(masked).toBe(`${NAME_1} משתפת`);
      expect(masked).not.toContain("גני");
      expect(masked).not.toContain("ג'ני");
    }
  );
});

describe("A1 gershayim and skippable marks", () => {
  const MARKS = [
    "\u0022",
    "\u05F4",
    "\u02BC",
    "\u02BB",
    "\u2018",
    "\u00B4",
    "\u05F3",
    "\u0027",
    "\u2019",
    "\u0060",
  ] as const;

  it("does not leak כץ when the text has כ\"ץ", () => {
    const parts = studentNamePartsForAi("נועה כץ");
    const text = 'נועה כ"ץ בכיתה';
    const masked = maskStudentNamesForAi(text, parts);
    expect(masked).toBe(`${NAME_1} בכיתה`);
    expect(masked).not.toContain("כץ");
    expect(masked).not.toContain('כ"ץ');
    expect(masked).not.toContain("נועה");
  });

  it("does not leak גיבלי when the text has a modifier letter apostrophe", () => {
    const parts = studentNamePartsForAi("נועה גיבלי");
    const text = "נועה ג\u02BCיבלי בכיתה";
    const masked = maskStudentNamesForAi(text, parts);
    expect(masked).not.toContain("גיבלי");
    expect(masked).not.toContain("\u02BC");
    expect(masked).not.toContain("נועה");
    expect(masked).toBe(`${NAME_1} בכיתה`);
  });

  it.each(MARKS)(
    "treats mark U+%s as skippable in the last name and the text",
    (mark) => {
      const parts = studentNamePartsForAi(`נועה כ${mark}ץ`);
      const spoken = `כ${mark}ץ`;
      const masked = maskStudentNamesForAi(`${spoken} בכיתה`, parts);
      expect(masked).toBe(`${NAME_1} בכיתה`);
      expect(masked).not.toContain("כץ");
      expect(masked).not.toContain(spoken);
    }
  );
});

describe("A2 ו/י spelling variants", () => {
  it("masks נעה when the card name is נועה", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    const masked = maskStudentNamesForAi("נעה משתפת", parts);
    expect(masked).toBe(`${NAME_1} משתפת`);
    expect(masked).not.toContain("נעה");
    expect(masked).not.toContain("נועה");
  });

  it("masks נועה when the card name is נעה", () => {
    const parts = studentNamePartsForAi("נעה כהן");
    const masked = maskStudentNamesForAi("נועה משתפת", parts);
    expect(masked).toBe(`${NAME_1} משתפת`);
    expect(masked).not.toContain("נעה");
    expect(masked).not.toContain("נועה");
  });

  it("masks דויד when the card name is דוד", () => {
    const parts = studentNamePartsForAi("דוד כהן");
    const masked = maskStudentNamesForAi("דויד משתף", parts);
    expect(masked).toBe(`${NAME_1} משתף`);
    expect(masked).not.toContain("דוד");
    expect(masked).not.toContain("דויד");
  });

  it("masks דוד when the card name is דויד", () => {
    const parts = studentNamePartsForAi("דויד כהן");
    const masked = maskStudentNamesForAi("דוד משתף", parts);
    expect(masked).toBe(`${NAME_1} משתף`);
    expect(masked).not.toContain("דוד");
    expect(masked).not.toContain("דויד");
  });

  it("masks נועמי when the card name is נעמי", () => {
    const parts = studentNamePartsForAi("נעמי כהן");
    expect(maskStudentNamesForAi("נועמי משתפת", parts)).toBe(
      `${NAME_1} משתפת`
    );
    expect(maskStudentNamesForAi("נעמי משתפת", parts)).toBe(
      `${NAME_1} משתפת`
    );
  });

  it("still matches a niqqud spelling of נועה / נעה", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    expect(maskStudentNamesForAi("נֹועָה משתפת", parts)).toBe(
      `${NAME_1} משתפת`
    );
    expect(maskStudentNamesForAi("נְעָה משתפת", parts)).toBe(
      `${NAME_1} משתפת`
    );
  });

  it("does not treat מיכל and מיכאל as the same name", () => {
    expect(
      maskStudentNamesForAi("מיכאל בכיתה", {
        firstName: "מיכל",
        lastName: "",
      })
    ).toBe("מיכאל בכיתה");
    expect(
      maskStudentNamesForAi("מיכל בכיתה", {
        firstName: "מיכאל",
        lastName: "",
      })
    ).toBe("מיכל בכיתה");
  });
});

describe("B4 distinct placeholders", () => {
  it("does not turn מתקדמת טוב into מתקדמת דנה", () => {
    const { restored, textForModel } = roundTrip("מתקדמת טוב", "דנה טוב");
    expect(textForModel).toBe(`מתקדמת ${NAME_1}`);
    expect(textForModel).not.toContain("טוב");
    expect(textForModel).not.toContain("דנה");
    expect(restored).toBe("מתקדמת טוב");
    expect(restored).not.toBe("מתקדמת דנה");
  });

  it("does not turn אמרה שלום into אמרה דנה", () => {
    const { restored, textForModel } = roundTrip("אמרה שלום", "דנה שלום");
    expect(textForModel).not.toContain("שלום");
    expect(textForModel).not.toContain("דנה");
    expect(restored).toBe("אמרה שלום");
    expect(restored).not.toBe("אמרה דנה");
  });

  it("does not turn בן חיים into דוד", () => {
    const { restored, textForModel } = roundTrip("בן חיים", "דוד בן חיים");
    expect(textForModel).not.toContain("דוד");
    expect(textForModel).not.toContain("בן");
    expect(textForModel).not.toContain("חיים");
    expect(restored).toBe("בן חיים");
    expect(restored).not.toBe("דוד");
  });

  it("restores NAME_n to the exact original surface including gershayim", () => {
    const parts = studentNamePartsForAi("נועה כץ");
    const { masked, ctx } = maskWithCtx('כתבה כ"ץ ביומן', parts);
    expect(masked).toBe(`כתבה ${NAME_1} ביומן`);
    expect(restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)).toBe(
      'כתבה כ"ץ ביומן'
    );
  });

  it("leaves teacher-typed [[NAME_1]] when the masker did not issue it", () => {
    expect(
      restoreStudentFirstName(
        `${STUDENT_PLACEHOLDER} מתקדמת. [[FOO]] ו[[NAME_1]] נשארו.`,
        "נועה",
        { NAME_2: "כהן" },
        ["[[NAME_1]]"]
      )
    ).toBe("נועה מתקדמת. [[FOO]] ו[[NAME_1]] נשארו.");
  });
});

describe("B5 בת/בן two-token first name", () => {
  it("restores בת שבע מתקשה. שבע שנים exactly", () => {
    const source = "בת שבע מתקשה. שבע שנים";
    const { textForModel, firstName, restoreMap, restored } = roundTrip(
      source,
      "בת שבע כהן"
    );
    expect(firstName).toBe("בת שבע");
    expect(textForModel).not.toContain("בת");
    expect(textForModel).not.toContain("שבע");
    expect(textForModel).not.toContain("כהן");
    expect(restored).toBe(source);
    expect(restored).not.toContain("בת בת");
    expect(restored).not.toBe("בת שבע מתקשה. בת שנים");
    expect(restoreStudentFirstName(textForModel, firstName, restoreMap)).not.toMatch(
      /בת בת|בת שנים/
    );
  });
});

describe("B6 generic restore stays generic in placeholder mode", () => {
  it("does not rewrite התלמידה into the first name", () => {
    const source = "התלמידה שיושבת לידה מפריעה לדנה";
    const { textForModel, firstName, restoreMap } = prepareTranscriptForAi(
      source,
      "דנה כהן"
    );
    expect(textForModel).toBe(`התלמידה שיושבת לידה מפריעה ל${NAME_1}`);
    expect(
      restoreStudentFirstName(textForModel, firstName, restoreMap)
    ).toBe(source);
    expect(
      restoreStudentFirstName(
        "התלמידה שיושבת לידה מפריעה לדנה",
        "דנה"
      )
    ).toBe("התלמידה שיושבת לידה מפריעה לדנה");
  });
});

describe("restoreStudentFirstName", () => {
  it("restores the placeholder to the first name only", () => {
    expect(
      restoreStudentFirstName(
        `${STUDENT_PLACEHOLDER} מפגינה מוטיבציה ו${STUDENT_PLACEHOLDER} משתפת.`,
        "נועה"
      )
    ).toBe("נועה מפגינה מוטיבציה ונועה משתפת.");
  });

  it("keeps proclitic grammar attached to the placeholder", () => {
    expect(
      restoreStudentFirstName(`נתתי ל${STUDENT_PLACEHOLDER} משימה.`, "נועה")
    ).toBe("נתתי לנועה משימה.");
  });

  it("does not rewrite definite התלמיד/ה or לתלמידה", () => {
    expect(
      restoreStudentFirstName(
        "התלמידה מפגינה. נתתי לתלמידה משימה. שמעתי מהתלמידה. והתלמיד משתף.",
        "נועה"
      )
    ).toBe(
      "התלמידה מפגינה. נתתי לתלמידה משימה. שמעתי מהתלמידה. והתלמיד משתף."
    );
  });

  it("does not rewrite bare תלמיד / תלמידה", () => {
    expect(restoreStudentFirstName("היא תלמידה מצטיינת", "נועה")).toBe(
      "היא תלמידה מצטיינת"
    );
    expect(restoreStudentFirstName("כמו כל תלמיד אחר", "נועה")).toBe(
      "כמו כל תלמיד אחר"
    );
    expect(restoreStudentFirstName("ראיתי בתלמיד התקדמות.", "נועה")).toBe(
      "ראיתי בתלמיד התקדמות."
    );
  });

  it("leaves slash forms and plurals alone", () => {
    const restored = restoreStudentFirstName(
      "התלמיד/ה בקבוצה עם תלמידים אחרים ותלמידות נוספות.",
      "יוסי"
    );
    expect(restored).toBe("התלמיד/ה בקבוצה עם תלמידים אחרים ותלמידות נוספות.");
  });

  it("does not restore when first name is missing or ID-like", () => {
    expect(restoreStudentFirstName("התלמידה מפגינה", "")).toBe(
      "התלמידה מפגינה"
    );
    expect(restoreStudentFirstName("התלמידה מפגינה", "123456782")).toBe(
      "התלמידה מפגינה"
    );
  });

  it("never puts a last name back into the text", () => {
    const restored = restoreStudentFirstName(
      `${STUDENT_PLACEHOLDER} מפגינה`,
      "נועה"
    );
    expect(restored).toBe("נועה מפגינה");
    expect(restored).not.toContain("כהן");
  });

  it("restores a hyphenated first name in full, not only the first token", () => {
    const { textForModel, firstName, restoreMap } = prepareTranscriptForAi(
      "בת-שבע מפגינה מוטיבציה ובת שבע משתפת",
      "בת-שבע כהן"
    );
    expect(firstName).toBe("בת-שבע");
    expect(textForModel).toBe(
      `${NAME_1} מפגינה מוטיבציה ו${NAME_2} משתפת`
    );
    expect(textForModel).not.toContain("בת");
    expect(textForModel).not.toContain("שבע");
    expect(textForModel).not.toContain("כהן");
    expect(restoreStudentFirstName(textForModel, firstName, restoreMap)).toBe(
      "בת-שבע מפגינה מוטיבציה ובת שבע משתפת"
    );
    expect(
      restoreStudentFirstName(`${STUDENT_PLACEHOLDER} מפגינה`, "בת-שבע")
    ).toBe("בת-שבע מפגינה");
  });

  it("treats a two-word first name as one unit and keeps the spaced spelling", () => {
    const parts = studentNamePartsForAi("בת שבע כהן", { firstName: "בת שבע" });
    expect(parts.firstName).toBe("בת שבע");
    const { masked, ctx } = maskWithCtx(
      "בת שבע מפגינה. היא בת חמש.",
      parts
    );
    expect(masked).not.toContain("שבע");
    expect(masked).toBe(
      `${NAME_1} מפגינה. היא ${NAME_2} חמש.`
    );
    expect(
      restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)
    ).toBe("בת שבע מפגינה. היא בת חמש.");
    expect(
      restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)
    ).not.toContain("בת-שבע");
    expect(
      restoreStudentFirstName(masked, parts.firstName, ctx.restoreMap)
    ).not.toBe("בת בת מפגינה. היא בת חמש.");
  });

  it("does not turn כתלמיד / כתלמידה into כ + first name", () => {
    expect(restoreStudentFirstName("משולב כתלמיד בכיתה", "נועה")).toBe(
      "משולב כתלמיד בכיתה"
    );
    expect(restoreStudentFirstName("מוכרת כתלמידה בבית הספר", "נועה")).toBe(
      "מוכרת כתלמידה בבית הספר"
    );
  });

  it.each([
    ["[PUPIL] מפגינה", "נועה מפגינה"],
    ["PUPIL מפגינה", "נועה מפגינה"],
    ["[[ PUPIL ]] מפגינה", "נועה מפגינה"],
    [`${STUDENT_PLACEHOLDER} מפגינה`, "נועה מפגינה"],
  ] as const)("restores model echo %s", (input, expected) => {
    expect(restoreStudentFirstName(input, "נועה")).toBe(expected);
  });
});

describe("prepareTranscriptForAi", () => {
  it("masks identifying names for the model and exposes first name for restore", () => {
    const { textForModel, firstName, restoreMap } = prepareTranscriptForAi(
      "דיברתי עם נועה כהן ועם נועה בכיתה",
      "נועה כהן"
    );
    expect(firstName).toBe("נועה");
    expect(textForModel).toBe(
      `דיברתי עם ${NAME_1} ועם ${NAME_2} בכיתה`
    );
    expect(restoreStudentFirstName(textForModel, firstName, restoreMap)).toBe(
      "דיברתי עם נועה כהן ועם נועה בכיתה"
    );
  });

  it("round-trips a model-style response without rewriting generic wording", () => {
    const { firstName } = prepareTranscriptForAi(
      "נועה מתקשה בוויסות",
      "נועה לוי"
    );
    const modelOutput = `${STUDENT_PLACEHOLDER} מתקשה בוויסות. התלמידה זקוקה לתיווך.`;
    expect(restoreStudentFirstName(modelOutput, firstName)).toBe(
      "נועה מתקשה בוויסות. התלמידה זקוקה לתיווך."
    );
  });

  it("still scrubs phones and IDs when no usable name is supplied", () => {
    const { textForModel, firstName } = prepareTranscriptForAi(
      "אין שם בכרטיס אבל יש 050-1234567 וגם ת.ז. 123456782",
      null
    );
    expect(firstName).toBe("");
    expect(textForModel).toContain("[טלפון הוסר]");
    expect(textForModel).toContain("[ת.ז. הוסרה]");
    expect(textForModel).not.toMatch(/050/);
    expect(textForModel).not.toMatch(/123456782/);
  });

  it("keeps original hyphens, dates and ranges outside name spans", () => {
    const { textForModel } = prepareTranscriptForAi(
      "בטווח 8-10 היה דו-שיח ב-12-10-2026 עם נועה",
      "נועה כהן"
    );
    expect(textForModel).toBe(
      `בטווח 8-10 היה דו-שיח ב-12-10-2026 עם ${NAME_1}`
    );
    expect(textForModel).toContain("8-10");
    expect(textForModel).toContain("דו-שיח");
    expect(textForModel).toContain("12-10-2026");
  });
});

describe("R4 optional ו/י must not rewrite common words", () => {
  it.each([
    ["יעל כהן", "מתקשה על המשימה"],
    ["אלי כהן", "אל המורה"],
    ["חיים כהן", "חם מאוד"],
    ["דן כהן", "פסק דין"],
    ["רון כהן", "רן מהר"],
  ] as const)("«%s» leaves %s unchanged after mask/restore", (card, source) => {
    const { textForModel, firstName, restoreMap, restored } = roundTrip(
      source,
      card
    );
    expect(restored).toBe(source);
    const first = studentNamePartsForAi(card).firstName;
    expect(textForModel).not.toContain(first);
    expect(restored).not.toBe(source.replace(/\S+$/, first));
  });

  it("does not mask בית for a two-letter first name בת", () => {
    const parts = studentNamePartsForAi("בת שבע כהן", { firstName: "בת שבע" });
    const masked = maskStudentNamesForAi("גרה בבית הספר", parts);
    expect(masked).toContain("בית");
    expect(masked).not.toContain("בת שבע");
  });
});

describe("R4 URLs and Latin romanizations", () => {
  it("scrubs URLs and masks Noa/Noah/Katz so they never reach the model", () => {
    const source =
      "Noa and Noah met Cohen. See https://x.com/noa-katz and Katz / Kats / Levi / Levy / Yael / David / Kohen.";
    const { textForModel, firstName, restoreMap, restored } = roundTrip(
      source,
      "נועה כץ"
    );
    expect(textForModel).toContain("[קישור הוסר]");
    expect(textForModel).not.toMatch(/https?:\/\//i);
    expect(textForModel).not.toMatch(/x\.com/i);
    expect(textForModel).not.toMatch(/\bNoa\b/i);
    expect(textForModel).not.toMatch(/\bNoah\b/i);
    expect(textForModel).not.toMatch(/\bKatz\b/i);
    expect(textForModel).not.toMatch(/\bKats\b/i);
    expect(textForModel).not.toContain("נועה");
    expect(textForModel).not.toContain("כץ");

    const yael = prepareTranscriptForAi("Yael helped Cohen / Kohen.", "יעל כהן");
    expect(yael.textForModel).not.toMatch(/\bYael\b/i);
    expect(yael.textForModel).not.toMatch(/\bCohen\b/i);
    expect(yael.textForModel).not.toMatch(/\bKohen\b/i);

    const david = prepareTranscriptForAi("David and Levi / Levy", "דוד לוי");
    expect(david.textForModel).not.toMatch(/\bDavid\b/i);
    expect(david.textForModel).not.toMatch(/\bLevi\b/i);
    expect(david.textForModel).not.toMatch(/\bLevy\b/i);

    expect(restoreStudentFirstName(textForModel, firstName, restoreMap)).toContain(
      "Noa"
    );
    expect(restored).toContain("[קישור הוסר]");
  });
});

describe("R5 invented tokens and teacher-literal collisions", () => {
  it("remaps teacher-typed [[PUPIL]] so a new model [[PUPIL]] still restores the first name", () => {
    const source = "כתבתי [[PUPIL]] ליד נועה";
    const { textForModel, firstName, restoreMap, teacherLiterals, restored } =
      roundTrip(source, "נועה כהן");
    expect(textForModel).not.toContain("[[PUPIL]]");
    expect(textForModel).not.toContain("נועה");
    expect(restored).toBe(source);
    expect(
      restoreStudentFirstName(
        `${STUDENT_PLACEHOLDER} מפגינה`,
        firstName,
        restoreMap,
        teacherLiterals
      )
    ).toBe("נועה מפגינה");
  });

  it("strips invented [[NAME_n]] / [[PUPIL]]-like tokens the masker did not issue", () => {
    const restored = restoreStudentFirstName(
      `${STUDENT_PLACEHOLDER} מפגינה. נשאר [[NAME_99]] וגם [NAME_7].`,
      "נועה",
      { NAME_1: "כהן" }
    );
    expect(restored).toBe("נועה מפגינה. נשאר  וגם .");
    expect(restored).not.toContain("[[NAME_99]]");
    expect(restored).not.toContain("[NAME_7]");
    expect(restored).not.toContain("NAME_99");
  });

  it("keeps a teacher-typed [[NAME_99]] literal and does not collide issued tokens with it", () => {
    const source = "כתבתי [[NAME_1]] וגם [[NAME_99]] ליד נועה";
    const { textForModel, firstName, restoreMap, teacherLiterals, restored } =
      roundTrip(source, "נועה כהן");
    expect(textForModel).toContain("[[NAME_1]]");
    expect(textForModel).toContain("[[NAME_99]]");
    expect(textForModel).not.toContain("נועה");
    expect(Object.keys(restoreMap).some((key) => key === "NAME_1")).toBe(false);
    expect(Object.keys(restoreMap).some((key) => key === "NAME_99")).toBe(false);
    expect(teacherLiterals).toEqual(
      expect.arrayContaining(["[[NAME_1]]", "[[NAME_99]]"])
    );
    const issued = Object.keys(restoreMap);
    expect(issued.length).toBeGreaterThan(0);
    for (const key of issued) {
      const n = Number(key.slice("NAME_".length));
      expect(n).toBeGreaterThan(99);
    }
    expect(
      restoreStudentFirstName(
        `${STUDENT_PLACEHOLDER} ו[[NAME_99]]`,
        firstName,
        restoreMap,
        teacherLiterals
      )
    ).toBe("נועה ו[[NAME_99]]");
    expect(restored).toBe(source);
  });
});

describe("R5 Latin diacritics", () => {
  it("masks Yaël, Noá and Dávid after folding Latin diacritics", () => {
    const yael = prepareTranscriptForAi("Yaël helped", "יעל כהן");
    expect(yael.textForModel).not.toMatch(/Yaël|Yael/i);
    expect(yael.textForModel).toMatch(/\[\[NAME_\d+\]\]/);

    const noa = prepareTranscriptForAi("Noá wrote", "נועה כהן");
    expect(noa.textForModel).not.toMatch(/Noá|Noa/i);
    expect(noa.textForModel).toMatch(/\[\[NAME_\d+\]\]/);

    const david = prepareTranscriptForAi("Dávid read", "דוד כהן");
    expect(david.textForModel).not.toMatch(/Dávid|David/i);
    expect(david.textForModel).toMatch(/\[\[NAME_\d+\]\]/);
  });
});

describe("hyphenated surnames and Latin possessives", () => {
  it("masks each part of לוי-כהן when the part appears alone", () => {
    const parts = studentNamePartsForAi("נועה לוי-כהן");
    expect(parts.lastName).toBe("לוי-כהן");

    const full = maskStudentNamesForAi("לוי-כהן בכיתה", parts);
    expect(full).toBe(`${NAME_1} בכיתה`);
    expect(full).not.toContain("לוי");
    expect(full).not.toContain("כהן");

    const cohen = maskStudentNamesForAi("כהן שיתפה", parts);
    expect(cohen).toBe(`${NAME_1} שיתפה`);
    expect(cohen).not.toContain("כהן");

    const levi = maskStudentNamesForAi("לוי בכיתה", parts);
    expect(levi).toBe(`${NAME_1} בכיתה`);
    expect(levi).not.toContain("לוי");
  });

  it("masks maqaf-separated surname parts", () => {
    const parts = studentNamePartsForAi("נועה לוי־כהן");
    expect(maskStudentNamesForAi("לוי־כהן בכיתה", parts)).not.toContain("לוי");
    expect(maskStudentNamesForAi("כהן בכיתה", parts)).not.toContain("כהן");
    expect(maskStudentNamesForAi("לוי בכיתה", parts)).not.toContain("לוי");
  });

  it("masks en-dash and em-dash surname parts", () => {
    const en = { firstName: "נועה", lastName: "לוי–כהן" };
    expect(maskStudentNamesForAi("כהן בכיתה", en)).not.toContain("כהן");
    const em = { firstName: "נועה", lastName: "לוי—כהן" };
    expect(maskStudentNamesForAi("לוי בכיתה", em)).not.toContain("לוי");
  });

  it("keeps a Latin suffix after a Hebrew name, like a proclitic prefix", () => {
    const parts = studentNamePartsForAi("נועה כהן");
    expect(maskStudentNamesForAi("לנועה משימה", parts)).toBe(`ל${NAME_1} משימה`);
    const masked = maskStudentNamesForAi("נועה's file", parts);
    expect(masked).toBe(`${NAME_1}'s file`);
    expect(masked).not.toContain("נועה");
  });

  it("masks Noa's while keeping the possessive suffix", () => {
    const { textForModel, restored } = roundTrip("Noa's file", "נועה כהן");
    expect(textForModel).toBe(`${NAME_1}'s file`);
    expect(textForModel).not.toMatch(/Noa/i);
    expect(restored).toBe("Noa's file");
  });

  it("masks Cohen’s (curly apostrophe) while keeping the suffix", () => {
    const source = "Cohen’s notes";
    const { textForModel, restored } = roundTrip(source, "נועה כהן");
    expect(textForModel).toBe(`${NAME_1}’s notes`);
    expect(textForModel).not.toMatch(/Cohen/i);
    expect(restored).toBe(source);
  });

  it("round-trips hyphenated surname parts as written", () => {
    const source = "לוי-כהן בכיתה. כהן שיתפה. לוי הקשיב.";
    const { textForModel, restored } = roundTrip(source, "נועה לוי-כהן");
    expect(textForModel).toMatch(
      /\[\[NAME_\d+\]\] בכיתה\. \[\[NAME_\d+\]\] שיתפה\. \[\[NAME_\d+\]\] הקשיב\./
    );
    expect(textForModel).not.toContain("לוי");
    expect(textForModel).not.toContain("כהן");
    expect(restored).toBe(source);
  });
});

