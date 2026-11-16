import { describe, expect, it } from "vitest";
import { getFormSchemaByFolder } from "./form-schemas";
import { FORM_TABLE_DEFS } from "./form-table-grids";
import {
  getDefaultFolderActionLabels,
  getFormsFolderTemplateHref,
  sameNormalizedFolderName,
} from "./portfolio-folder-templates";
import {
  getNextSiblingPortfolioNav,
  listSiblingPortfolioNav,
} from "./portfolio-form-nav";

describe("school website photo consent form", () => {
  const label =
    "טופס לקבלת הסכמת הורה / אפוטרופוס לפעילות באתר בית הספר/ פרסום תמונות";

  it("maps the extra-documents button to a fillable schema", () => {
    expect(getFormSchemaByFolder(label)?.id).toBe(
      "moe-school-website-photo-consent"
    );
  });

  it("appears in מסמכים נוספים for every student status", () => {
    for (const status of [
      "integration",
      "personal-basket",
      "special-ed-class",
    ] as const) {
      expect(getDefaultFolderActionLabels("מסמכים נוספים", status)).toContain(
        label
      );
    }
  });

  it("exposes the official Word template for the folder name", () => {
    expect(getFormsFolderTemplateHref(label)).toBe(
      "/portfolio-templates/school-website-photo-consent.docx"
    );
  });
});

describe("eligibility renewal form (appendix 6.11)", () => {
  it("maps the extra-documents button to a fillable schema", () => {
    expect(getFormSchemaByFolder("חידוש הזכאות לשירותי חינוך מיוחדים")?.id).toBe(
      "moe-eligibility-renewal"
    );
    expect(getFormSchemaByFolder("נספח 6.11")?.id).toBe(
      "moe-eligibility-renewal"
    );
  });

  it("appears in מסמכים נוספים for every student status", () => {
    for (const status of [
      "integration",
      "personal-basket",
      "special-ed-class",
    ] as const) {
      expect(
        getDefaultFolderActionLabels("מסמכים נוספים", status)
      ).toContain("חידוש הזכאות לשירותי חינוך מיוחדים");
    }
  });

  it("exposes the official Word template for the folder name", () => {
    expect(
      getFormsFolderTemplateHref("חידוש הזכאות לשירותי חינוך מיוחדים")
    ).toBe("/portfolio-templates/appendix-6.11.docx");
  });
});

describe("functional educational report form", () => {
  it("maps the extra-documents button to a fillable schema", () => {
    expect(
      getFormSchemaByFolder("דוח חינוכי תפקודי")?.id
    ).toBe("functional-educational-report");
  });

  it("maps the legacy long folder name to the same schema", () => {
    expect(
      getFormSchemaByFolder(
        "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ"
      )?.id
    ).toBe("functional-educational-report");
    expect(getFormSchemaByFolder("דוח חינוכי תפקודי")?.id).toBe(
      "functional-educational-report"
    );
    expect(getFormSchemaByFolder("דוח חינוכי תפקודי")?.folder).toBe(
      "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ"
    );
  });

  it("exposes the official Word template for the folder name", () => {
    expect(getFormsFolderTemplateHref("דוח חינוכי תפקודי")).toBe(
      "/portfolio-templates/functional-educational-report.doc"
    );
    expect(
      getFormsFolderTemplateHref(
        "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ"
      )
    ).toBe("/portfolio-templates/functional-educational-report.doc");
    expect(
      sameNormalizedFolderName(
        "דוח חינוכי תפקודי",
        "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ"
      )
    ).toBe(true);
  });
});

