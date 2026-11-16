/** סנכרון דו-כיווני בין טופס מובנה לכרטיס התלמיד + בין טפסים */

import {
  listFormFields,
  type FormSchema,
} from "@/lib/form-schemas";
import {
  buildSemanticValuePool,
  lookupSemanticValue,
} from "@/lib/form-field-aliases";
import {
  homeroomReportFlatKeys,
  homeroomReportInitialData,
} from "@/lib/homeroom-report-grid";
import {
  getTableIdFromFieldKey,
  resolveTableRowCount,
  rowTableFlatKeys,
  rowTableInitialData,
  scheduleFlatKeys,
  scheduleInitialData,
  FORM_TABLE_DEFS,
  tableCellKey,
  tableRowCountKey,
} from "@/lib/form-table-grids";
import { prefillMoeWaiverParentFields } from "@/lib/waiver-form-prefill";
import {
  getStudentPrefillValue,
  isParentSignatureField,
  mapGenderFormToCard,
  looksLikeDateValue,
  normalizeDateValueForStorage,
  sharedValuesToStudentPatch,
  studentKeyForFormField,
  studentToSharedValues,
  type FormFieldDef,
  type SharedFieldKey,
} from "@/lib/form-fields";
import type { Student, StudentCustomField, StudentFormFill } from "@/lib/supabase/types";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import { shouldWriteSpecialEdClassName } from "@/lib/special-ed-classes";
import {
  isPersonalScheduleCellKey,
  mergeEmptyScheduleCells,
} from "@/lib/staff-schedule-sync";
import { joinPersonName } from "@/lib/person-name";
import {
  enrichStudentTeamHomeroomFromInstitutionStaff,
  type InstitutionStaffPickerRow,
} from "@/lib/student-team-staff";
import {
  currentCalendarYear,
  formatHebrewYear,
  parseCalendarYear,
} from "@/lib/calendar-year";

const STRUCTURAL_FIELD_TYPES = new Set([
  "static",
  "rating-grid",
  "schedule-grid",
  "row-table",
  "accommodations-picker",
]);

const ASSESSMENT_FORM_IDS = new Set([
  "formative-assessment-table",
  "formative-assessment-verbal",
  "summative-assessment-table",
  "summative-assessment-verbal",
]);

const TACHI_SOURCE_FORM_IDS = new Set([
  "tachi",
  "tachi-integrative",
  "tla",
  "tla-integrative",
]);

/**
 * תוכניות מקבילות — לא שואבות תוכן זו מזו (תח"י ≠ תח"י אינטגרטיבי וכו').
 * הערכות מעצבות/מסכמות עדיין יכולות לשאוב מכל מקורות התח"י בנפרד.
 */
const CROSS_FORM_PROGRAM_EXCLUSIONS: Record<string, readonly string[]> = {
  tachi: ["tachi-integrative"],
  "tachi-integrative": ["tachi"],
  tla: ["tla-integrative"],
  "tla-integrative": ["tla"],
};

function isExcludedCrossFormSource(
  targetFormId: string,
  sourceFormId: string
): boolean {
  const blocked = CROSS_FORM_PROGRAM_EXCLUSIONS[targetFormId];
  return Boolean(blocked?.includes(sourceFormId));
}
type TachiSeedValues = {
  openingStatus: string;
  goals: string;
  domain: string;
};

function goalsFromTachiTable(
  data: Record<string, string> | null | undefined,
  tableId: string,
  goalColumn: string
): string {
  if (!data) return "";
  const rows = resolveTableRowCount(tableId, data);
  const parts: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const value = String(data[tableCellKey(tableId, row, goalColumn)] ?? "").trim();
    if (value) parts.push(value);
  }
  return parts.join("\n");
}

/** מצב פתיחה + מטרות מתח"י / תל"א (רגיל או אינטגרטיבי), כולל יעדים מטבלה */
function latestTachiSeedValues(fills: StudentFormFill[]): TachiSeedValues {
  const ordered = [...fills]
    .filter((fill) => TACHI_SOURCE_FORM_IDS.has(fill.form_id))
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  let openingStatus = "";
  let goals = "";
  let domain = "";

  for (const fill of ordered) {
    const data = fill.data ?? {};
    const isIntegrative =
      fill.form_id === "tachi-integrative" || fill.form_id === "tla-integrative";

    if (!openingStatus) {
      const status = isIntegrative
        ? String(data.baseline ?? "").trim()
        : String(data.current_status ?? "").trim();
      if (status) openingStatus = status;
    }

    if (!goals) {
      const main = isIntegrative
        ? String(data.main_goals ?? "").trim()
        : String(data.main_goal ?? "").trim();
      if (main) {
        goals = main;
      } else {
        const fromTable = isIntegrative
          ? goalsFromTachiTable(data, "tachi-integrative-goals", "goal")
          : goalsFromTachiTable(data, "tachi-goals", "goal");
        if (fromTable) goals = fromTable;
      }
    }

    if (!domain) {
      const d = String(data.domain ?? "").trim();
      if (d) domain = d;
    }

    if (openingStatus && goals && domain) break;
  }

  return { openingStatus, goals, domain };
}

function latestTachiCurrentStatus(fills: StudentFormFill[]): string {
  return latestTachiSeedValues(fills).openingStatus;
}

const TLA_PRESENTATION_PREP_KEYS = [
  "strengths",
  "areas_to_strengthen",
] as const;

/**
 * דף הצגת תל"א — מושך מוקדי כוח ומוקדים לחיזוק מדף ההכנה (מחוון).
 * דורס שאיבה מטפסים אחרים, אבל לא דורס ערך שנשמר בדף ההצגה עצמו.
 */
function prefillTlaPresentationFromPrep(
  schema: FormSchema,
  initial: Record<string, string>,
  fills: StudentFormFill[],
  saved?: Record<string, string> | null
): void {
  if (schema.id !== "tla-presentation") return;

  const prep = [...fills]
    .filter((fill) => fill.form_id === "tla-prep")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
  if (!prep?.data) return;

  for (const key of TLA_PRESENTATION_PREP_KEYS) {
    if (String(saved?.[key] ?? "").trim()) continue;
    const value = String(prep.data[key] ?? "").trim();
    if (value) initial[key] = value;
  }
}

/** כיתה ומחנכת — מהכרטיס (גובר), ואז מטפסים אחרים */
const PERSONAL_TIMETABLE_FORM_IDS = new Set([
  "personal-schedule",
  "schedule-detailed",
]);

/**
 * TZ-184: מערכת שעות אישית — שם וכיתה מהכרטיס גם אחרי מיזוג טיוטה/שאיבה.
 */
