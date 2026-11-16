import { describe, expect, it } from "vitest";
import {
  buildAiFillFieldDescriptors,
  currentFormDataFromAiFields,
  flattenAiFillPatch,
  formSupportsAiFill,
  formSupportsPublicLinkAiFill,
  mergeAiFillIntoCurrentData,
  mergeAiFillIntoData,
} from "./form-ai-fill";
import { FORM_SCHEMAS } from "./form-schemas";
import { tableCellKey, tableRowCountKey } from "./form-table-grids";

const integrative = FORM_SCHEMAS.find((s) => s.id === "tachi-integrative");

describe("formSupportsAiFill", () => {
  it("allows tachi integrative even with gershayim in the category folder", () => {
    expect(integrative).toBeTruthy();
    expect(formSupportsAiFill(integrative)).toBe(true);
    expect(
      formSupportsAiFill({
        ...integrative!,
        categoryFolder: "תח״י",
      })
    ).toBe(true);
  });

  it("allows AI fill on tachi prep page", () => {
    const prep = FORM_SCHEMAS.find((s) => s.id === "tachi-prep");
    expect(prep).toBeTruthy();
    expect(formSupportsAiFill(prep)).toBe(true);
  });

  it("does not allow AI fill on formative assessment forms", () => {
    const table = FORM_SCHEMAS.find(
      (s) => s.id === "formative-assessment-table"
    );
    const verbal = FORM_SCHEMAS.find(
      (s) => s.id === "formative-assessment-verbal"
    );
    expect(table).toBeTruthy();
    expect(verbal).toBeTruthy();
    expect(formSupportsAiFill(table)).toBe(false);
    expect(formSupportsAiFill(verbal)).toBe(false);
  });

  it("does not allow AI fill on accommodations form", () => {
    const accommodations = FORM_SCHEMAS.find((s) => s.id === "accommodations");
    expect(accommodations).toBeTruthy();
    expect(formSupportsAiFill(accommodations)).toBe(false);
  });

  it("allows AI fill on school and kindergarten referral questionnaires", () => {
    const school = FORM_SCHEMAS.find((s) => s.id === "referral-questionnaire");
    const multi = FORM_SCHEMAS.find(
      (s) => s.id === "referral-questionnaire-multidisciplinary"
    );
    const kinder = FORM_SCHEMAS.find(
      (s) => s.id === "referral-questionnaire-kindergarten"
    );
    expect(school).toBeTruthy();
    expect(multi).toBeTruthy();
    expect(kinder).toBeTruthy();
    expect(formSupportsAiFill(school)).toBe(true);
    expect(formSupportsAiFill(multi)).toBe(false);
    expect(formSupportsAiFill(kinder)).toBe(true);
  });

  it("does not allow AI fill on the eligibility-renewal extra document", () => {
    const renewal = FORM_SCHEMAS.find((s) => s.id === "moe-eligibility-renewal");
    expect(renewal).toBeTruthy();
    expect(formSupportsAiFill(renewal)).toBe(false);
    expect(formSupportsPublicLinkAiFill(renewal)).toBe(false);
    expect(formSupportsAiFill(renewal, { freeAccess: true })).toBe(false);
  });

  it("does not allow AI fill on the school website photo consent form", () => {
    const consent = FORM_SCHEMAS.find(
      (s) => s.id === "moe-school-website-photo-consent"
    );
    expect(consent).toBeTruthy();
    expect(formSupportsAiFill(consent)).toBe(false);
    expect(formSupportsPublicLinkAiFill(consent)).toBe(false);
  });

  it("does not allow AI fill on the student questionnaire interview form", () => {
    const student = FORM_SCHEMAS.find((s) => s.id === "student-questionnaire");
    expect(student).toBeTruthy();
    expect(formSupportsAiFill(student)).toBe(false);
    expect(formSupportsPublicLinkAiFill(student)).toBe(false);
  });

  it("allows public-link AI only for staff-fill forms that already support AI in-app", () => {
    const prep = FORM_SCHEMAS.find((s) => s.id === "tachi-prep");
    const parent = FORM_SCHEMAS.find((s) => s.id === "parent-questionnaire");
    expect(prep).toBeTruthy();
    expect(parent).toBeTruthy();
    expect(formSupportsPublicLinkAiFill(prep)).toBe(true);
    expect(formSupportsPublicLinkAiFill(parent)).toBe(false);
    const referral = FORM_SCHEMAS.find((s) => s.id === "referral-questionnaire");
    expect(formSupportsPublicLinkAiFill(referral)).toBe(true);
  });

  it("in free access allows only referral questionnaires", () => {
    const school = FORM_SCHEMAS.find((s) => s.id === "referral-questionnaire");
    expect(formSupportsAiFill(school, { freeAccess: true })).toBe(true);
    expect(formSupportsAiFill(integrative, { freeAccess: true })).toBe(false);
    const daily = FORM_SCHEMAS.find((s) => s.id === "daily-learning-plan");
    if (daily) {
      expect(formSupportsAiFill(daily, { freeAccess: true })).toBe(false);
    }
  });
});