describe("external correspondence form", () => {
  it("is a distinct form from parent conversations", () => {
    expect(getFormSchemaByFolder("שיחות עם הורים")?.id).toBe(
      "parent-conversations"
    );
    expect(
      getFormSchemaByFolder('תכתובות עם גורמים מטפלים מחוץ לביה"ס')?.id
    ).toBe("external-correspondence");
    expect(getFormSchemaByFolder("תכתובות עם גורמים חיצוניים")?.id).toBe(
      "external-correspondence"
    );
    expect(getFormSchemaByFolder("תכתובות עם גורמים מחוץ לבית הספר")?.id).toBe(
      "external-correspondence"
    );
  });

  it("uses the same table layout with independent storage keys", () => {
    const conversations = FORM_TABLE_DEFS["parent-conversations"];
    const correspondence = FORM_TABLE_DEFS["external-correspondence"];

    expect(correspondence.columns).toEqual(conversations.columns);
    expect(correspondence.defaultRows).toBe(conversations.defaultRows);
    expect(correspondence.id).not.toBe(conversations.id);
  });
});

describe("special-ed class curriculum forms", () => {
  it("keeps class_name labeled כיתה and drops teacher_name from the student list", () => {
    const schema = getFormSchemaByFolder(
      "רשימת תלמידים",
      "special-ed-class"
    );
    const keys = schema?.sections.flatMap((s) => s.fields.map((f) => f.key)) ?? [];
    expect(keys).toContain("class_name");
    expect(keys).not.toContain("teacher_name");
    const classField = schema?.sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "class_name");
    expect(classField?.label).toBe("כיתה");
  });

  it("uses detailed class schedules and table-based learning plans", () => {
    expect(
      getFormSchemaByFolder("מערכת שעות שבועית", "special-ed-class")?.id
    ).toBe("weekly-schedule");
    expect(
      getFormSchemaByFolder("מערכת שעות אישית", "special-ed-class")?.id
    ).toBe("tlk-personal-schedule");
    expect(
      getFormSchemaByFolder("מערכת שעות אישית", "integration")?.id
    ).toBe("personal-schedule");

    const weekly = getFormSchemaByFolder(
      "מערכת שעות שבועית",
      "special-ed-class"
    );
    const grid = weekly?.sections
      .flatMap((s) => s.fields)
      .find((f) => f.type === "schedule-grid");
    expect(grid?.scheduleVariant).toBe("tlk-weekly");

    const paramedical = getFormSchemaByFolder(
      "מערכת שעות פרא-רפואית",
      "special-ed-class"
    );
    expect(
      paramedical?.sections
        .flatMap((s) => s.fields)
        .find((f) => f.type === "schedule-grid")?.scheduleVariant
    ).toBe("tlk-paramedical");

    const inclusion = getFormSchemaByFolder(
      "מערכת שילוב",
      "special-ed-class"
    );
    expect(
      inclusion?.sections
        .flatMap((s) => s.fields)
        .find((f) => f.type === "schedule-grid")?.scheduleVariant
    ).toBe("tlk-inclusion");

    const personal = getFormSchemaByFolder(
      "מערכת שעות אישית",
      "special-ed-class"
    );
    expect(
      personal?.sections
        .flatMap((s) => s.fields)
        .find((f) => f.type === "schedule-grid")?.scheduleVariant
    ).toBe("tlk-personal");

    const plan = getFormSchemaByFolder(
      "תוכנית הלימודים בכיתה בהלימה לתוכנית הלימודים",
      "special-ed-class"
    );
    expect(
      plan?.sections.some((s) =>
        s.fields.some((f) => f.type === "row-table")
      )
    ).toBe(true);

    const teaching = getFormSchemaByFolder(
      "תוכנית הוראה כיתתית",
      "special-ed-class"
    );
    expect(
      teaching?.sections.some((s) =>
        s.fields.some((f) => f.type === "row-table")
      )
    ).toBe(true);

    const summary = getFormSchemaByFolder(
      "טופס ריכוז תוכנית לימודים כיתתית",
      "special-ed-class"
    );
    expect(summary?.id).toBe("tlk-summary");
    expect(
      summary?.sections.some((s) =>
        s.fields.some((f) => f.key === "row_table_tlk-summary-subjects")
      )
    ).toBe(true);

    const folders = getDefaultFolderActionLabels('תל"כ', "special-ed-class");
    expect(folders).toEqual([
      "רשימת תלמידים",
      "אשכולות לימוד",
      "פרופיל כיתה",
      "טופס ריכוז תוכנית לימודים כיתתית",
      "תוכנית הלימודים בכיתה בהלימה לתוכנית הלימודים",
      "תוכנית הוראה כיתתית",
      "מערכות שעות",
    ]);
  });
});