export function applyStudentCardBackedScheduleFields(
  schema: FormSchema,
  student: Student,
  data: Record<string, string>
): Record<string, string> {
  if (!PERSONAL_TIMETABLE_FORM_IDS.has(schema.id)) return data;
  const next = { ...data };
  const shared = studentToSharedValues(student);
  for (const field of listFormFields(schema)) {
    const studentKey = studentKeyForFormField(field);
    if (studentKey !== "full_name" && studentKey !== "class_name") continue;
    const fromCard = (shared[studentKey] ?? "").trim();
    if (fromCard) next[field.key] = fromCard;
  }
  return next;
}

function prefillClassAndHomeroomFields(
  schema: FormSchema,
  initial: Record<string, string>,
  student: Student,
  fills: StudentFormFill[]
): void {
  const fields = listFormFields(schema);
  const classFields = fields.filter(
    (field) => studentKeyForFormField(field) === "class_name"
  );
  const hasHomeroom = fields.some((field) => field.key === "homeroom_teacher");
  if (classFields.length === 0 && !hasHomeroom) return;

  const ordered = [...fills]
    .filter((fill) => fill.form_id !== schema.id)
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  function pickFromFills(keys: string[]): string {
    for (const fill of ordered) {
      // בשאלון הפניה «מחנך» = ממלא השאלון — לא מקור אמין למחנכת הכיתה
      if (
        keys.includes("homeroom_teacher") &&
        (fill.form_id === "referral-questionnaire" ||
          fill.form_id === "referral-questionnaire-multidisciplinary" ||
          fill.form_id === "referral-questionnaire-kindergarten")
      ) {
        continue;
      }
      for (const key of keys) {
        const value = String(fill.data?.[key] ?? "").trim();
        if (value) return value;
      }
    }
    return "";
  }

  const classFromCard = String(student.class_name ?? "").trim();
  for (const field of classFields) {
    if (classFromCard) {
      initial[field.key] = classFromCard;
      continue;
    }
    if ((initial[field.key] ?? "").trim()) continue;
    initial[field.key] = pickFromFills(CLASS_NAME_FILL_KEYS);
  }

  if (hasHomeroom && !(initial.homeroom_teacher ?? "").trim()) {
    const fromCard = String(student.homeroom_teacher ?? "").trim();
    const fromForms = pickFromFills(["homeroom_teacher"]);
    initial.homeroom_teacher = fromCard || fromForms;
  }
}

function applyTachiSeedToVerbalAssessment(
  schema: FormSchema,
  initial: Record<string, string>,
  seed: TachiSeedValues
): void {
  if (
    schema.id !== "formative-assessment-verbal" &&
    schema.id !== "summative-assessment-verbal"
  ) {
    return;
  }

  if (seed.domain && !(initial.domain ?? "").trim()) {
    initial.domain = seed.domain;
  }
  if (seed.domain && schema.id === "summative-assessment-verbal") {
    if (!(initial.topic ?? "").trim()) initial.topic = seed.domain;
  }

  if (seed.openingStatus && !(initial.initial_status ?? "").trim()) {
    initial.initial_status = seed.openingStatus;
  }

  if (schema.id === "formative-assessment-verbal") {
    if (seed.goals && !(initial.goals_rest_of_year ?? "").trim()) {
      initial.goals_rest_of_year = seed.goals;
    }
  } else if (seed.goals && !(initial.goals_and_process ?? "").trim()) {
    initial.goals_and_process = seed.goals;
  }
}

function mergeDefaults(
  initial: Record<string, string>,
  defaults: Record<string, string>
): void {
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in initial) || initial[key] === "") {
      initial[key] = value;
    }
  }
}

function normalizeFieldLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/["'`״׳]/g, "")
    .replace(/[\s_:.\-/\\]+/g, " ")
    .replace(/\s+/g, " ");
}

/** תוויות נפוצות בכרטיס לשדה תאריך כניסה לשילוב בטופס */
const INTEGRATION_START_LABEL_HINTS = [
  "תאריך כניסה למערך השילוב",
  "תאריך כניסה לשילוב",
  "כניסה למערך השילוב",
  "כניסה לשילוב",
  "תאריך שילוב",
];

const CLASS_NAME_CUSTOM_LABEL_HINTS = [
  "כיתה",
  "דרגת הכיתה",
  "דרגת כיתה",
  "שם הגן",
  "כיתה / דרגת גן",
];

const CLASS_NAME_FILL_KEYS = [
  "class_name",
  "class_level",
  "class_or_gan_level",
];

function customFieldMatchesFormField(
  customLabel: string,
  formField: Pick<FormFieldDef, "key" | "label" | "shared" | "studentKey">
): boolean {
  const customNorm = normalizeFieldLabel(customLabel);
  const formNorm = normalizeFieldLabel(formField.label);
  if (!customNorm || !formNorm) return false;
  if (customNorm === formNorm) return true;
  if (studentKeyForFormField(formField) === "class_name") {
    if (
      CLASS_NAME_CUSTOM_LABEL_HINTS.some(
        (hint) => normalizeFieldLabel(hint) === customNorm
      )
    ) {
      return true;
    }
    if (customNorm.includes("כיתה") || customNorm.includes("גן")) {
      return true;
    }
  }
  if (
    formField.key === "integration_start_date" ||
    formField.key === "integration_entry_date"
  ) {
    if (
      INTEGRATION_START_LABEL_HINTS.some(
        (hint) => normalizeFieldLabel(hint) === customNorm
      )
    ) {
      return true;
    }
    // התאמה רכה: גם «כניסה» וגם «שילוב» בתווית
    if (customNorm.includes("כניסה") && customNorm.includes("שילוב")) {
      return true;
    }
  }
  return false;
}

function valueForFormFieldType(
  raw: string,
  fieldType: string | undefined
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (fieldType === "date" && looksLikeDateValue(trimmed)) {
    return normalizeDateValueForStorage(trimmed);
  }
  return trimmed;
}

/**
 * שאיבת ערכים משדות מותאמים בכרטיס לטופס — לפי תווית זהה / נרדפת.
 * לא דורס ערכים שכבר מולאו.
 */
export function prefillFormFromCustomFields(
  fields: FormFieldDef[],
  customFields: StudentCustomField[],
  initial: Record<string, string>,
  cardBackedKeys?: Set<string>
): void {
  if (!customFields.length) return;
  for (const field of fields) {
    if (field.type && STRUCTURAL_FIELD_TYPES.has(field.type)) continue;
    if ((initial[field.key] ?? "").trim()) continue;
    const match = customFields.find((custom) =>
      customFieldMatchesFormField(custom.label, field)
    );
    if (!match) continue;
    const value = valueForFormFieldType(match.value ?? "", field.type);
    if (!value) continue;
    initial[field.key] = value;
    cardBackedKeys?.add(field.key);
  }
}

/**
 * אחרי שמירת טופס — מעדכן שדות מותאמים בכרטיס עם אותה תווית (או יוצר אם חסר).
 */