describe("buildAiFillFieldDescriptors", () => {
  it("excludes daily-learning summary column from AI fill", () => {
    const daily = FORM_SCHEMAS.find((s) => s.id === "daily-learning-plan");
    expect(daily).toBeTruthy();
    const descriptors = buildAiFillFieldDescriptors(daily!, {});
    const keys = descriptors.map((d) => d.key);

    expect(keys).toContain(tableCellKey("daily-learning", 0, "goals"));
    expect(keys).toContain(tableCellKey("daily-learning", 0, "lesson"));
    expect(keys).not.toContain(tableCellKey("daily-learning", 0, "summary"));
    expect(keys.some((k) => k.includes("_summary"))).toBe(false);
  });

  it("does not apply AI summary from a daily-learning patch", () => {
    const daily = FORM_SCHEMAS.find((s) => s.id === "daily-learning-plan");
    expect(daily).toBeTruthy();
    const descriptors = buildAiFillFieldDescriptors(daily!, {});
    const allowed = new Set(descriptors.map((d) => d.key));
    const summaryKey = tableCellKey("daily-learning", 0, "summary");
    const goalsKey = tableCellKey("daily-learning", 0, "goals");

    const patch = flattenAiFillPatch(
      {
        rows: [
          {
            goals: "מטרה אמיתית",
            summary: "סיכום מומצא",
            סיכום: "עוד המצאה",
          },
        ],
      },
      allowed
    );
    const merged = mergeAiFillIntoData({}, patch, allowed);

    expect(merged[goalsKey]).toBe("מטרה אמיתית");
    expect(merged[summaryKey]).toBeUndefined();
  });

  it("includes teacher-added TACHI/TLA goal rows from live form data, not defaultRows", () => {
    expect(integrative).toBeTruthy();
    const tla = FORM_SCHEMAS.find((s) => s.id === "tla-integrative");
    const tachi = FORM_SCHEMAS.find((s) => s.id === "tachi");
    expect(tla).toBeTruthy();
    expect(tachi).toBeTruthy();

    const extraIntegrative = {
      [tableRowCountKey("tachi-integrative-goals")]: "6",
      [tableCellKey("tachi-integrative-goals", 4, "goal")]: "יעד שהמורה הוסיפה",
      [tableCellKey("tachi-integrative-goals", 5, "goal")]: "",
    };
    const defaultKeys = buildAiFillFieldDescriptors(integrative!, {}).map(
      (item) => item.key
    );
    const liveKeys = buildAiFillFieldDescriptors(
      integrative!,
      extraIntegrative
    ).map((item) => item.key);
    const tlaLiveKeys = buildAiFillFieldDescriptors(tla!, extraIntegrative).map(
      (item) => item.key
    );

    expect(defaultKeys).toContain(
      tableCellKey("tachi-integrative-goals", 3, "goal")
    );
    expect(defaultKeys).not.toContain(
      tableCellKey("tachi-integrative-goals", 4, "goal")
    );
    expect(liveKeys).toContain(
      tableCellKey("tachi-integrative-goals", 4, "goal")
    );
    expect(liveKeys).toContain(
      tableCellKey("tachi-integrative-goals", 5, "teacher")
    );
    expect(tlaLiveKeys).toContain(
      tableCellKey("tachi-integrative-goals", 5, "goal")
    );

    const extraTachiGoals = {
      [tableRowCountKey("tachi-goals")]: "7",
      [tableCellKey("tachi-goals", 5, "goal")]: "יעד תח״י נוסף",
      [tableCellKey("tachi-goals", 6, "methods")]: "",
    };
    const tachiDefault = buildAiFillFieldDescriptors(tachi!, {}).map(
      (item) => item.key
    );
    const tachiLive = buildAiFillFieldDescriptors(tachi!, extraTachiGoals).map(
      (item) => item.key
    );
    expect(tachiDefault).not.toContain(tableCellKey("tachi-goals", 5, "goal"));
    expect(tachiLive).toContain(tableCellKey("tachi-goals", 5, "goal"));
    expect(tachiLive).toContain(tableCellKey("tachi-goals", 6, "methods"));
  });
});

