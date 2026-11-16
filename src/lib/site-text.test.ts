import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_TEXTS,
  alignFreeAccessDurationCaptions,
  alignStaffStudentStatusCaptions,
  alignUploadLimitCaptions,
  applyTextPatch,
  mergeSiteTexts,
} from "@/lib/site-text";

describe("site texts", () => {
  it("TZ-116: login register prompt names the personal area", () => {
    expect(DEFAULT_SITE_TEXTS.auth.noAccountPrompt).toBe(
      "עדיין אין לך אזור אישי?"
    );
    expect(DEFAULT_SITE_TEXTS.auth.registerLink).toBe(
      "רישום חדש לאזור האישי"
    );
  });

  it("TZ-93/TZ-99/TZ-196: waiver folder notice — independent upload vs scan that opens the file", () => {
    expect(DEFAULT_SITE_TEXTS.studentPortfolio.waiverUploadDoesNotUnlock).toBe(
      "העלאה עצמאית לתיקייה אינה פותחת את התיק. סריקה חתומה של ויתור הסודיות פותחת את תיק התלמיד — בלי אישור ידני; חתימות דיגיטליות של שני ההורים הן חלופה."
    );
    expect(DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverSatisfied).toBe(
      "הויתור קוים בסריקה חתומה שהועלתה"
    );
    expect(DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverTypeError).toContain(
      "PDF"
    );
    expect(DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverRemoving).toBe(
      "מסיר..."
    );
    expect(
      DEFAULT_SITE_TEXTS.studentPortfolio.paperWaiverRestoreBlocked
    ).toContain("סריקה פעילה");
  });

  it("defaults import ת.ז. conflict label separately from missing name", () => {
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelIdNumberOtherStatus).toBe(
      "ת.ז. כבר קיימת אצל תלמיד בסטטוס/קטגוריה אחרת — לא עודכן"
    );
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelMissingName).toBe(
      "חסר שם"
    );
  });

  it("TZ-141: integration sample columns mention תאריך כניסה לשילוב", () => {
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelIntegrationColumns).toContain(
      "תאריך כניסה לשילוב"
    );
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelIntegrationColumns).toContain(
      "מצב משפחתי"
    );
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelPersonalBasketColumns).toContain(
      "תומכת חינוך"
    );
    expect(DEFAULT_SITE_TEXTS.personalArea.importExcelSpecialEdColumns).toContain(
      "תאריך וועדת אפיון וזכאות"
    );
    expect(DEFAULT_SITE_TEXTS.personalArea.integrationRenewalAlertTitle).toBe(
      "יש לחדש את השילוב"
    );
    expect(DEFAULT_SITE_TEXTS.studentFields.integrationStartDate).toBe(
      "תאריך כניסה לשילוב"
    );
  });

  it("merges remote overrides onto defaults", () => {
    const merged = mergeSiteTexts(DEFAULT_SITE_TEXTS, {
      auth: {
        ...DEFAULT_SITE_TEXTS.auth,
        loginButton: "כניסה מותאמת",
      },
    });
    expect(merged.auth.loginButton).toBe("כניסה מותאמת");
    expect(merged.auth.continuePendingRegistration).toBe(
      DEFAULT_SITE_TEXTS.auth.continuePendingRegistration
    );
  });

  it("applies a path patch", () => {
    const next = applyTextPatch(
      DEFAULT_SITE_TEXTS,
      "auth.continuePendingRegistration",
      "המשך מהיכן שעצרת"
    );
    expect(next.auth.continuePendingRegistration).toBe("המשך מהיכן שעצרת");
  });

  it("merges nested overrides that do not exist on defaults", () => {
    const merged = mergeSiteTexts(DEFAULT_SITE_TEXTS, {
      pageBySector: {
        schools: {},
        kindergartens: {},
        "high-schools": {
          personalArea: { regularFramework: "מסגרות רגיל - תיכון" },
        },
      },
    } as Partial<typeof DEFAULT_SITE_TEXTS>);

    expect(merged.dashboard.schools).toBe(DEFAULT_SITE_TEXTS.dashboard.schools);
    expect(
      (
        merged as {
          pageBySector?: {
            "high-schools"?: {
              personalArea?: { regularFramework?: string };
            };
          };
        }
      ).pageBySector?.["high-schools"]?.personalArea?.regularFramework
    ).toBe("מסגרות רגיל - תיכון");
  });

  it("patches sector-scoped paths used on the category table", () => {
    const next = applyTextPatch(
      DEFAULT_SITE_TEXTS,
      "pageBySector.schools.personalArea.categoryTableTitle",
      "רשימת הקטגוריות"
    );
    expect(
      (
        next.pageBySector.schools as {
          personalArea?: { categoryTableTitle?: string };
        }
      ).personalArea?.categoryTableTitle
    ).toBe("רשימת הקטגוריות");
    expect(next.personalArea.categoryTableTitle).toBe(
      DEFAULT_SITE_TEXTS.personalArea.categoryTableTitle
    );
  });

  it("restores student wizard title when it was overwritten with staff card title", () => {
    const broken = {
      ...DEFAULT_SITE_TEXTS,
      wizard: {
        ...DEFAULT_SITE_TEXTS.wizard,
        step1Title: "כרטיס איש צוות",
      },
      personalArea: {
        ...DEFAULT_SITE_TEXTS.personalArea,
        studentCardTitle: "כרטיס איש צוות",
      },
    };
    const aligned = alignStaffStudentStatusCaptions(broken);
    expect(aligned.changed).toBe(true);
    expect(aligned.texts.wizard.step1Title).toBe(
      DEFAULT_SITE_TEXTS.wizard.step1Title
    );
    expect(aligned.texts.personalArea.studentCardTitle).toBe(
      DEFAULT_SITE_TEXTS.personalArea.studentCardTitle
    );
    expect(aligned.texts.wizard.staffCardTitle).toBe("כרטיס איש צוות");
  });

  it("restores student-list back copy that was overwritten with staff wording (TZ-69)", () => {
    const leaked = {
      ...DEFAULT_SITE_TEXTS,
      personalArea: {
        ...DEFAULT_SITE_TEXTS.personalArea,
        backToStudentsList: "חזרה לרשימת אנשי צוות",
      },
    };
    const aligned = alignStaffStudentStatusCaptions(leaked);
    expect(aligned.changed).toBe(true);
    expect(aligned.texts.personalArea.backToStudentsList).toBe(
      "חזרה לרשימת התלמידים"
    );
    expect(aligned.texts.status.backToStaffList).toBe("חזרה לרשימת אנשי צוות");
  });

  it("does not wipe unrelated status captions when titles are already correct", () => {
    const custom = {
      ...DEFAULT_SITE_TEXTS,
      status: {
        ...DEFAULT_SITE_TEXTS.status,
        personalBasketListTitle: "הסל שלי — כותרת מותאמת",
      },
    };
    const aligned = alignStaffStudentStatusCaptions(custom);
    expect(aligned.texts.status.personalBasketListTitle).toBe(
      "הסל שלי — כותרת מותאמת"
    );
  });

  it("advertises the 25MB upload limit in default Hebrew copy", () => {
    expect(DEFAULT_SITE_TEXTS.studentDocuments.uploadHint).toContain("עד 25MB");
    expect(DEFAULT_SITE_TEXTS.studentDocuments.fileTooLarge).toContain(
      "מקסימום 25MB"
    );
  });

  it("bumps stale 2MB / 3MB / 3.3MB / 8MB / 10MB upload copy to 25MB (TZ-139)", () => {
    const nextHint = DEFAULT_SITE_TEXTS.studentDocuments.uploadHint;
    const nextTooLarge = DEFAULT_SITE_TEXTS.studentDocuments.fileTooLarge;

    const stale2 = {
      ...DEFAULT_SITE_TEXTS,
      studentDocuments: {
        ...DEFAULT_SITE_TEXTS.studentDocuments,
        uploadHint: "PDF, Word, Excel או תמונה — עד 2MB לקובץ",
        fileTooLarge: "הקובץ גדול מדי (מקסימום 2MB)",
      },
    };
    const aligned2 = alignUploadLimitCaptions(stale2);
    expect(aligned2.changed).toBe(true);
    expect(aligned2.texts.studentDocuments.uploadHint).toBe(nextHint);
    expect(aligned2.texts.studentDocuments.fileTooLarge).toBe(nextTooLarge);

    const stale3 = {
      ...DEFAULT_SITE_TEXTS,
      studentDocuments: {
        ...DEFAULT_SITE_TEXTS.studentDocuments,
        uploadHint: "PDF, Word, Excel או תמונה — עד 3MB לקובץ",
        fileTooLarge: "הקובץ גדול מדי (מקסימום 3MB)",
      },
    };
    const aligned3 = alignUploadLimitCaptions(stale3);
    expect(aligned3.changed).toBe(true);
    expect(aligned3.texts.studentDocuments.uploadHint).toBe(nextHint);

    const stale8 = {
      ...DEFAULT_SITE_TEXTS,
      studentDocuments: {
        ...DEFAULT_SITE_TEXTS.studentDocuments,
        uploadHint: "PDF, Word, Excel או תמונה — עד 8MB לקובץ",
        fileTooLarge: "הקובץ גדול מדי (מקסימום 8MB)",
      },
    };
    const aligned8 = alignUploadLimitCaptions(stale8);
    expect(aligned8.changed).toBe(true);
    expect(aligned8.texts.studentDocuments.uploadHint).toBe(nextHint);
    expect(aligned8.texts.studentDocuments.fileTooLarge).toBe(nextTooLarge);

    const stale10 = {
      ...DEFAULT_SITE_TEXTS,
      studentDocuments: {
        ...DEFAULT_SITE_TEXTS.studentDocuments,
        uploadHint: "PDF, Word, Excel או תמונה — עד 10MB לקובץ",
        fileTooLarge: "הקובץ גדול מדי (מקסימום 10MB)",
      },
    };
    const aligned10 = alignUploadLimitCaptions(stale10);
    expect(aligned10.changed).toBe(true);
    expect(aligned10.texts.studentDocuments.uploadHint).toBe(nextHint);
    expect(aligned10.texts.studentDocuments.uploadHint).not.toContain("10MB");

    const stale33 = {
      ...DEFAULT_SITE_TEXTS,
      studentDocuments: {
        ...DEFAULT_SITE_TEXTS.studentDocuments,
        uploadHint: "PDF, Word, Excel או תמונה — עד 3.3MB לקובץ",
        fileTooLarge: "הקובץ גדול מדי (מקסימום 3.3MB)",
      },
    };
    const aligned33 = alignUploadLimitCaptions(stale33);
    expect(aligned33.changed).toBe(true);
    expect(aligned33.texts.studentDocuments.fileTooLarge).toBe(nextTooLarge);
    expect(aligned33.texts.studentDocuments.uploadHint).toContain("25MB");
  });

  it("bumps stale free-access 10-minute copy to 20", () => {
    const stale = {
      ...DEFAULT_SITE_TEXTS,
      landing: {
        ...DEFAULT_SITE_TEXTS.landing,
        guestWelcomeBody: "הכניסה החופשית פתוחה ל־10 הדקות הקרובות.",
        guestUsedUp: "כבר ניצלתם את 10 דקות הכניסה החופשית במכשיר זה.",
      },
    };
    const aligned = alignFreeAccessDurationCaptions(stale);
    expect(aligned.changed).toBe(true);
    expect(aligned.texts.landing.guestWelcomeBody).toBe(
      "הכניסה החופשית פתוחה ל־20 הדקות הקרובות."
    );
    expect(aligned.texts.landing.guestUsedUp).toBe(
      "כבר ניצלתם את 20 דקות הכניסה החופשית במכשיר זה."
    );
  });
});