export async function syncFormFieldsToCustomCardFields(options: {
  studentId: string;
  schema: FormSchema;
  data: Record<string, string>;
  customFields: StudentCustomField[];
  updateCustomField: (
    id: string,
    patch: { value: string }
  ) => Promise<unknown>;
  addCustomField: (
    studentId: string,
    label: string,
    value: string
  ) => Promise<unknown>;
}): Promise<void> {
  const {
    studentId,
    schema,
    data,
    customFields,
    updateCustomField,
    addCustomField,
  } = options;
  const fields = listFormFields(schema);

  for (const field of fields) {
    if (field.type && STRUCTURAL_FIELD_TYPES.has(field.type)) continue;
    // רק שדות שאינם משותפים לכרטיס הראשי — השאר כבר ב־studentPatch
    if (field.shared) continue;
    const value = (data[field.key] ?? "").trim();
    if (!value) continue;

    const existing = customFields.find((custom) =>
      customFieldMatchesFormField(custom.label, field)
    );
    if (existing) {
      if ((existing.value ?? "").trim() === value) continue;
      await updateCustomField(existing.id, { value });
      continue;
    }

    // יוצרים שדה בכרטיס רק לשדות מוכרים שמשתמשים ממלאים בכרטיס (כניסה לשילוב)
    if (
      field.key === "integration_start_date" ||
      field.key === "integration_entry_date"
    ) {
      await addCustomField(studentId, "תאריך כניסה לשילוב", value);
    }
  }
}

/** שדות מקומיים לטופס — לא מועברים אוטומטית בין טפסים */
const NON_PORTABLE_CROSS_FORM_KEYS = new Set([
  "form_heading",
  "consent_body",
  "closing",
  "intro",
  "closing_blessing",
  "father_signature",
  "mother_signature",
  "father_id",
  "mother_id",
  "parents_signature",
  "parent_signature",
  "parent_sign",
  "parent1_signature",
  "parent2_signature",
  "parent1_sign",
  "parent2_sign",
  "parent1_id",
  "parent2_id",
  "parent1_sign_date",
  "parent2_sign_date",
  "parent_sign_date",
  "homeroom_signature",
  "integration_teacher_signature",
  "support_teacher_signature",
  "teacher_sign",
  "psychologist_sign",
  "supervisor_sign",
  "principal_sign",
  "principal_signature",
  "supervisor_signature",
  "signer_signature",
  "student_signature",
  "coordinator_sign",
  "inspector_sign",
  "filled_at",
  "signer_date",
  "meeting_date",
  "supervisor_date",
  "parents_copy_date",
  "referral_date",
  "signer_name",
  "filled_by",
  "report_author",
]);

/** חתימות ותאריכי חתימה — כל טופס נחתם בנפרד, בלי שאיבה אוטומטית */
function isNonPortableCrossFormKey(key: string): boolean {
  if (NON_PORTABLE_CROSS_FORM_KEYS.has(key)) return true;
  if (isParentSignatureField(key)) return true;
  const k = key.trim().toLowerCase();
  if (k.includes("signature")) return true;
  if (/(^|_)sign(_date|_name)?$/.test(k)) return true;
  if (/_sign_date$/.test(k) || /_sign_name$/.test(k)) return true;
  return false;
}

function buildCrossFormValuePool(
  schema: FormSchema,
  fills: StudentFormFill[]
): Record<string, string> {
  const ordered = [...fills]
    .filter((fill) => fill.form_id !== schema.id)
    .filter((fill) => !isExcludedCrossFormSource(schema.id, fill.form_id))
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  const entries: Array<{ key: string; value: string }> = [];
  for (const fill of ordered) {
    for (const [key, value] of Object.entries(fill.data ?? {})) {
      if (isNonPortableCrossFormKey(key)) continue;
      // בתח"י/תל"א "מצב נוכחי" (או קו בסיס) הוא נקודת הפתיחה של מסמכי ההערכה,
      // ולא "מצב נוכחי" של ההערכה עצמה.
      if (
        ASSESSMENT_FORM_IDS.has(schema.id) &&
        TACHI_SOURCE_FORM_IDS.has(fill.form_id) &&
        (key === "current_status" || key === "baseline")
      ) {
        continue;
      }
      entries.push({ key, value: String(value ?? "") });
    }
  }

  return buildSemanticValuePool(entries);
}

/**
 * בפתיחת טופס:
 * 1) כרטיס התלמיד (כל שדה שניתן לשאוב)
 * 2) שדות מותאמים בכרטיס (לפי תווית — למשל תאריך כניסה לשילוב)
 * 3) ערכים מטפסים אחרים (כולל מפתחות נרדפים)
 * 4) מילוי שמור של הטופס הנוכחי (גובר על שאיבה, חוץ משדות שיש להם ערך בכרטיס)
 */
/** פרטי מוסד מהפרופיל — למילוי שם בית ספר / סמל מוסד בטפסים */
export type InstitutionFormPrefill = {
  school_name?: string | null;
  institution_name?: string | null;
  institution_code?: string | null;
};

/** שדות שבטיוטה שמורה גוברים על כרטיס התלמיד (למשל ת.ז. בויתור סודיות) */
const SAVED_OVERRIDES_CARD_KEYS = new Set([
  "student_id_number",
  "father_id",
  "mother_id",
  "parent1_id",
  "parent2_id",
  "parent_guardian_id",
  "parent_guardian_name",
]);