describe("currentFormDataFromAiFields", () => {
  it("reconstructs row counts from the rows field and from extra cell keys", () => {
    const fifthGoal = tableCellKey("tachi-integrative-goals", 4, "goal");
    const sixthTeacher = tableCellKey("tachi-integrative-goals", 5, "teacher");
    const fromCount = currentFormDataFromAiFields([
      { key: tableRowCountKey("tachi-integrative-goals"), currentValue: "6" },
      { key: fifthGoal, currentValue: "יעד 5" },
    ]);
    expect(fromCount[tableRowCountKey("tachi-integrative-goals")]).toBe("6");
    expect(fromCount[fifthGoal]).toBe("יעד 5");

    const inferred = currentFormDataFromAiFields([
      { key: fifthGoal, currentValue: "יעד בלי מונה" },
      { key: sixthTeacher, currentValue: "" },
    ]);
    expect(inferred[tableRowCountKey("tachi-integrative-goals")]).toBe("6");
    expect(inferred[fifthGoal]).toBe("יעד בלי מונה");
  });
});

describe("flattenAiFillPatch", () => {
  it("maps a goals array onto integrative table cell keys", () => {
    expect(integrative).toBeTruthy();
    const descriptors = buildAiFillFieldDescriptors(integrative!, {});
    const allowed = new Set(descriptors.map((d) => d.key));
    const patch = flattenAiFillPatch(
      {
        baseline: "קו בסיס מוצע",
        goals: [
          {
            goal: "יעד ראשון",
            teacher: "דרכי הוראה למורה",
            aide: "ליווי סייעת",
            other: "מטפחת רגשית",
            formative: "תצפית שבועית",
            summative: "סיכום מחצית",
            notes: "לתאם עם הצוות",
          },
          {
            יעדים: "יעד שני",
            מורה: "פירוק משימה",
          },
        ],
      },
      allowed
    );

    expect(patch.baseline).toBe("קו בסיס מוצע");
    expect(patch[tableCellKey("tachi-integrative-goals", 0, "goal")]).toBe(
      "יעד ראשון"
    );
    expect(patch[tableCellKey("tachi-integrative-goals", 0, "teacher")]).toBe(
      "דרכי הוראה למורה"
    );
    expect(patch[tableCellKey("tachi-integrative-goals", 0, "aide")]).toBe(
      "ליווי סייעת"
    );
    expect(patch[tableCellKey("tachi-integrative-goals", 1, "goal")]).toBe(
      "יעד שני"
    );
    expect(patch[tableCellKey("tachi-integrative-goals", 1, "teacher")]).toBe(
      "פירוק משימה"
    );
    expect(patch[tableRowCountKey("tachi-integrative-goals")]).toBe("2");
  });

  it("keeps exact table keys and merges into empty form data", () => {
    expect(integrative).toBeTruthy();
    const descriptors = buildAiFillFieldDescriptors(integrative!, {});
    const allowed = new Set(descriptors.map((d) => d.key));
    const goalKey = tableCellKey("tachi-integrative-goals", 0, "goal");
    const patch = flattenAiFillPatch({ [goalKey]: "יעד מדויק" }, allowed);
    const merged = mergeAiFillIntoData({}, patch, allowed);
    expect(merged[goalKey]).toBe("יעד מדויק");
  });

  it("maps AI answers back onto teacher-added goal rows", () => {
    expect(integrative).toBeTruthy();
    const live = {
      [tableRowCountKey("tachi-integrative-goals")]: "6",
    };
    const descriptors = buildAiFillFieldDescriptors(integrative!, live);
    const allowed = new Set(descriptors.map((item) => item.key));
    const fifth = tableCellKey("tachi-integrative-goals", 4, "goal");
    const sixth = tableCellKey("tachi-integrative-goals", 5, "teacher");
    const patch = flattenAiFillPatch(
      {
        [fifth]: "יעד לשורה שהמורה הוסיפה",
        [sixth]: "דרכי הוראה לשורה 6",
      },
      allowed
    );
    const merged = mergeAiFillIntoData(live, patch, allowed);
    expect(merged[fifth]).toBe("יעד לשורה שהמורה הוסיפה");
    expect(merged[sixth]).toBe("דרכי הוראה לשורה 6");
  });
});

