import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import {
  buildFormSnapshotHtml,
  isMoeOfficialForm,
  resolveSchedulePrintLayout,
} from "@/lib/form-snapshot";
import { tableCellKey } from "@/lib/form-table-grids";
import {
  INTEGRATIVE_COL_TEACHER_KEY,
  INTEGRATIVE_COL_AIDE_KEY,
  INTEGRATIVE_COL_OTHER_KEY,
} from "@/lib/integrative-tachi-defs";

describe("buildFormSnapshotHtml", () => {
  it("puts the Ministry of Education emblem only on official moe-* forms", () => {
    // moe-parent-questionnaire-alt עדיין ברינדור הגנרי (להכלה / מיצוי אפשרויות יש פריסת מקור משלהם)
    const schema = getFormSchema("moe-parent-questionnaire-alt");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, { full_name: "אורי לוי" }, "אורי לוי");

    expect(isMoeOfficialForm(schema!.id)).toBe(true);
    expect(html).toContain('<header class="moe-official-header">');
    expect(html).toContain("סמל משרד החינוך");
    expect(html).toContain("משרד החינוך");
    expect(html).toContain("המינהל הפדגוגי");
    expect(html).toContain("אגף א׳ חינוך מיוחד");
    expect(html.indexOf('<header class="moe-official-header">')).toBeLessThan(
      html.indexOf("<h1>")
    );
  });

  it("does not show Ministry branding on personal-basket / regular forms", () => {
    const schema = getFormSchema("personal-basket-card");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, { full_name: "אורי לוי" }, "אורי לוי");

    expect(isMoeOfficialForm(schema!.id)).toBe(false);
    expect(html).not.toContain('<header class="moe-official-header">');
    expect(html).not.toContain("סמל משרד החינוך");
    expect(html).not.toContain("המינהל הפדגוגי");
  });

  it("does not show Ministry branding on the multidisciplinary referral questionnaire", () => {
    const schema = getFormSchema("referral-questionnaire-multidisciplinary");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, { full_name: "אורי לוי" }, "אורי לוי");

    expect(html).not.toContain('<header class="moe-official-header">');
    expect(html).not.toContain("סמל משרד החינוך");
  });

  describe("referral questionnaire — original ministry look", () => {
    const schema = getFormSchema("referral-questionnaire")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        referral_source: "צוות חינוכי",
        referral_date: "2026-09-01",
        first_name: "אורי",
        last_name: "לוי",
        id_number: "123456789",
        gender: "male",
        institution_type: "special",
        father_name: "דוד",
        parent1_phone: "050-1234567",
        phone: "02-9999999",
        had_prior_discussion: "yes",
        prior_discussion_date_1: "2025-03-10",
        student_description: "שורה ראשונה\nשורה שנייה",
        principal_name: "רות כהן",
        principal_signature: "נחתם",
      },
      "אורי לוי"
    );

    it("renders the original ministry header instead of the generic title block", () => {
      expect(html).toContain('class="rq rq-referral"');
      expect(html).toContain("סמל משרד החינוך");
      expect(html).toContain("המינהל הפדגוגי");
      expect(html).toContain(
        "שאלון הפניה לוועדת זכאות ואפיון של תלמיד הלומד בבית-ספר"
      );
      expect(html).toContain('body class="print-original-look"');
      // בלי הכותרת הגנרית ובלי שורת "שם · תיקייה"
      expect(html).not.toContain('<p class="meta">');
      expect(html).not.toContain(`<h1>${schema.title}</h1>`);
    });

    it("marks X in the matching gender / institution-type boxes only", () => {
      const studentTable = html.slice(
        html.indexOf('class="rq-grid rq-student"'),
        html.indexOf('class="rq-grid rq-parents"')
      );
      expect(studentTable).toMatch(/זכר<\/td>\s*<td class="rq-boxcell"><span class="rq-box rq-box-on">X<\/span>/);
      expect(studentTable).toMatch(/נקבה<\/td>\s*<td class="rq-boxcell"><span class="rq-box"><\/span>/);

      const institutionTable = html.slice(
        html.indexOf('class="rq-grid rq-institution"'),
        html.indexOf('class="rq-grid rq-teacher"')
      );
      expect(institutionTable).toMatch(/רגיל<\/td>\s*<td class="rq-boxcell"><span class="rq-box"><\/span>/);
      expect(institutionTable).toMatch(/מיוחד<\/td>\s*<td class="rq-boxcell"><span class="rq-box rq-box-on">X<\/span>/);
    });

    it("formats dates the way they are written by hand and keeps line breaks", () => {
      expect(html).toContain("01/09/2026");
      expect(html).toContain("10/03/2025");
      expect(html).toContain("שורה ראשונה<br />שורה שנייה");
    });

    it("prefers the parent's own phone over the home phone in the parents table", () => {
      expect(html).toContain("050-1234567");
    });

    it("keeps the signature lines and the parents footnote from the original", () => {
      expect(html).toContain("שם מנהל/ת בית-הספר:");
      expect(html).toContain("חתימת ההורים לגבי הפניית התלמיד לוועדה*");
      expect(html).toContain("* חתימת ההורים על שאלון זה");
      expect(html).toContain("רות כהן");
    });
  });

  it("uses a continuous screen border and a fixed print page frame without height 100%", () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, { full_name: "אורי לוי" }, "אורי לוי");

    expect(html).toContain("page-frame");
    expect(html).toContain("height: calc(297mm - 3cm)");
    expect(html).toContain("position: fixed");
    expect(html).toContain("box-shadow: inset 0 0 0 1.5pt");
    expect(html).toContain("background-image: none");
    expect(html).toContain("border: 1.5pt solid #2f3b67");
    expect(html).not.toContain("background-repeat: repeat-y");
    // height:100% על מסגרת fixed יוצר עמוד ריק בכרום בהדפסת טופס בודד
    expect(html).not.toMatch(/\.page-frame\s*\{[^}]*(?<!max-)height:\s*100%/);
    // border על fixed+inset גם יוצר עמוד ריק — משתמשים ב-box-shadow
    expect(html).not.toMatch(
      /@media print\s*\{[\s\S]*?\.page-frame\s*\{[^}]*border:\s*1\.5pt/
    );
  });

  it("renders waiver parent signatures as full-width blocks", () => {
    const schema = getFormSchema("waiver-eligibility-characterization");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        parent1_name: "אלי",
        parent2_name: "שרה",
      },
      "יפי כהן"
    );

    // פריסת המקור: שני בלוקי "שם ההורה/האפוטרופוס: ___ ת"ז: ___" + "חתימה ___"
    expect(html).toContain('class="rq rq-waiver"');
    expect(html).toContain("נספח 2.1");
    expect(html.match(/<div class="rq-parent-block">/g)?.length).toBe(2);
    expect(html).toContain("אלי");
    expect(html).toContain("שרה");
    expect(html).toContain("ויתור על סודיות להעברת מידע לוועדת זכאות ואפיון");
    // ההערה המשפטית קיימת רק בגרסת ועדת זכאות ואפיון
    expect(html).toContain("יובהר, בהתאם לסעיף 9(א)");
  });

  it("prints ministry waiver checkboxes as X boxes, checked only where consented", () => {
    for (const [formId, appendix] of [
      ["waiver-multidisciplinary-team", "נספח 2.3"],
      ["waiver-eligibility-characterization", "נספח 2.1"],
      ["waiver-appeal-committee", "נספח 2.2"],
    ] as const) {
      const schema = getFormSchema(formId);
      expect(schema).toBeTruthy();
      const html = buildFormSnapshotHtml(
        schema!,
        { consent_final: "true", consent_disability_docs: "true" },
        "יפי כהן"
      );
      expect(html).toContain(appendix);
      expect(html.match(/rq-box rq-box-on/g)?.length).toBe(2);
      expect(html.match(/<span class="rq-box"><\/span>/g)?.length).toBe(2);
      expect(html).not.toContain(">כן<");
      expect(html).not.toContain('<p class="meta">');
    }
  });

  it("renders the parent-approval form (appendix 6.5) in the original layout", () => {
    const schema = getFormSchema("moe-parent-approval-committee-no-presence")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        first_name: "אורי",
        last_name: "לוי",
        id_number: "123456789",
        gender: "male",
        school_type: "special",
        class_type: "special_class",
        class_characterization: "לקות למידה",
        framework_choice: "special_class",
        "tbl_committee-attendees_r0_name": "רות כהן",
        "tbl_committee-attendees_r0_role": "מנהלת",
        discussion_summary: "סוכם להמשיך.",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-approval"');
    expect(html).toContain("נספח 6.5");
    expect(html).toContain("הנוכחים בדיון");
    expect(html).toContain("רות כהן");
    expect(html).toContain("מנהלת");
    expect(html).toContain("סוכם להמשיך.");
    // שם התלמיד המלא בהצהרת ההורים
    expect(html).toContain("אורי לוי");
    // בדיוק המשבצות הנכונות מסומנות: זכר, חינוך מיוחד, כיתת חנ"מ, כיתת חינוך מיוחד בבי"ס רגיל
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(4);
    expect(html).not.toContain('<header class="moe-official-header">');
  });

  it("renders the eligibility-renewal form (appendix 6.11) in the original layout", () => {
    const schema = getFormSchema("moe-eligibility-renewal")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        first_name: "אורי",
        last_name: "לוי",
        id_number: "123456789",
        gender: "female",
        school_name: "פרחי התורה",
        school_code: "312512",
        school_type: "regular",
        class_level: "ו",
        local_authority: "בני ברק",
        district: "מרכז",
        renewal_case: "final_year",
        finishing_year: "תשפ״ז",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-renewal"');
    expect(html).toContain("נספח 6.11");
    expect(html).toContain("פנייה לוועדת זכאות ואפיון לחידוש הזכאות לשירותי חינוך מיוחדים");
    expect(html).toContain("ועדת הזכאות והאפיון");
    expect(html).toContain("בני ברק");
    expect(html).toContain("מרכז");
    expect(html).toContain("פרחי התורה");
    expect(html).toContain("312512");
    expect(html).toContain("אורי לוי");
    expect(html).toContain("תשפ״ז");
    expect(html).toContain("מבקשים את המשך הזכאות לשירותי חינוך מיוחדים");
    // נקבה + חינוך רגיל + שנה אחרונה — בדיוק שלוש משבצות
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(3);
    expect(html).not.toContain('<header class="moe-official-header">');
  });

  it("renders the school website photo consent form in the original layout", () => {
    const schema = getFormSchema("moe-school-website-photo-consent")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        full_name: "יעל כהן",
        class_level: "ו2",
      },
      "יעל כהן"
    );
    expect(html).toContain('class="rq rq-website-consent"');
    expect(html).toContain(
      "טופס לקבלת הסכמת הורה / אפוטרופוס לפעילות באתר בית הספר/ פרסום תמונות"
    );
    expect(html).toContain("הורים יקרים");
    expect(html).toContain(
      'בפעילויות&nbsp;&nbsp;אתר האינטרנט בית ספרי'
    );
    expect(html).toContain("ברצוננו לשלב את הנושאים הבאים בפעילויות האתר:א.");
    expect(html).toContain('(חוזר מנכ"ל תשסג/7 (א), כ"ח אדר תשס"ג, 2 במרס 2003)');
    expect(html).toContain("יעל כהן");
    expect(html).toContain("ו2");
    expect(html).not.toContain('<header class="moe-official-header">');
  });

  it("renders the psychologist recommendation (appendix 6.12) with its footnotes", () => {
    const schema = getFormSchema("moe-psychologist-code-change")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        full_name: "אורי לוי",
        current_characterization: "עיכוב שפתי",
        source_official_document: "true",
        reasoning: "נימוק א\nנימוק ב",
        psychologist_name: "ד\"ר כהן",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-psych"');
    expect(html).toContain("נספח 6.12");
    expect(html).toContain("השרות הפסיכולוגי ייעוצי, אגף פסיכולוגיה");
    expect(html).toContain("עיכוב שפתי");
    expect(html).toContain("נימוק א<br />נימוק ב");
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(1);
    expect(html).toContain('<ol class="rq-footnotes">');
  });

  it("renders the multidisciplinary psychologist recommendation (appendix 8) in the original layout", () => {
    const schema = getFormSchema("moe-psychologist-recommendation")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        full_name: "אורי לוי",
        meeting_date: "2026-09-08",
        "tbl_meeting-attendees_r0_name": "רות כהן",
        "tbl_meeting-attendees_r0_role": "מנהלת",
        characterization_type: "behavioral_emotional_55",
        psychologist_name: "ד\"ר כהן",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-psych rq-psych-rec"');
    expect(html).toContain("נספח 8");
    expect(html).toContain("08/09/2026");
    expect(html).toContain("רות כהן");
    expect(html).toContain("מנהלת");
    // רק האפשרות שנבחרה מסומנת מתוך שלוש
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(1);
    expect(html).toContain("הפרעות התנהגותיות ורגשיות (55)");
    expect(html).toContain("מסמך זה קביל אך ורק");
    expect(html).not.toContain('<header class="moe-official-header">');
  });

  it("renders the exhaust-options document in the original two-part layout", () => {
    const schema = getFormSchema("moe-exhaust-options")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        school_name: "פרחי התורה",
        first_name: "אורי",
        last_name: "לוי",
        has_personal_plan: "yes",
        intervention_current_year_months: "6",
        support_counselor: "שיחות שבועיות",
        support_counselor_setting: "individual",
        support_counselor_duration: "4 חודשים",
        inspector_recommendation: "מאושרת הפניה.",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-exhaust"');
    expect(html).toContain("ממרחב אפשרויות למיצוי אפשרויות בבית הספר");
    expect(html).toContain("בחינת מיצוי אפשרויות טרם הפניית תלמיד לדיון בוועדת זכאות ואפיון");
    expect(html).toContain("סוג התמיכה - בלמידה מקרוב ובלמידה מרחוק");
    expect(html).toContain("שיחות שבועיות");
    expect(html).toContain("פרטני");
    expect(html).toContain("4 חודשים");
    expect(html).toContain("מאושרת הפניה.");
    // "כן" מסומן, "לא" לא
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(1);
    expect(html).toContain('class="rq-exhaust-form"');
  });

  it("renders the multidisciplinary referral questionnaire (appendix 4.2) in the original layout", () => {
    const schema = getFormSchema("referral-questionnaire-multidisciplinary")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        school_name: "פרחי התורה",
        institution_code: "312512",
        first_name: "אורי",
        last_name: "לוי",
        id_number: "123456789",
        gender: "female",
        father_name: "דוד",
        had_prior_discussion: "yes",
        prior_placement_committee: "true",
        prior_discussion_date_3: "2025-03-10",
        referrer_parent: "true",
        referral_reason: "קשיים בקריאה",
        func_reading_accuracy: "3",
        func_frustration: "7",
        homeroom_teacher: "יוכי שטיגליץ",
        principal_name: "רות כהן",
        principal_signature: "נחתם",
        parent_notes_on_teacher_report: "מסכימים עם התיאור",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-referral rq-rm"');
    expect(html).toContain("נספח 4.2");
    expect(html).toContain("לקביעת זכאות לשירותי חינוך מיוחדים");
    // אין סמל — רק כותרת הטקסט של המשרד
    expect(html).not.toContain("סמל משרד החינוך");
    expect(html).toContain("המינהל הפדגוגי");
    // סעיפים א–ז
    for (const title of ["פרטי בית הספר", "פרטים אישיים", "הגורמים המפנים", "הסיבה להפניית התלמיד/ה לדיון", "שאלון לתיאור התפקוד של התלמיד"]) {
      expect(html).toContain(`<b>${title}</b>`);
    }
    // נקבה מסומנת, ועדת השמה + הורה מסומנים, "כן" מסומן → 4 משבצות X + 2 בסולם התפקוד
    expect(html.match(/rq-box rq-box-on/g)?.length).toBe(6);
    expect(html).toContain("10/03/2025");
    // טבלת 33 הפריטים בסולם 1–9 עם כותרות חלש/ממוצע/טוב
    expect(html).toContain('<th colspan="3">חלש</th>');
    expect(html).toContain('<th colspan="3">ממוצע</th>');
    expect(html).toContain('<th colspan="3">טוב</th>');
    expect(html.match(/<td class="rq-rm-num">/g)?.length).toBe(33);
    expect(html).toContain('<td class="rq-rm-num">33.</td>');
    expect(html.match(/rq-rm-scale rq-rm-scale-on/g)?.length).toBe(2);
    // חתימות + דף להורים
    expect(html).toContain("שם מנהל/ת ביה&quot;ס:");
    expect(html).toContain("רות כהן");
    expect(html).toContain("דף להורים");
    expect(html).toContain("נא החזירו דף זה למורה");
    expect(html).toContain("מסכימים עם התיאור");
    expect(html).toContain("חתימת ההורים:");
  });

  it("renders the inclusion plan as the original 3-column table (not a list)", () => {
    const schema = getFormSchema("moe-inclusion-plan")!;
    const html = buildFormSnapshotHtml(
      schema,
      {
        full_name: "אורי לוי",
        class_seat_physical: "true",
        class_seat_physical_date: "2026-09-01",
        class_seat_physical_notes: "ליד שולחן המורה",
        ref_counselor: "true",
        ref_counselor_date: "2026-09-10",
        inclusion_goals: "שילוב חברתי",
        summary_classroom: "הועבר מקום ישיבה",
        homeroom_teacher: "רבקה כהן",
        school_year: "תשפ״ז",
      },
      "אורי לוי"
    );
    expect(html).toContain('class="rq rq-incl"');
    expect(html).not.toContain('<header class="moe-official-header">');
    expect(html).toContain("מערך הפיקוח וההנחיה חינוך מיוחד");
    expect(html).toContain("תוכנית ההכלה");
    // כותרות עמודות + כותרות מקטעים אפורות
    expect(html).toContain("<th>תאריכים</th>");
    expect(html).toContain("<th>הערות</th>");
    expect(html).toContain('<tr class="rq-incl-section"><td colspan="3">במסגרת הכיתה</td></tr>');
    expect(html).toContain('<tr class="rq-incl-section"><td colspan="3">סביבה תומכת</td></tr>');
    expect(html).toContain("פניה או הפניה ל:");
    // תוויות עם קידומת משותפת → שורת פתיחה + החלק השני מודגש
    expect(html).toContain("בחירת מקום ישיבה המותאם לתלמיד:");
    expect(html).toContain("<b>מבחינה פיזית</b>");
    // ✓ רק בפעולות שסומנו, תאריך dd/mm/yyyy והערות בעמודות
    expect(html.match(/rq-incl-tick rq-box-on/g)?.length).toBe(2);
    expect(html).toContain("01/09/2026");
    expect(html).toContain("ליד שולחן המורה");
    // כל פעולה בשורת טבלה (ולא ברשימה)
    const rows = html.match(/<tr class="rq-incl-row/g)?.length ?? 0;
    expect(rows).toBeGreaterThan(50);
    // עמוד התיעוד + חתימות
    expect(html).toContain('class="rq-incl-doc"');
    expect(html).toContain("תיעוד תוכנית ההכלה");
    expect(html).toContain("שילוב חברתי");
    expect(html).toContain("רבקה כהן");
    expect(html).toContain("חתימת המחנכ/ת");
    expect(html).toContain("חתימת המנהל/ת");
  });

  it("includes a fixed print header so institution logos appear on every page", () => {
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      { student_name: "אורי" },
      "אורי",
      {
        schoolLogoUrl: "data:image/png;base64,SCHOOL",
        associationLogoUrl: "data:image/png;base64,ASSOC",
      }
    );
    expect(html).toContain('class="doc-header-fixed"');
    expect(html).toContain("data:image/png;base64,ASSOC");
    expect(html).toContain("data:image/png;base64,SCHOOL");
    expect(html).toContain("doc-header-space");
    expect(html).toContain("position: fixed");
  });

  it("does not use a fixed header when no school/association logos are set", () => {
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, {}, "אורי");
    expect(html).not.toContain('class="doc-header-fixed"');
  });

  it("renders TLK weekly schedule in landscape with smaller wrapped cells", () => {
    const schema = getFormSchema("weekly-schedule");
    expect(schema).toBeTruthy();
    expect(resolveSchedulePrintLayout(schema!).isSchedule).toBe(true);
    expect(resolveSchedulePrintLayout(schema!).variant).toBe("tlk-weekly");

    const html = buildFormSnapshotHtml(
      schema!,
      {
        class_name: "איידי",
        sched_sun_p1: "מתמטיקה",
        sched_sun_p1_staff: "שרה כהן",
      },
      'תל"כ — איידי'
    );

    expect(html).toContain('class="print-schedule"');
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain('class="sched-cell"');
    expect(html).toContain("מתמטיקה");
    expect(html).toContain("שרה כהן");
    expect(html).toContain("white-space: pre-wrap");
  });

  it("renders weekly schedule with student name and class fields populated", () => {
    const schema = getFormSchema("weekly-schedule");
    expect(schema).toBeTruthy();

    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "נועה דמו",
        class_name: "ג2",
        school_year: "2026",
        homeroom_teacher: "מורה דמו",
      },
      "נועה דמו"
    );

    expect(html).toContain("נועה דמו");
    expect(html).toContain("ג2");
    expect(html).toContain("שם התלמיד/ה");
    expect(html).toContain("כיתה");
  });

  it("uses the smallest grid font for inclusion schedule", () => {
    const schema = getFormSchema("inclusion-schedule");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      { class_name: "איידי" },
      'תל"כ — איידי'
    );

    expect(html).toContain("print-schedule-inclusion");
    expect(html).toContain("size: A4 landscape");
  });

  it("includes schedule-specific print rules inside @media print (TZ-16 fix)", () => {
    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    expect(resolveSchedulePrintLayout(schema!).isSchedule).toBe(true);
    expect(resolveSchedulePrintLayout(schema!).variant).toBe("detailed");

    const html = buildFormSnapshotHtml(
      schema!,
      { full_name: "יעל כהן", class_name: "ג1" },
      "יעל כהן"
    );

    expect(html).toContain('class="print-schedule"');
    expect(html).toContain("size: A4 landscape");
    // The @media print block must include schedule-specific overrides with !important
    // to prevent the generic .page { width: auto !important; } from breaking landscape
    expect(html).toMatch(/@media print[\s\S]*body\.print-schedule \.page[\s\S]*width:\s*297mm\s*!important/);
    // Font size is 8pt (readable) while still fitting on one page
    expect(html).toMatch(/@media print[\s\S]*body\.print-schedule \.schedule-grid[\s\S]*font-size:\s*8pt\s*!important/);
  });

  it("keeps empty personal-schedule cells clean and shows only checked flags (TZ-103)", () => {
    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "נועה דמו",
        class_name: "ד׳2",
        filled_at: "2026-10-12",
        sched_sun_p1: "חשבון",
        sched_sun_p1_in_class: "1",
        sched_mon_p3: "אנגלית",
        sched_mon_p3_other: "1",
      },
      "נועה דמו"
    );

    expect(html).toContain("sched-cell-empty");
    expect(html).toContain("חשבון");
    expect(html).toContain("אנגלית");
    expect(html).toContain("sched-flag-on");
    expect(html).toContain(">בכיתה<");
    expect(html).toContain(">אחר<");
    expect(html).not.toContain("בכיתה ☐");
    expect(html).not.toContain("אחר ☐");
  });

  it("prints custom other label instead of the word אחר when provided (TZ-183)", () => {
    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "נועה דמו",
        sched_mon_p3: "חשבון",
        sched_mon_p3_other: "1",
        sched_mon_p3_other_label: "סייעת פרטנית",
      },
      "נועה דמו"
    );
    expect(html).toContain("סייעת פרטנית");
    expect(html).not.toMatch(/sched-flag[^>]*>אחר</);
    expect((html.match(/sched-cell-empty/g) || []).length).toBeGreaterThan(20);
  });

  it("displays 'other' text instead of just 'אחר' when specified (TZ-159)", () => {
    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "נועה דמו",
        class_name: "ד׳2",
        sched_tue_p2: "ריפוי בעיסוק",
        sched_tue_p2_other: "1",
        sched_tue_p2_other_label: "טיפול פרטני",
      },
      "נועה דמו"
    );

    expect(html).toContain("ריפוי בעיסוק");
    expect(html).toContain(">טיפול פרטני<");
    expect(html).not.toContain(">אחר<");
  });

  it("prints parent-conversations as a date-summary grid with a narrow date column", () => {
    const schema = getFormSchema("parent-conversations");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        [tableCellKey("parent-conversations", 0, "date")]: "2026-11-04",
        [tableCellKey("parent-conversations", 0, "summary")]:
          "שיחת היכרות עם ההורים. הוצגו מטרות העבודה לשנה וסוכמו דרכי תקשורת.",
      },
      "יעל כהן"
    );

    expect(html).toContain('class="data-grid data-grid-date-summary"');
    expect(html).toContain('class="data-grid-col-date"');
    expect(html).toContain('class="data-grid-col-wide"');
    expect(html).not.toContain("data-grid-col-date data-grid-col-wide");
    expect(html).toMatch(/<col class="data-grid-col-date" style="width:16%" \/>/);
    expect(html).toMatch(
      /<col class="data-grid-col-wide" style="width:84%" \/>/
    );
    expect(html).toContain("04/11/2026");
    expect(html).not.toContain("2026-11-04");
    expect(html).toContain("שיחת היכרות עם ההורים");
    expect(html).toContain('class="data-grid-row-empty"');
    const grid = html.match(
      /<table class="data-grid data-grid-date-summary">[\s\S]*?<\/table>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid!.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)?.length).toBe(
      8
    );
    expect(html).toContain("#084e76");
  });

  it("does not retarget multi-column grids as date-summary", () => {
    const schema = getFormSchema("staff-meetings");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      { full_name: "יעל כהן" },
      "יעל כהן"
    );
    expect(html).toContain('class="data-grid data-grid-date-notes"');
    expect(html).not.toContain('class="data-grid data-grid-date-summary"');
  });

  it("prints ישיבות צוות as a 3-column date-notes grid without empty rows (TZ-90)", () => {
    const schema = getFormSchema("staff-meetings");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        [tableCellKey("staff-meetings", 0, "date")]: "2026-10-07",
        [tableCellKey("staff-meetings", 0, "participants")]:
          "מחנכת, יועצת, רכזת שילוב",
        [tableCellKey("staff-meetings", 0, "summary")]:
          "הוחלט על רשימת הבנות שהצטרפו ללמידה בקבוצה. התארחה הורים ממנהלת.",
        [tableCellKey("staff-meetings", 1, "date")]: "",
        [tableCellKey("staff-meetings", 1, "participants")]: "",
        [tableCellKey("staff-meetings", 1, "summary")]: "",
      },
      "יעל כהן"
    );
    expect(html).toContain('class="data-grid data-grid-date-notes"');
    expect(html).not.toContain('class="data-grid data-grid-date-summary"');
    expect(html).toMatch(/<col class="data-grid-col-date" style="width:16%" \/>/);
    expect(html).toMatch(
      /<col class="data-grid-col-wide data-grid-col-participants" style="width:30%" \/>/
    );
    expect(html).toMatch(
      /<col class="data-grid-col-wide data-grid-col-summary" style="width:54%" \/>/
    );
    expect(html).toContain("07/10/2026");
    expect(html).toContain("מחנכת, יועצת");
    const grid = html.match(
      /<table class="data-grid data-grid-date-notes">[\s\S]*?<\/table>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid!.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)?.length).toBe(
      1
    );
    expect(grid).not.toContain("data-grid-row-empty");
    expect(html).toContain("data-grid-col-participants");
    expect(html).toContain("data-grid-col-summary");
  });

  it("keeps empty ישיבות צוות rows when the whole form is blank for handwriting", () => {
    const schema = getFormSchema("staff-meetings");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      { full_name: "יעל כהן" },
      "יעל כהן"
    );
    const grid = html.match(
      /<table class="data-grid data-grid-date-notes">[\s\S]*?<\/table>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid!.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)?.length).toBe(
      8
    );
    expect(grid).toContain("data-grid-row-empty");
  });

  it("renders staff weekly schedule in landscape with proper sizing", () => {
    const schema = getFormSchema("staff-schedule");
    expect(schema).toBeTruthy();
    expect(resolveSchedulePrintLayout(schema!).isSchedule).toBe(true);
    expect(resolveSchedulePrintLayout(schema!).variant).toBe("staff-weekly");

    const html = buildFormSnapshotHtml(
      schema!,
      { full_name: "רחל כהן" },
      "רחל כהן"
    );

    expect(html).toContain('class="print-schedule"');
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain('class="schedule-grid"');
  });

  it("does not print the ai_workplan_hint editor instruction (TZ-176)", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        current_status: "קשיים בקריאה ובהבנת הנקרא",
        main_goal: "שיפור רמת הקריאה",
      },
      "יעל כהן"
    );

    expect(html).toContain("קשיים בקריאה");
    expect(html).toContain("שיפור רמת הקריאה");
    expect(html).not.toContain("בקשו מה-AI להציע תוכנית עבודה");
    expect(html).not.toContain("ai_workplan_hint");
  });

  describe("integrative tachi editable column labels", () => {
    const schema = getFormSchema("tachi-integrative")!;

    it("prints custom labels when set", () => {
      const html = buildFormSnapshotHtml(
        schema,
        {
          full_name: "אורי לוי",
          [INTEGRATIVE_COL_TEACHER_KEY]: "רכזת שילוב",
          [INTEGRATIVE_COL_AIDE_KEY]: "מלווה",
          [INTEGRATIVE_COL_OTHER_KEY]: "הורים",
        },
        "אורי לוי"
      );
      expect(html).toContain("<th>רכזת שילוב</th>");
      expect(html).toContain("<th>מלווה</th>");
      expect(html).toContain("<th>הורים</th>");
      expect(html).not.toContain("<th>מורה</th>");
      expect(html).not.toContain("<th>סייעת</th>");
      expect(html).not.toContain("<th>אחר</th>");
    });

    it("falls back to defaults when labels are empty or whitespace", () => {
      const html = buildFormSnapshotHtml(
        schema,
        {
          full_name: "אורי לוי",
          [INTEGRATIVE_COL_TEACHER_KEY]: "",
          [INTEGRATIVE_COL_AIDE_KEY]: "   ",
          [INTEGRATIVE_COL_OTHER_KEY]: "\t\n",
        },
        "אורי לוי"
      );
      expect(html).toContain("<th>מורה</th>");
      expect(html).toContain("<th>סייעת</th>");
      expect(html).toContain("<th>אחר</th>");
    })
  });
});