export function buildFormInitialData(
  schema: FormSchema,
  student: Student,
  saved?: Record<string, string> | null,
  allFills: StudentFormFill[] = [],
  customFields: StudentCustomField[] = [],
  institution?: InstitutionFormPrefill | null,
  institutionStaff?: InstitutionStaffPickerRow[] | null
): Record<string, string> {
  const shared = studentToSharedValues(student);
  const fields = listFormFields(schema);
  const initial: Record<string, string> = {};
  /** שדות שקיבלו ערך מהכרטיס — לא יידרסו ע״י טיוטה ישנה */
  const cardBackedKeys = new Set<string>();
  const crossFormValues = buildCrossFormValuePool(schema, allFills);
  const tachiSeed = ASSESSMENT_FORM_IDS.has(schema.id)
    ? latestTachiSeedValues(allFills)
    : { openingStatus: "", goals: "", domain: "" };
  const tachiCurrentStatus = tachiSeed.openingStatus;

  for (const field of fields) {
    if (field.type && STRUCTURAL_FIELD_TYPES.has(field.type)) continue;
    const studentPrefill = getStudentPrefillValue(field, shared);
    if (studentPrefill.trim()) {
      cardBackedKeys.add(field.key);
      initial[field.key] = studentPrefill;
    } else if (field.type === "checkbox") {
      initial[field.key] = "false";
    } else {
      initial[field.key] = "";
    }
  }

  prefillFormFromCustomFields(fields, customFields, initial, cardBackedKeys);

  applyTachiSeedToVerbalAssessment(schema, initial, tachiSeed);

  for (const field of fields) {
    if (field.type && STRUCTURAL_FIELD_TYPES.has(field.type)) continue;
    if ((initial[field.key] ?? "").trim()) continue;
    const crossValue = lookupSemanticValue(crossFormValues, field.key);
    if (crossValue) initial[field.key] = crossValue;
  }

  if (saved) {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined || value === null || String(value).length === 0) {
        continue;
      }
      if (
        cardBackedKeys.has(key) &&
        (initial[key] ?? "").trim() &&
        !SAVED_OVERRIDES_CARD_KEYS.has(key)
      ) {
        continue;
      }
      initial[key] = String(value);
    }
  }

  // אחרי טיוטה שמורה — משלימים שוב שדות ריקים מתח"י (אם התח"י עודכן בינתיים)
  applyTachiSeedToVerbalAssessment(schema, initial, tachiSeed);

  // כיתה / מחנכת — מהכרטיס + מטפסים אחרים, גם אחרי טיוטה ריקה
  prefillClassAndHomeroomFields(schema, initial, student, allFills);

  if (
    schema.id === "functional-educational-report" &&
    !(initial.parents_names ?? "").trim()
  ) {
    const parentNames = [student.father_name, student.mother_name]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (parentNames.length) {
      initial.parents_names = parentNames.join(" / ");
    }
  }

  // דף הצגת תל"א — מוקדי כוח ומוקדים לחיזוק מדף ההכנה (מחוון)
  prefillTlaPresentationFromPrep(schema, initial, allFills, saved);

  if (schema.id === "student-info") {
    mergeDefaults(initial, homeroomReportInitialData());
    for (const key of homeroomReportFlatKeys()) {
      if (!(key in initial)) initial[key] = "";
    }
  }

  if (schema.id === "schedule") {
    mergeDefaults(initial, scheduleInitialData("simple"));
    for (const key of scheduleFlatKeys("simple")) {
      if (!(key in initial)) initial[key] = "";
    }
  }

  if (schema.id === "staff-schedule") {
    mergeDefaults(initial, scheduleInitialData("staff-weekly"));
    for (const key of scheduleFlatKeys("staff-weekly")) {
      if (!(key in initial)) initial[key] = "";
    }
  }

  if (
    schema.id === "personal-schedule" ||
    schema.id === "schedule-detailed"
  ) {
    mergeDefaults(initial, scheduleInitialData("detailed"));
    for (const key of scheduleFlatKeys("detailed")) {
      if (!(key in initial)) initial[key] = "";
    }
    prefillPersonalScheduleFromSiblingForms(schema, initial, allFills, saved);
    Object.assign(
      initial,
      applyStudentCardBackedScheduleFields(schema, student, initial)
    );
  }

  for (const field of fields) {
    if (field.type !== "row-table") continue;
    const tableId = getTableIdFromFieldKey(field.key);
    if (!tableId) continue;
    const defaults = rowTableInitialData(tableId);
    mergeDefaults(initial, defaults);
    const rows = resolveTableRowCount(tableId, initial);
    for (const key of rowTableFlatKeys(tableId, rows)) {
      if (!(key in initial)) initial[key] = "";
    }
  }

  prefillAssessmentTablesFromTachi(
    schema,
    initial,
    crossFormValues,
    tachiCurrentStatus
  );

  prefillPersonalBasketGoalsFromTachi(schema, initial, allFills);

  prefillSubjectTablesFromLearningClusters(schema, initial, allFills);
  prefillStudentTeamDetailsFromStaff(
    schema,
    initial,
    allFills,
    student,
    institutionStaff ?? undefined
  );

  // תאריך שנשמר בטעות תחת טלפון (אחרי שינוי כיתוב) — מחזירים לתאריך לידה
  const phoneVal = (initial.phone ?? "").trim();
  if (phoneVal && looksLikeDateValue(phoneVal)) {
    if (!(initial.birth_date ?? "").trim()) {
      initial.birth_date = normalizeDateValueForStorage(phoneVal);
    }
    initial.phone = "";
  }

  prefillInstitutionFields(fields, initial, institution);
  prefillSchoolYearFields(fields, initial, student);

  prefillMoeWaiverParentFields(schema, student, initial, allFills);

  return initial;
}

/**
 * שם בית ספר / סמל מוסד מפרופיל המשתמש — ממלא רק שדות ריקים בטופס.
 * (לא דורס ערך שנשמר או שנמשך מטופס אחר)
 */
function prefillInstitutionFields(
  fields: ReturnType<typeof listFormFields>,
  initial: Record<string, string>,
  institution: InstitutionFormPrefill | null | undefined
): void {
  if (!institution) return;
  const fieldKeys = new Set(fields.map((field) => field.key));
  const schoolName =
    (institution.school_name ?? "").trim() ||
    (institution.institution_name ?? "").trim();
  const institutionName =
    (institution.institution_name ?? "").trim() ||
    (institution.school_name ?? "").trim();
  const rawCode = (institution.institution_code ?? "").trim();
  const code = rawCode && rawCode !== "—" ? rawCode : "";

  const assignments: Array<[string, string]> = [
    ["school_name", schoolName],
    ["institution_name", institutionName],
    ["institution_code", code],
    ["school_code", code],
  ];

  for (const [key, value] of assignments) {
    if (!value || !fieldKeys.has(key)) continue;
    if ((initial[key] ?? "").trim()) continue;
    initial[key] = value;
  }
}