describe("mergeAiFillIntoCurrentData", () => {
  const allowed = new Set([
    "edited",
    "empty",
    "already",
    "cleared",
    "notes",
    "prefilled",
    "manual",
    "aiField",
    "editedByTeacher",
    "untouchedAi",
  ]);

  it("keeps a field the teacher edited during the request", () => {
    const baseline = { edited: "", empty: "", already: "קיים" };
    const current = {
      edited: "המורה הקלידה בזמן ההמתנה",
      empty: "",
      already: "קיים",
    };
    const patch = {
      edited: "טיוטת AI שדורסת",
      empty: "טיוטת AI לשדה ריק",
      already: "AI לא אמור לדרוס",
    };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed);

    expect(merged.edited).toBe("המורה הקלידה בזמן ההמתנה");
  });

  it("fills untouched empty fields with the AI value", () => {
    const baseline = { edited: "", empty: "", already: "קיים" };
    const current = {
      edited: "המורה הקלידה בזמן ההמתנה",
      empty: "",
      already: "קיים",
    };
    const patch = {
      edited: "טיוטת AI שדורסת",
      empty: "טיוטת AI לשדה ריק",
      already: "AI לא אמור לדרוס",
    };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed);

    expect(merged.empty).toBe("טיוטת AI לשדה ריק");
    expect(merged.already).toBe("קיים");
  });

  it("does not revert concurrent edits the way a stale snapshot merge would", () => {
    const baseline = { notes: "" };
    const current = { notes: "הקלדה בזמן ההמתנה", extra: "שורה שהמורה הוסיפה" };
    const patch = { notes: "טיוטת AI" };
    const keys = new Set(["notes"]);

    const stale = mergeAiFillIntoData(baseline, patch, keys);
    expect(stale.notes).toBe("טיוטת AI");
    expect(stale.extra).toBeUndefined();

    const live = mergeAiFillIntoCurrentData(current, baseline, patch, keys);
    expect(live.notes).toBe("הקלדה בזמן ההמתנה");
    expect(live.extra).toBe("שורה שהמורה הוסיפה");
  });

  it("does not refill a field the teacher cleared while waiting", () => {
    const baseline = { cleared: "טקסט ישן" };
    const current = { cleared: "" };
    const patch = { cleared: "טיוטת AI" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed);
    expect(merged.cleared).toBe("");
  });

  it("refine updates a field the teacher did not edit (field holds last AI value)", () => {
    const baseline = { edited: "מילוי AI קודם", empty: "" };
    const current = { edited: "מילוי AI קודם", empty: "" };
    const patch = { edited: "מילוי AI חדש", empty: "שדה חדש" };
    const lastAiValues = { edited: "מילוי AI קודם" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: true,
      lastAiValues,
    });

    expect(merged.edited).toBe("מילוי AI חדש");
    expect(merged.empty).toBe("שדה חדש");
  });

  it("without refine, a filled field is not overwritten", () => {
    const baseline = { already: "ערך קיים", empty: "" };
    const current = { already: "ערך קיים", empty: "" };
    const patch = { already: "AI רוצה לדרוס", empty: "מילוי חדש" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: false,
    });

    expect(merged.already).toBe("ערך קיים");
    expect(merged.empty).toBe("מילוי חדש");
  });

  it("teacher edit during wait is preserved even when refine is on", () => {
    const baseline = { edited: "ערך ישן" };
    const current = { edited: "המורה שינתה בזמן ההמתנה" };
    const patch = { edited: "AI רוצה לדרוס" };
    const lastAiValues = { edited: "ערך ישן" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: true,
      lastAiValues,
    });

    expect(merged.edited).toBe("המורה שינתה בזמן ההמתנה");
  });

  it("first fill with notes does not treat teacher-prefilled baseline fields as refinable", () => {
    const baseline = { prefilled: "המורה מילאה לפני הקליק", empty: "" };
    const current = { prefilled: "המורה מילאה לפני הקליק", empty: "" };
    const patch = { prefilled: "AI רוצה לדרוס", empty: "מילוי AI" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: false,
    });

    expect(merged.prefilled).toBe("המורה מילאה לפני הקליק");
    expect(merged.empty).toBe("מילוי AI");
  });

  it("refine preserves a field the teacher edited after the last AI fill (value drifted from lastAiValues)", () => {
    const baseline = { aiField: "טקסט עם סייעת (מסונכרן)" };
    const current = { aiField: "טקסט עם סייעת (מסונכרן)" };
    const patch = { aiField: "טקסט בלי אזכור סייעת" };
    const lastAiValues = { aiField: "טקסט עם סייעת (מהמילוי הראשון)" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: true,
      lastAiValues,
    });

    expect(merged.aiField).toBe("טקסט עם סייעת (מסונכרן)");
  });

  it("refine preserves teacher edit on one AI field and updates other AI fields still at lastAiValues", () => {
    const baseline = {
      editedByTeacher: "עריכת מורה אחרי מילוי AI",
      untouchedAi: "שדה AI שלא נגעו בו",
    };
    const current = { ...baseline };
    const patch = {
      editedByTeacher: "AI רוצה לדרוס עריכת מורה",
      untouchedAi: "AI עדכון שני",
    };
    const lastAiValues = {
      editedByTeacher: "מילוי AI מקורי",
      untouchedAi: "שדה AI שלא נגעו בו",
    };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: true,
      lastAiValues,
    });

    expect(merged.editedByTeacher).toBe("עריכת מורה אחרי מילוי AI");
    expect(merged.untouchedAi).toBe("AI עדכון שני");
  });

  it("refine does not overwrite fields the teacher filled manually before clicking (not in lastAiValues)", () => {
    const baseline = { manual: "המורה מילאה ידנית", aiField: "AI מילא קודם" };
    const current = { manual: "המורה מילאה ידנית", aiField: "AI מילא קודם" };
    const patch = { manual: "AI רוצה לדרוס", aiField: "AI עדכון" };
    const lastAiValues = { aiField: "AI מילא קודם" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, allowed, {
      refine: true,
      lastAiValues,
    });

    expect(merged.manual).toBe("המורה מילאה ידנית");
    expect(merged.aiField).toBe("AI עדכון");
  });

  it("second click without notes (refine=false) does not overwrite filled fields", () => {
    const baseline = { goal: "AI מילא קודם", status: "AI מילא קודם" };
    const current = { goal: "AI מילא קודם", status: "AI מילא קודם" };
    const patch = { goal: "AI רוצה לדרוס", status: "AI רוצה לדרוס" };

    const merged = mergeAiFillIntoCurrentData(current, baseline, patch, new Set(["goal", "status"]), {
      refine: false,
    });

    expect(merged.goal).toBe("AI מילא קודם");
    expect(merged.status).toBe("AI מילא קודם");
  });

  it("refine 2 updates status that remained from earlier fill even when refine 1 returned only goal", () => {
    const keys = new Set(["goal", "status"]);

    const baseline1 = { goal: "", status: "" };
    const current1 = { goal: "", status: "" };
    const patch1 = { goal: "מטרה AI 1", status: "סטטוס AI 1" };
    const merged1 = mergeAiFillIntoCurrentData(current1, baseline1, patch1, keys, { refine: false });
    expect(merged1.goal).toBe("מטרה AI 1");
    expect(merged1.status).toBe("סטטוס AI 1");

    const lastAiValues1: Record<string, string> = {};
    for (const key of Object.keys(patch1)) {
      if (keys.has(key) && merged1[key] !== (current1 as Record<string, string>)[key]) {
        lastAiValues1[key] = merged1[key];
      }
    }
    expect(lastAiValues1).toEqual({ goal: "מטרה AI 1", status: "סטטוס AI 1" });

    const baseline2 = { ...merged1 };
    const current2 = { ...merged1 };
    const patch2 = { goal: "מטרה AI 2" };
    const merged2 = mergeAiFillIntoCurrentData(current2, baseline2, patch2, keys, {
      refine: true,
      lastAiValues: lastAiValues1,
    });
    expect(merged2.goal).toBe("מטרה AI 2");
    expect(merged2.status).toBe("סטטוס AI 1");

    const lastAiValues2 = { ...lastAiValues1 };
    for (const key of Object.keys(patch2)) {
      if (keys.has(key) && merged2[key] !== current2[key]) {
        lastAiValues2[key] = merged2[key];
      }
    }
    expect(lastAiValues2).toEqual({ goal: "מטרה AI 2", status: "סטטוס AI 1" });

    const baseline3 = { ...merged2 };
    const current3 = { ...merged2 };
    const patch3 = { status: "סטטוס AI 3" };
    const merged3 = mergeAiFillIntoCurrentData(current3, baseline3, patch3, keys, {
      refine: true,
      lastAiValues: lastAiValues2,
    });
    expect(merged3.goal).toBe("מטרה AI 2");
    expect(merged3.status).toBe("סטטוס AI 3");
  });
});