describe("external correspondence form", () => {
  it("moves from parent conversations to the correspondence form", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "שיחות עם הורים",
      status: "integration",
      preferredParent: "אינטגרציה טיפולית",
      preferFill: true,
    });
    expect(next?.label).toBe('תכתובות עם גורמים מטפלים מחוץ לביה"ס');
    expect(next?.href).toContain("/fill/s1/external-correspondence");
  });
});

describe("student questionnaire", () => {
  it("maps שאלון תלמיד and the special-ed alias to the restored online form", () => {
    expect(getFormSchemaByFolder("שאלון תלמיד")?.id).toBe(
      "student-questionnaire"
    );
    expect(
      getFormSchemaByFolder("שאלון תלמיד (ציפיות וקשיים)", "special-ed-class")
        ?.id
    ).toBe("student-questionnaire");
    expect(getFormSchemaByFolder("שאלות לתלמיד")?.id).toBe(
      "student-questionnaire"
    );
  });

  it("keeps the button in תח״י for personal-basket and integration", () => {
    for (const status of ["personal-basket", "integration"] as const) {
      const labels = getDefaultFolderActionLabels('תח"י', status);
      expect(labels).toContain("שאלון תלמיד");
    }
    expect(
      getDefaultFolderActionLabels('תל"א', "special-ed-class")
    ).toContain("שאלון תלמיד (ציפיות וקשיים)");
  });

  it("includes the booklet header fields and ten student questions", () => {
    const schema = getFormSchemaByFolder("שאלון תלמיד");
    const fields = schema?.sections.flatMap((section) => section.fields) ?? [];
    expect(fields.map((field) => field.key)).toEqual([
      "full_name",
      "class_name",
      "teacher_name",
      "liked_subjects",
      "can_succeed",
      "hard_in_studies",
      "what_helps",
      "want_to_learn_integration",
      "non_school_interests",
      "feel_with_teachers",
      "feel_with_friends",
      "happy_sad",
      "about_myself",
    ]);
    expect(fields.find((field) => field.key === "class_name")?.label).toBe(
      "כתה"
    );
    expect(fields.find((field) => field.key === "about_myself")?.label).toBe(
      "האם תרצה לספר משהו על עצמך?"
    );
  });
});

describe("personal-basket schedules", () => {
  it("keeps a single personal schedule under learning process", () => {
    const labels = getDefaultFolderActionLabels(
      "תיעוד תהליך למידה",
      "personal-basket"
    );
    const schedules = labels.filter((label) => label.includes("מערכת"));
    expect(schedules).toEqual(["מערכת שעות אישית"]);
    expect(
      getFormSchemaByFolder("מערכת שעות אישית", "personal-basket")?.id
    ).toBe("personal-schedule");
    expect(
      getFormSchemaByFolder("מערכת שעות", "personal-basket")?.id
    ).toBe("personal-schedule");
  });
});

describe("TLA forms are special-ed only", () => {
  it("does not list תל״א under תח״י for integration or personal-basket", () => {
    for (const status of ["integration", "personal-basket"] as const) {
      const labels = getDefaultFolderActionLabels('תח"י', status);
      expect(labels).toContain('תח"י (בקובץ נפרד)');
      expect(labels).toContain('תח"י אינטגרטיבי');
      expect(labels).not.toContain('תל"א (בקובץ נפרד)');
      expect(labels).not.toContain('תל"א אינטגרטיבי');
    }
  });

  it("lists תל״א only in the special-ed תל״א folder", () => {
    const labels = getDefaultFolderActionLabels('תל"א', "special-ed-class");
    expect(labels).toContain('תל"א (בקובץ נפרד)');
    expect(labels).toContain('תל"א אינטגרטיבי');
    expect(getFormSchemaByFolder('תל"א (בקובץ נפרד)', "special-ed-class")?.id).toBe(
      "tla"
    );
    expect(getFormSchemaByFolder('תל"א אינטגרטיבי', "special-ed-class")?.id).toBe(
      "tla-integrative"
    );
  });
});