/** שדות שנה"ל / school_year — ממלאים אוטומטית את השנה העברית הנוכחית (למשל תשפ״ז) */
function prefillSchoolYearFields(
  fields: ReturnType<typeof listFormFields>,
  initial: Record<string, string>,
  student: Student
): void {
  const fromStudent = parseCalendarYear(student.calendar_year);
  const yearNum = fromStudent ?? currentCalendarYear();
  const hebrew = formatHebrewYear(yearNum);
  const looksLikeSchoolYearLabel = (label: string) => {
    const n = label.replace(/["'`״׳\s]/g, "");
    return n.includes("שנאל") || n === "שנה";
  };

  for (const field of fields) {
    if (field.type && STRUCTURAL_FIELD_TYPES.has(field.type)) continue;
    const key = field.key;
    const isSchoolYearKey =
      key === "school_year" ||
      key.endsWith("_school_year") ||
      key === "year";
    if (!isSchoolYearKey && !looksLikeSchoolYearLabel(field.label ?? "")) {
      continue;
    }
    if ((initial[key] ?? "").trim()) continue;
    initial[key] = hebrew;
  }
}

function setEmptyCell(
  data: Record<string, string>,
  tableId: string,
  row: number,
  column: string,
  value: string
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const key = tableCellKey(tableId, row, column);
  if ((data[key] ?? "").trim()) return;
  data[key] = trimmed;
}

const LEARNING_CLUSTER_KEYS = [
  "sacred_studies",
  "language",
  "life_skills",
  "emotional_behavioral",
  "math",
  "motor_sensory",
  "sciences",
] as const;

const CLUSTER_SUBJECT_TABLES: Record<string, string> = {
  "class-teaching-plan": "class-teaching-plan",
  "adapted-curriculum": "adapted-curriculum",
  "tlk-summary": "tlk-summary-subjects",
};

/** טפסים שמושכים מקצועות + אשכול מאשכולות לימוד */
export const LEARNING_CLUSTER_SUBJECT_FORM_IDS = [
  "tlk-summary",
  "adapted-curriculum",
  "class-teaching-plan",
] as const;

export function formUsesLearningClusterSubjects(schema: FormSchema): boolean {
  return Boolean(CLUSTER_SUBJECT_TABLES[schema.id]);
}

function countTableSubjects(
  tableId: string,
  data: Record<string, string>
): number {
  const rows = resolveTableRowCount(tableId, data);
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    if ((data[tableCellKey(tableId, row, "subject")] ?? "").trim()) count += 1;
  }
  return count;
}

/** ממלא תאי מקצוע/אשכול ריקים מאשכולות לימוד. מחזיר כמה מקצועות נוספו. */
export function applyLearningClusterSubjectPrefill(
  schema: FormSchema,
  data: Record<string, string>,
  fills: StudentFormFill[]
): number {
  const tableId = CLUSTER_SUBJECT_TABLES[schema.id];
  if (!tableId) return 0;
  const before = countTableSubjects(tableId, data);
  prefillSubjectTablesFromLearningClusters(schema, data, fills);
  return countTableSubjects(tableId, data) - before;
}

const LEARNING_CLUSTER_LABELS: Record<
  (typeof LEARNING_CLUSTER_KEYS)[number],
  string
> = {
  sacred_studies: "אשכול מקצועות הקודש",
  language: "אשכול החינוך הלשוני",
  life_skills: "אשכול כישורי החיים",
  emotional_behavioral: "אשכול רגשי התנהגותי",
  math: "אשכול החינוך המתמטי",
  motor_sensory: "אשכול מוטורי תחושתי",
  sciences: "אשכול המדעים",
};

function tableHasColumn(tableId: string, columnKey: string): boolean {
  return (
    FORM_TABLE_DEFS[tableId]?.columns.some((col) => col.key === columnKey) ??
    false
  );
}

/**
 * מקצועות בני יותר ממילה אחת (כמו בדוגמאות אשכולות לימוד).
 * אחרי פיצול לפי רווחים מחברים אותם חזרה לשם אחד.
 */
const MULTI_WORD_CLUSTER_SUBJECTS = [
  "פרשת שבוע",
  "פרקי אבות",
  "ביאורי תפילה",
  "הבעה בעל פה",
  "הבעה בכתב",
  "הבנת הנקרא",
  "ידע עולם",
  "פתרון בעיות",
  "שיעורי קלינאית תקשורת",
  "תקשורת בין־אישית",
  "תקשורת בין-אישית",
  "כללי התנהגות",
  "עיצוב התנהגות",
  "מרפאות רגשיות",
  "מרפאה בעיסוק",
];

function stripLeadingVav(word: string): string {
  return word.startsWith("ו") && word.length > 2 ? word.slice(1) : word;
}

/** מסיר ו החיבור מתחילת שם מקצוע (ופרשת שבוע → פרשת שבוע) */
export function stripConnectingVav(subject: string): string {
  const trimmed = subject.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const words = trimmed.split(" ");
  words[0] = stripLeadingVav(words[0]);
  return words.filter(Boolean).join(" ").trim();
}

function tokensMatchPhrase(
  tokens: string[],
  start: number,
  phrase: string[]
): boolean {
  if (start + phrase.length > tokens.length) return false;
  for (let j = 0; j < phrase.length; j += 1) {
    const token = tokens[start + j];
    const expected = phrase[j];
    if (j === 0) {
      if (stripLeadingVav(token) !== stripLeadingVav(expected)) return false;
    } else if (token !== expected) {
      return false;
    }
  }
  return true;
}

/** מחבר מחדש מקצועות מוכרים שנשברו לפי רווח (למשל פרשת שבוע) */
function mergeMultiWordSubjects(tokens: string[]): string[] {
  const phrases = MULTI_WORD_CLUSTER_SUBJECTS.map((subject) =>
    subject.split(" ")
  ).sort((a, b) => b.length - a.length);
  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const phrase = phrases.find((words) => tokensMatchPhrase(tokens, i, words));
    if (phrase) {
      result.push(
        stripConnectingVav(tokens.slice(i, i + phrase.length).join(" "))
      );
      i += phrase.length;
    } else {
      result.push(stripConnectingVav(tokens[i]));
      i += 1;
    }
  }
  return result.filter(Boolean);
}

const CLUSTER_SUBJECT_SEPARATOR = /[·•∙・٬،,;/\n\r|\-–—]+/;

/** מפרק טקסט אשכול לרשימת מקצועות */
export function parseLearningClusterSubjects(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = CLUSTER_SUBJECT_SEPARATOR.test(text)
    ? text
        .split(CLUSTER_SUBJECT_SEPARATOR)
        .map((part) => part.trim())
        .filter(Boolean)
    : mergeMultiWordSubjects(trimmed.split(" ").filter(Boolean));
  return parts.map(stripConnectingVav).filter(Boolean);
}

export function subjectsFromLearningClusterData(
  data: Record<string, string> | null | undefined
): string[] {
  if (!data) return [];
  const seen = new Set<string>();
  const subjects: string[] = [];
  for (const key of LEARNING_CLUSTER_KEYS) {
    const raw = data[key];
    const text =
      raw === undefined || raw === null
        ? ""
        : typeof raw === "string"
          ? raw
          : String(raw);
    for (const subject of parseLearningClusterSubjects(text)) {
      if (seen.has(subject)) continue;
      seen.add(subject);
      subjects.push(subject);
    }
  }
  return subjects;
}