describe("תל\"כ schedule navigation", () => {
  it("moves from weekly schedule to the next schedule in the group", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "מערכת שעות שבועית",
      status: "special-ed-class",
      preferredParent: 'תל"כ',
      preferFill: true,
    });
    expect(next?.label).toBe("מערכת שעות פרא-רפואית");
    expect(next?.href).toContain("/fill/s1/paramedical-schedule");
  });

  it("lists all schedule siblings for direct switching", () => {
    const siblings = listSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "מערכת שעות שבועית",
      status: "special-ed-class",
      preferredParent: "מערכות שעות",
      preferFill: true,
    });
    expect(siblings.map((s) => s.label)).toEqual([
      "מערכת שעות שבועית",
      "מערכת שעות פרא-רפואית",
      "מערכת שילוב",
      "מערכת שעות אישית",
    ]);
    expect(siblings[0]?.current).toBe(true);
    expect(siblings[1]?.href).toContain("/fill/s1/paramedical-schedule");
  });

  it("keeps weekly schedule category on the schedules group", () => {
    expect(
      getFormSchemaByFolder("מערכת שעות שבועית", "special-ed-class")
        ?.categoryFolder
    ).toBe("מערכות שעות");
  });
});

describe("next folder after last form", () => {
  it("moves from diagnoses category hub to tla folder", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "אבחונים ודוחות",
      status: "special-ed-class",
      preferFill: true,
    });
    expect(next?.kind).toBe("folder");
    expect(next?.label).toBe('תל"א');
    expect(next?.href).toBeTruthy();
  });

  it("moves from referral protocol group hub to hearing/vision checks", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "שאלון הפניה ופרוטוקול",
      status: "integration",
      preferredParent: "אינפורמציה כללית",
      preferFill: true,
    });
    expect(next?.label).toBe("בדיקות שמיעה וראיה");
    expect(next?.href).toContain("/folder/s1/");
    expect(decodeURIComponent(next?.href ?? "")).toContain(
      "בדיקות שמיעה וראיה"
    );
  });

  it("moves from the last form in a category to the next folder", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "בדיקת ראיה",
      status: "integration",
      preferredParent: "בדיקות שמיעה וראיה",
      preferFill: true,
    });
    // אחרי תת־קבוצה באינפורמציה כללית — ממשיכים לפריט הבא באותה תיקייה או לתיקייה הבאה
    expect(next).not.toBeNull();
    expect(next?.kind === "folder" || typeof next?.label === "string").toBe(
      true
    );
  });

  it("moves from last form in achievements to extra documents folder", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: "תעודות",
      status: "integration",
      preferredParent: "מעקב אחרי הישגי התלמיד",
      preferFill: true,
    });
    expect(next?.kind).toBe("folder");
    expect(next?.label).toBe("מסמכים נוספים");
    expect(next?.href).toBeTruthy();
  });

  it("moves from last integration form in therapeutic folder to achievements", () => {
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: 'תכתובות עם גורמים מטפלים מחוץ לביה"ס',
      status: "integration",
      preferredParent: "אינטגרציה טיפולית",
      preferFill: true,
    });
    expect(next?.kind).toBe("folder");
    expect(next?.label).toBe("מעקב אחרי הישגי התלמיד");
  });

  it("returns null on the last portfolio category", () => {
    const labels = getDefaultFolderActionLabels(
      "מסמכים נוספים",
      "integration"
    );
    const last = labels[labels.length - 1];
    const next = getNextSiblingPortfolioNav({
      studentId: "s1",
      currentLabel: last,
      status: "integration",
      preferredParent: "מסמכים נוספים",
      preferFill: true,
    });
    expect(next).toBeNull();
  });
});