export function clusterSubjectRowsFromLearningClusterData(
  data: Record<string, string> | null | undefined
): Array<{ cluster: string; subject: string }> {
  if (!data) return [];
  const seen = new Set<string>();
  const rows: Array<{ cluster: string; subject: string }> = [];
  for (const key of LEARNING_CLUSTER_KEYS) {
    const raw = data[key];
    const text =
      raw === undefined || raw === null
        ? ""
        : typeof raw === "string"
          ? raw
          : String(raw);
    const cluster = LEARNING_CLUSTER_LABELS[key];
    for (const subject of parseLearningClusterSubjects(text)) {
      const normalized = stripConnectingVav(subject);
      if (!normalized) continue;
      const dedupeKey = `${cluster}\0${normalized}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push({ cluster, subject: normalized });
    }
  }
  return rows;
}

function learningClusterContentScore(
  data: Record<string, string> | null | undefined
): number {
  if (!data) return 0;
  let score = 0;
  for (const key of LEARNING_CLUSTER_KEYS) {
    score += String(data[key] ?? "").trim().length;
  }
  return score;
}

function latestLearningClusterData(
  fills: StudentFormFill[]
): Record<string, string> | null {
  const ordered = [...fills]
    .filter((fill) => fill.form_id === "learning-clusters")
    .sort((a, b) => {
      const scoreDiff =
        learningClusterContentScore(b.data) -
        learningClusterContentScore(a.data);
      if (scoreDiff !== 0) return scoreDiff;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  const latest = ordered[0];
  if (!latest?.data) return null;
  return latest.data;
}

function subjectRowOtherColumnsEmpty(
  data: Record<string, string>,
  tableId: string,
  row: number
): boolean {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return true;
  return def.columns.every((col) => {
    if (col.key === "subject") return true;
    return !(data[tableCellKey(tableId, row, col.key)] ?? "").trim();
  });
}

/** מאחד תאים סמוכים שנשברו בטעות ומסיר ו החיבור משמות המקצועות */
function mergeSplitSubjectCells(
  data: Record<string, string>,
  tableId: string
): void {
  const phrases = MULTI_WORD_CLUSTER_SUBJECTS.map((subject) =>
    subject.split(" ")
  ).sort((a, b) => b.length - a.length);
  const rows = resolveTableRowCount(tableId, data);
  let row = 0;
  while (row < rows) {
    const tokens: string[] = [];
    for (let look = 0; look < 4 && row + look < rows; look += 1) {
      const value = (
        data[tableCellKey(tableId, row + look, "subject")] ?? ""
      ).trim();
      if (!value) break;
      if (look > 0 && !subjectRowOtherColumnsEmpty(data, tableId, row + look)) {
        break;
      }
      tokens.push(value);
    }
    const phrase = phrases.find((words) => tokensMatchPhrase(tokens, 0, words));
    if (phrase && phrase.length > 1) {
      data[tableCellKey(tableId, row, "subject")] = stripConnectingVav(
        tokens.slice(0, phrase.length).join(" ")
      );
      for (let extra = 1; extra < phrase.length; extra += 1) {
        data[tableCellKey(tableId, row + extra, "subject")] = "";
      }
      row += phrase.length;
      continue;
    }
    row += 1;
  }

  for (let i = 0; i < rows; i += 1) {
    const key = tableCellKey(tableId, i, "subject");
    const value = (data[key] ?? "").trim();
    if (!value) continue;
    data[key] = stripConnectingVav(value);
  }
}

function ensureTableRows(
  data: Record<string, string>,
  tableId: string,
  minRows: number
): void {
  const current = resolveTableRowCount(tableId, data);
  const next = Math.min(30, Math.max(current, minRows));
  data[tableRowCountKey(tableId)] = String(next);
  for (const key of rowTableFlatKeys(tableId, next)) {
    if (!(key in data)) data[key] = "";
  }
}

const HOMEROOM_TEAM_ROLE = "מחנכת";
const HOMEROOM_TEAM_NAME_KEYS = ["homeroom_teacher"] as const;

function normalizeTeamLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function applyScheduleFillIncludingEmpty(
  target: Record<string, string>,
  data: Record<string, string> | null | undefined
): void {
  if (!data) return;
  for (const [key, raw] of Object.entries(data)) {
    if (!key.startsWith("sched_")) continue;
    target[key] = String(raw ?? "");
    if (!isPersonalScheduleCellKey(key)) continue;
    const metaKey = `${key}_synced_by`;
    if (!Object.prototype.hasOwnProperty.call(target, metaKey)) {
      target[metaKey] = String(data[metaKey] ?? "");
    }
  }
}

/**
 * TZ-75 open-path precedence:
 * 1) data passed in (`saved`)
 * 2) this form's own saved fill
 * 3) legacy schedule-detailed — only when opening personal-schedule
 * 4) shiluv `schedule` for never-set cells, without *_in_class / *_other
 */
function prefillPersonalScheduleFromSiblingForms(
  schema: FormSchema,
  initial: Record<string, string>,
  fills: StudentFormFill[],
  saved?: Record<string, string> | null
): void {
  if (
    schema.id !== "personal-schedule" &&
    schema.id !== "schedule-detailed"
  ) {
    return;
  }

  const overlay: Record<string, string> = {};
  if (schema.id === "personal-schedule") {
    const detailed = fills.find((fill) => fill.form_id === "schedule-detailed");
    if (detailed) applyScheduleFillIncludingEmpty(overlay, detailed.data);
  }
  const own = fills.find((fill) => fill.form_id === schema.id);
  if (own) applyScheduleFillIncludingEmpty(overlay, own.data);
  if (saved) applyScheduleFillIncludingEmpty(overlay, saved);

  const shiluv = fills
    .filter((fill) => fill.form_id === "schedule")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .map((fill) => fill.data);
  const merged = mergeEmptyScheduleCells(overlay, shiluv);
  Object.assign(initial, merged);
}

/**
 * פרטי צוות תלמיד — שואב רק את מחנכת הכיתה לשורה ריקה בטבלה.
 * שאר הצוות מתווסף ידנית דרך «בחירה מצוות המוסד».
 */
function prefillStudentTeamDetailsFromStaff(
  schema: FormSchema,
  initial: Record<string, string>,
  fills: StudentFormFill[],
  student: Student,
  institutionStaff?: InstitutionStaffPickerRow[]
): void {
  if (schema.id !== "student-team-details") return;

  const tableId = "student-team";
  const ordered = [...fills].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  const preferred = [
    ...ordered.filter((f) => f.form_id === "personal-basket-card"),
    ...ordered.filter((f) => f.form_id !== "personal-basket-card"),
  ];

  function pickName(keys: readonly string[]): string {
    for (const fill of preferred) {
      for (const key of keys) {
        const value = String(fill.data?.[key] ?? "").trim();
        if (value) return value;
      }
    }
    for (const key of keys) {
      if (key === "homeroom_teacher") {
        const fromCard = String(student.homeroom_teacher ?? "").trim();
        if (fromCard) return fromCard;
      }
    }
    return "";
  }

  const homeroomName = pickName(HOMEROOM_TEAM_NAME_KEYS);
  const seeds = homeroomName
    ? [{ role: HOMEROOM_TEAM_ROLE, name: homeroomName }]
    : [];

  if (seeds.length === 0) return;

  const homeroomRowsForStaffPhone: number[] = [];

  ensureTableRows(initial, tableId, Math.max(resolveTableRowCount(tableId, initial), seeds.length));

  const usedRoles = new Set<string>();
  const usedNames = new Set<string>();
  let rows = resolveTableRowCount(tableId, initial);
  for (let row = 0; row < rows; row += 1) {
    const role = String(
      initial[tableCellKey(tableId, row, "role")] ?? ""
    ).trim();
    const name = String(
      initial[tableCellKey(tableId, row, "name")] ?? ""
    ).trim();
    if (role) usedRoles.add(normalizeTeamLabel(role));
    if (name) usedNames.add(normalizeTeamLabel(name));
  }

  for (const seed of seeds) {
    if (usedRoles.has(normalizeTeamLabel(seed.role))) continue;
    if (usedNames.has(normalizeTeamLabel(seed.name))) continue;

    rows = resolveTableRowCount(tableId, initial);
    let target = -1;
    for (let row = 0; row < rows; row += 1) {
      const role = String(
        initial[tableCellKey(tableId, row, "role")] ?? ""
      ).trim();
      const name = String(
        initial[tableCellKey(tableId, row, "name")] ?? ""
      ).trim();
      if (!role && !name) {
        target = row;
        break;
      }
    }
    if (target < 0) {
      ensureTableRows(initial, tableId, rows + 1);
      target = rows;
    }

    setEmptyCell(initial, tableId, target, "name", seed.name);
    setEmptyCell(initial, tableId, target, "role", seed.role);
    usedRoles.add(normalizeTeamLabel(seed.role));
    usedNames.add(normalizeTeamLabel(seed.name));
    homeroomRowsForStaffPhone.push(target);
  }

  if (institutionStaff?.length) {
    enrichStudentTeamHomeroomFromInstitutionStaff(
      initial,
      institutionStaff,
      homeroomRowsForStaffPhone
    );
  }
}

/**
 * עמודת מקצוע (ואשכול בטופס ריכוז תל"כ) —
 * נשאבת מאשכולות לימוד כשהתאים ריקים.
 */
function prefillSubjectTablesFromLearningClusters(
  schema: FormSchema,
  initial: Record<string, string>,
  fills: StudentFormFill[]
): void {
  const tableId = CLUSTER_SUBJECT_TABLES[schema.id];
  if (!tableId) return;

  mergeSplitSubjectCells(initial, tableId);

  const clusterData = latestLearningClusterData(fills);
  if (tableHasColumn(tableId, "cluster")) {
    prefillClusterSubjectTable(initial, tableId, clusterData);
    return;
  }

  const subjects = subjectsFromLearningClusterData(clusterData);
  if (subjects.length === 0) return;

  ensureTableRows(initial, tableId, subjects.length);

  const existing = new Set<string>();
  const rows = resolveTableRowCount(tableId, initial);
  for (let row = 0; row < rows; row += 1) {
    const value = stripConnectingVav(
      (initial[tableCellKey(tableId, row, "subject")] ?? "").trim()
    );
    if (value) existing.add(value);
  }

  for (const subject of subjects) {
    const normalized = stripConnectingVav(subject);
    if (!normalized || existing.has(normalized)) continue;
    let placed = false;
    const currentRows = resolveTableRowCount(tableId, initial);
    for (let row = 0; row < currentRows; row += 1) {
      const key = tableCellKey(tableId, row, "subject");
      if ((initial[key] ?? "").trim()) continue;
      initial[key] = normalized;
      existing.add(normalized);
      placed = true;
      break;
    }
    if (placed) continue;
    const nextRow = currentRows;
    ensureTableRows(initial, tableId, nextRow + 1);
    initial[tableCellKey(tableId, nextRow, "subject")] = normalized;
    existing.add(normalized);
  }
}

function prefillClusterSubjectTable(
  initial: Record<string, string>,
  tableId: string,
  clusterData: Record<string, string> | null
): void {
  const rows = clusterSubjectRowsFromLearningClusterData(clusterData);
  if (rows.length === 0) return;

  ensureTableRows(initial, tableId, rows.length);

  const existing = new Set<string>();
  const currentRows = resolveTableRowCount(tableId, initial);
  for (let row = 0; row < currentRows; row += 1) {
    const value = stripConnectingVav(
      (initial[tableCellKey(tableId, row, "subject")] ?? "").trim()
    );
    if (value) existing.add(value);
  }

  for (const { cluster, subject } of rows) {
    const normalized = stripConnectingVav(subject);
    if (!normalized || existing.has(normalized)) continue;

    let placed = false;
    const rowCount = resolveTableRowCount(tableId, initial);
    for (let row = 0; row < rowCount; row += 1) {
      const subjectKey = tableCellKey(tableId, row, "subject");
      if ((initial[subjectKey] ?? "").trim()) continue;
      initial[subjectKey] = normalized;
      setEmptyCell(initial, tableId, row, "cluster", cluster);
      existing.add(normalized);
      placed = true;
      break;
    }
    if (placed) continue;

    const nextRow = resolveTableRowCount(tableId, initial);
    ensureTableRows(initial, tableId, nextRow + 1);
    initial[tableCellKey(tableId, nextRow, "subject")] = normalized;
    setEmptyCell(initial, tableId, nextRow, "cluster", cluster);
    existing.add(normalized);
  }
}

function normalizeDomainLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function domainAndMainGoalFromTachiFill(
  fill: StudentFormFill
): { domain: string; mainGoal: string } {
  const data = fill.data ?? {};
  const isIntegrative =
    fill.form_id === "tachi-integrative" || fill.form_id === "tla-integrative";
  const domain = String(data.domain ?? "").trim();
  let mainGoal = isIntegrative
    ? String(data.main_goals ?? "").trim()
    : String(data.main_goal ?? "").trim();
  if (!mainGoal) {
    mainGoal = isIntegrative
      ? goalsFromTachiTable(data, "tachi-integrative-goals", "goal")
      : goalsFromTachiTable(data, "tachi-goals", "goal");
  }
  return { domain, mainGoal };
}

/**
 * כרטיס סל אישי — טבלת תחומים ומטרות מתמלאת מתח"י / תל"א (לפי תחום), בלי לדרוס עריכה ידנית.
 */
function prefillPersonalBasketGoalsFromTachi(
  schema: FormSchema,
  initial: Record<string, string>,
  fills: StudentFormFill[]
): void {
  if (schema.id !== "personal-basket-card") return;

  const tableId = "personal-basket-goals";
  const tachiFills = [...fills]
    .filter((fill) => TACHI_SOURCE_FORM_IDS.has(fill.form_id))
    .sort(
      (a, b) =>
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    );

  const domainsPresent = new Set<string>();
  let rows = resolveTableRowCount(tableId, initial);
  for (let row = 0; row < rows; row += 1) {
    const domain = String(
      initial[tableCellKey(tableId, row, "domain")] ?? ""
    ).trim();
    if (domain) domainsPresent.add(normalizeDomainLabel(domain));
  }

  function rowIndexForDomain(domainNorm: string): number {
    for (let row = 0; row < rows; row += 1) {
      const domain = String(
        initial[tableCellKey(tableId, row, "domain")] ?? ""
      ).trim();
      if (domain && normalizeDomainLabel(domain) === domainNorm) return row;
    }
    return -1;
  }

  function firstEmptyRowIndex(): number {
    rows = resolveTableRowCount(tableId, initial);
    for (let row = 0; row < rows; row += 1) {
      const domain = String(
        initial[tableCellKey(tableId, row, "domain")] ?? ""
      ).trim();
      const mainGoal = String(
        initial[tableCellKey(tableId, row, "main_goal")] ?? ""
      ).trim();
      if (!domain && !mainGoal) return row;
    }
    return -1;
  }

  for (const fill of tachiFills) {
    const { domain, mainGoal } = domainAndMainGoalFromTachiFill(fill);
    if (!domain) continue;

    const domainNorm = normalizeDomainLabel(domain);
    const existingRow = rowIndexForDomain(domainNorm);

    if (existingRow >= 0) {
      setEmptyCell(initial, tableId, existingRow, "main_goal", mainGoal);
      continue;
    }

    if (domainsPresent.has(domainNorm)) continue;

    let target = firstEmptyRowIndex();
    if (target < 0) {
      rows = resolveTableRowCount(tableId, initial);
      ensureTableRows(initial, tableId, rows + 1);
      target = rows;
    }

    setEmptyCell(initial, tableId, target, "domain", domain);
    setEmptyCell(initial, tableId, target, "main_goal", mainGoal);
    domainsPresent.add(domainNorm);
  }
}

/**
 * שורת תחום ראשונה בהערכה מעצבת/מסכמת (טבלה) —
 * נשאבת מתח"י / תח"י אינטגרטיבי כשהתאים ריקים.
 */
function prefillAssessmentTablesFromTachi(
  schema: FormSchema,
  initial: Record<string, string>,
  crossFormValues: Record<string, string>,
  tachiCurrentStatus: string
): void {
  const domain = lookupSemanticValue(crossFormValues, "domain");
  const initialStatus =
    tachiCurrentStatus ||
    lookupSemanticValue(crossFormValues, "initial_status");
  const currentStatus = lookupSemanticValue(crossFormValues, "current_status");
  const goals = lookupSemanticValue(crossFormValues, "goals_rest_of_year");
  const recommendations = lookupSemanticValue(
    crossFormValues,
    "recommendations"
  );

  if (schema.id === "formative-assessment-table") {
    setEmptyCell(initial, "formative-domains", 0, "domain", domain);
    setEmptyCell(initial, "formative-domains", 0, "initial", initialStatus);
    setEmptyCell(initial, "formative-domains", 0, "current", currentStatus);
    setEmptyCell(initial, "formative-domains", 0, "goals", goals);
    return;
  }

  if (schema.id === "summative-assessment-table") {
    setEmptyCell(initial, "summative-domains", 0, "topic", domain);
    setEmptyCell(initial, "summative-domains", 0, "initial", initialStatus);
    setEmptyCell(initial, "summative-domains", 0, "process", goals);
    setEmptyCell(initial, "summative-domains", 0, "current", currentStatus);
    setEmptyCell(
      initial,
      "summative-domains",
      0,
      "recommendations",
      recommendations
    );
  }
}

const CARD_SYNC_KEYS: SharedFieldKey[] = [
  "full_name",
  "id_number",
  "birth_date",
  "gender",
  "home_address",
  "city",
  "phone",
  "email",
  "father_name",
  "mother_name",
  "father_mobile",
  "mother_mobile",
  "class_name",
  "teacher_name",
  "notes",
];

function studentFieldIsEmpty(
  student: Student,
  key: SharedFieldKey
): boolean {
  const value = student[key];
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
}

/**
 * ממלא שדות ריקים בכרטיס מכל הטפסים שנשמרו לתלמיד.
 * לא דורס ערכים שכבר קיימים בכרטיס.
 */
export function buildCardPatchFromFormFills(
  student: Student,
  fills: StudentFormFill[]
): Partial<Student> {
  const ordered = [...fills].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const entries: Array<{ key: string; value: string }> = [];
  for (const fill of ordered) {
    for (const [key, value] of Object.entries(fill.data ?? {})) {
      if (isNonPortableCrossFormKey(key)) continue;
      if (
        key === "kindergarten_manager" ||
        key === "homeroom_signature"
      ) {
        continue;
      }
      // בשאלון הפניה — מחנך = ממלא, לא לעדכן את כרטיס התלמיד
      if (
        key === "homeroom_teacher" &&
        (fill.form_id === "referral-questionnaire" ||
          fill.form_id === "referral-questionnaire-multidisciplinary" ||
          fill.form_id === "referral-questionnaire-kindergarten")
      ) {
        continue;
      }
      entries.push({ key, value: String(value ?? "") });
    }
  }

  const pool = buildSemanticValuePool(entries);
  const patch: Partial<Student> = {};

  for (const key of CARD_SYNC_KEYS) {
    if (!studentFieldIsEmpty(student, key)) continue;
    const raw = lookupSemanticValue(pool, key);
    if (!raw) continue;

    if (key === "gender") {
      const mapped = mapGenderFormToCard(raw);
      if (mapped) patch.gender = mapped;
      continue;
    }
    if (key === "full_name") {
      patch.full_name = raw;
      continue;
    }
    (patch as Record<string, string>)[key] = raw;
  }

  // מחנכת בכרטיס — מטפסים (לא משאלון הפניה)
  if (!String(student.homeroom_teacher ?? "").trim()) {
    const homeroom = lookupSemanticValue(pool, "homeroom_teacher");
    if (homeroom) patch.homeroom_teacher = homeroom;
  }

  if (studentFieldIsEmpty(student, "full_name") && !patch.full_name) {
    const composed = joinPersonName(
      lookupSemanticValue(pool, "first_name") ?? "",
      lookupSemanticValue(pool, "last_name") ?? ""
    );
    if (composed) patch.full_name = composed;
  }

  return patch;
}

/** בשמירה: עדכון כרטיס מכל שדה שניתן למפות לכרטיס */
export function studentPatchFromFormData(
  schema: FormSchema,
  data: Record<string, string>,
  student?: Pick<Student, "notes" | "full_name" | "class_name" | "status"> | null,
  knownClassNames?: Iterable<string>
): Partial<Student> {
  const patch = sharedValuesToStudentPatch(listFormFields(schema), data);

  if (
    student?.status === "special-ed-class" &&
    student &&
    !isClassCurriculumStudent(student) &&
    student.class_name?.trim() &&
    patch.class_name &&
    !shouldWriteSpecialEdClassName({
      existingClassName: student.class_name,
      incomingClassName: String(patch.class_name),
      knownClassNames,
    })
  ) {
    delete patch.class_name;
  }

  // תל"כ כיתתי — לא לשכתב זהות הבעלים (שם/מורה) ממילוי הטופס
  if (student && isClassCurriculumStudent(student)) {
    delete patch.full_name;
    delete patch.teacher_name;
    delete patch.id_number;
    delete patch.birth_date;
    delete patch.gender;
    delete patch.father_name;
    delete patch.mother_name;
    delete patch.phone;
    delete patch.email;
    delete patch.home_address;
    delete patch.city;
    delete patch.father_mobile;
    delete patch.mother_mobile;
    // class_name נשאר — זה מטא־דאטה של הכיתה
  }

  return patch;
}
