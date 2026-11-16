import { FAMILY_STATUS_VALUES } from "@/lib/supabase/types";
import type { Student, StudentStatus } from "@/lib/supabase/types";
import { joinPersonName, splitPersonName } from "@/lib/person-name";
import {
  ALL_DEFAULT_DOCUMENT_FOLDERS,
  DEFAULT_DOCUMENT_FOLDERS,
  getDefaultDocumentFolders,
  isSpecialEdPortfolioStatus,
} from "@/lib/student-portfolio";
import { isInternalPortfolioSlot } from "@/lib/portfolio-folder-templates";

export { DEFAULT_DOCUMENT_FOLDERS } from "@/lib/student-portfolio";

export const CARD_FORM_PREFILL_KEY = "matoah.card.form-prefill";

/** שמירת נתוני כרטיס לשימוש חוזר בטפסים בהמשך */
export function rememberStudentForForms(student: Student): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CARD_FORM_PREFILL_KEY,
      JSON.stringify({
        studentId: student.id,
        full_name: student.full_name,
        phone: student.phone,
        father_name: student.father_name,
        mother_name: student.mother_name,
        class_name: student.class_name,
        teacher_name: student.teacher_name,
        notes: student.notes,
        id_number: student.id_number ?? null,
        birth_date: student.birth_date ?? null,
        gender: student.gender ?? null,
        home_address: student.home_address ?? null,
        city: student.city ?? null,
        father_mobile: student.father_mobile ?? null,
        mother_mobile: student.mother_mobile ?? null,
        email: student.email ?? null,
        father_email: student.father_email ?? null,
        mother_email: student.mother_email ?? null,
        role: student.role ?? null,
        characterization: student.characterization ?? null,
        family_status: student.family_status ?? null,
        single_responsible_party: student.single_responsible_party ?? null,
        integration_start_date: student.integration_start_date ?? null,
        eligibility_committee_date: student.eligibility_committee_date ?? null,
        homeroom_teacher: student.homeroom_teacher ?? null,
        education_support: student.education_support ?? null,
        additional_treatments: student.additional_treatments ?? null,
        category: student.category,
        status: student.status,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore quota
  }
}

export function readStudentFormPrefill(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CARD_FORM_PREFILL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const HIDDEN_FIELDS_KEY = "matoah.card.hidden-fields";

export type CoreFieldKey =
  | "full_name"
  | "first_name"
  | "last_name"
  | "id_number"
  | "birth_date"
  | "class_name"
  | "gender"
  | "home_address"
  | "city"
  | "father_name"
  | "father_mobile"
  | "father_email"
  | "mother_name"
  | "mother_mobile"
  | "mother_email"
  | "email"
  | "phone"
  | "role"
  | "characterization"
  | "family_status"
  | "single_responsible_party"
  | "integration_start_date"
  | "eligibility_committee_date"
  | "integration_frequency"
  | "teacher_name"
  | "homeroom_teacher"
  | "education_support"
  | "additional_treatments"
  | "notes";

/** סוג הקלט להצגה/עריכה של השדה בכרטיס */
export type CoreFieldInputType =
  | "text"
  | "date"
  | "tel"
  | "email"
  | "select"
  | "team-role";

export interface CoreFieldOption {
  value: string;
  /** תוית תצוגה — בעברית */
  label: string;
}

export const CORE_FIELD_DEFS: {
  key: CoreFieldKey;
  path: string;
  required?: boolean;
  inputType?: CoreFieldInputType;
  options?: CoreFieldOption[];
}[] = [
  { key: "full_name", path: "studentFields.name" },
  { key: "first_name", path: "studentFields.firstName" },
  { key: "last_name", path: "studentFields.lastName" },
  { key: "id_number", path: "studentFields.idNumber" },
  { key: "birth_date", path: "studentFields.birthDate", inputType: "date" },
  { key: "class_name", path: "studentFields.className" },
  {
    key: "gender",
    path: "studentFields.gender",
    inputType: "select",
    options: [
      { value: "ז", label: "ז" },
      { value: "נ", label: "נ" },
    ],
  },
  { key: "home_address", path: "studentFields.homeAddress" },
  { key: "city", path: "studentFields.city" },
  { key: "father_name", path: "studentFields.father" },
  { key: "father_mobile", path: "studentFields.fatherMobile", inputType: "tel" },
  { key: "father_email", path: "studentFields.fatherEmail", inputType: "email" },
  { key: "mother_name", path: "studentFields.mother" },
  { key: "mother_mobile", path: "studentFields.motherMobile", inputType: "tel" },
  { key: "mother_email", path: "studentFields.motherEmail", inputType: "email" },
  { key: "email", path: "studentFields.email", inputType: "email" },
  { key: "phone", path: "studentFields.phone", inputType: "tel" },
  {
    key: "role",
    path: "studentFields.role",
    inputType: "team-role",
  },
  { key: "characterization", path: "studentFields.characterization" },
  {
    key: "family_status",
    path: "studentFields.familyStatus",
    inputType: "select",
    options: FAMILY_STATUS_VALUES.map((value) => ({ value, label: value })),
  },
  {
    key: "single_responsible_party",
    path: "studentFields.singleResponsibleParty",
    inputType: "select",
    options: [
      { value: "true", label: "כן — אחראי יחיד" },
      { value: "false", label: "לא — שני הורים" },
    ],
  },
  {
    key: "integration_start_date",
    path: "studentFields.integrationStartDate",
    inputType: "date",
  },
  {
    key: "eligibility_committee_date",
    path: "studentFields.eligibilityCommitteeDate",
    inputType: "date",
  },
  {
    key: "integration_frequency",
    path: "studentFields.integrationFrequency",
  },
  { key: "teacher_name", path: "studentFields.teacher" },
  { key: "homeroom_teacher", path: "studentFields.homeroomTeacher" },
  { key: "education_support", path: "studentFields.educationSupport" },
  { key: "additional_treatments", path: "studentFields.additionalTreatments" },
  { key: "notes", path: "studentFields.notes" },
];

/**
 * שדות שנבנים ברכיב ייעודי משלהם — מופיעים בסדר הכרטיס
 * אך לא מרונדרים דרך רשימת שדות הליבה הגנרית.
 * single_responsible_party מרונדר בנפרד כי רק מנהלת המוסד רואה/עורכת אותו.
 */
export const DEDICATED_CORE_FIELDS: CoreFieldKey[] = [
  "integration_frequency",
  "single_responsible_party",
];

/** שדות הליבה בכרטיס איש צוות, לפי סדר ההצגה */
export const STAFF_CORE_FIELDS: CoreFieldKey[] = [
  "full_name",
  "phone",
  "email",
  "home_address",
  "role",
  "notes",
];

/** שדות הליבה בכרטיס תלמיד שילוב, לפי סדר ההצגה */
export const INTEGRATION_CORE_FIELDS: CoreFieldKey[] = [
  "first_name",
  "last_name",
  "id_number",
  "birth_date",
  "class_name",
  "gender",
  "home_address",
  "city",
  "father_name",
  "father_mobile",
  "father_email",
  "mother_name",
  "mother_mobile",
  "mother_email",
  "family_status",
  "single_responsible_party",
  "email",
  "integration_start_date",
  "teacher_name",
  "homeroom_teacher",
  "additional_treatments",
  "notes",
];

/**
 * שדות הליבה בכרטיס תלמיד כיתה (גם במסגרות חינוך מיוחד), לפי סדר ההצגה.
 * המחנכת נשמרת ב-teacher_name — לפיה משויכים התלמידים לכיתה ברשימות.
 */
export const CLASS_STUDENT_CORE_FIELDS: CoreFieldKey[] = [
  "full_name",
  "id_number",
  "birth_date",
  "characterization",
  "class_name",
  "gender",
  "home_address",
  "city",
  "father_name",
  "father_mobile",
  "father_email",
  "mother_name",
  "mother_mobile",
  "mother_email",
  "family_status",
  "single_responsible_party",
  "email",
  "integration_start_date",
  "eligibility_committee_date",
  "teacher_name",
  "additional_treatments",
  "notes",
];

/** שדות הליבה בכרטיס תלמיד סל אישי, לפי סדר ההצגה.
 * כתובת וישוב צמודות אחרי מספר זוגי של שדות ב־wizard (grid דו־עמודות),
 * כדי שישוב יופיע מיד אחרי כתובת.
 */
export const PERSONAL_BASKET_CORE_FIELDS: CoreFieldKey[] = [
  "first_name",
  "last_name",
  "id_number",
  "birth_date",
  "integration_frequency",
  "characterization",
  "class_name",
  "home_address",
  "city",
  "gender",
  "father_name",
  "father_mobile",
  "father_email",
  "mother_name",
  "mother_mobile",
  "mother_email",
  "family_status",
  "single_responsible_party",
  "email",
  "integration_start_date",
  "eligibility_committee_date",
  "teacher_name",
  "homeroom_teacher",
  "education_support",
  "additional_treatments",
  "notes",
];

/** שדות הליבה בכרטיסים שאין להם רשימה ייעודית (כרטיס ללא סטטוס) */
const GENERIC_CORE_FIELDS: CoreFieldKey[] = [
  "full_name",
  "id_number",
  "birth_date",
  "class_name",
  "gender",
  "home_address",
  "city",
  "father_name",
  "father_mobile",
  "father_email",
  "mother_name",
  "mother_mobile",
  "mother_email",
  "email",
  "phone",
  "teacher_name",
  "notes",
];

const STATUS_CORE_FIELDS: Partial<Record<StudentStatus, CoreFieldKey[]>> = {
  "integration-teacher": STAFF_CORE_FIELDS,
  integration: INTEGRATION_CORE_FIELDS,
  "personal-basket": PERSONAL_BASKET_CORE_FIELDS,
  "special-ed-class": CLASS_STUDENT_CORE_FIELDS,
};

/** שדות הליבה של סוג הכרטיס, לפי סדר ההצגה המבוקש */
export function coreFieldsForStatus(
  status: Student["status"] | null | undefined
): CoreFieldKey[] {
  return (status && STATUS_CORE_FIELDS[status]) || GENERIC_CORE_FIELDS;
}

/**
 * כיתובים שמשתנים לפי סוג הכרטיס — אותה עמודה, שם אחר.
 * למשל teacher_name = «מורה אחראית» בשילוב ו«מחנכת» בכיתה.
 */
const STATUS_FIELD_LABEL_PATHS: Partial<
  Record<StudentStatus, Partial<Record<CoreFieldKey, string>>>
> = {
  integration: {
    teacher_name: "studentFields.responsibleTeacher",
    email: "studentFields.parentsEmail",
  },
  "personal-basket": {
    teacher_name: "studentFields.responsibleTeacher",
    email: "studentFields.parentsEmail",
  },
  "special-ed-class": {
    teacher_name: "studentFields.homeroomTeacher",
    email: "studentFields.parentsEmail",
  },
};

export function coreFieldLabelPath(
  key: CoreFieldKey,
  status: Student["status"] | null | undefined
): string {
  const override = status ? STATUS_FIELD_LABEL_PATHS[status]?.[key] : undefined;
  if (override) return override;
  return (
    CORE_FIELD_DEFS.find((field) => field.key === key)?.path ??
    `studentFields.${key}`
  );
}

export type NamePartFieldKey = "first_name" | "last_name";

/** שם ומשפחה מוצגים כשני שדות בכרטיס אך נשמרים יחד בעמודת full_name */
export function isNamePartField(key: CoreFieldKey): key is NamePartFieldKey {
  return key === "first_name" || key === "last_name";
}

export function coreFieldValue(student: Student, key: CoreFieldKey): string {
  if (isNamePartField(key)) {
    const parts = splitPersonName(student.full_name ?? "");
    return key === "first_name" ? parts.first_name : parts.last_name;
  }
  if (key === "single_responsible_party") {
    const value = student.single_responsible_party;
    if (value === true) return "true";
    if (value === false) return "false";
    return "";
  }
  return (student[key] as string | null | undefined) ?? "";
}

export function coreNameSavePatch(
  student: Student,
  key: NamePartFieldKey,
  value: string
): Partial<Student> {
  const parts = splitPersonName(student.full_name ?? "");
  return {
    full_name: joinPersonName(
      key === "first_name" ? value : parts.first_name,
      key === "last_name" ? value : parts.last_name
    ),
  };
}

export function defaultHiddenCoreFields(
  status: Student["status"] | null | undefined
): CoreFieldKey[] {
  const allowed = coreFieldsForStatus(status);
  return CORE_FIELD_DEFS.map((field) => field.key).filter(
    (key) => !allowed.includes(key)
  );
}

function hiddenKey(studentId: string): string {
  return `${HIDDEN_FIELDS_KEY}.${studentId}`;
}

const CARD_LAYOUT_VERSION = 2;
const CARD_LAYOUT_VERSION_KEY = "matoah.card.layout-version";

/**
 * איפוס חד־פעמי של תבניות הכרטיס השמורות כשסדר ברירת המחדל משתנה.
 * בלעדיו שדות חדשים היו נשארים מוסתרים או נדחפים לסוף הכרטיס.
 */
function ensureCardLayoutVersion(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = Number(
      window.localStorage.getItem(CARD_LAYOUT_VERSION_KEY) || "0"
    );
    if (stored >= CARD_LAYOUT_VERSION) return;

    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key?.startsWith(HIDDEN_FIELDS_KEY) ||
        key?.startsWith(FIELD_ORDER_KEY)
      ) {
        stale.push(key);
      }
    }
    for (const key of stale) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(
      CARD_LAYOUT_VERSION_KEY,
      String(CARD_LAYOUT_VERSION)
    );
  } catch {
    // ignore
  }
}

/** היקף תבנית כרטיס — לפי סטטוס (כל הכרטיסים מאותו סוג) */
function layoutScope(status: StudentStatus): string {
  return String(status);
}

function statusHiddenKey(status: StudentStatus): string {
  return `${HIDDEN_FIELDS_KEY}.status.${layoutScope(status)}`;
}

function readHiddenList(storageKey: string): CoreFieldKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    return JSON.parse(raw) as CoreFieldKey[];
  } catch {
    return null;
  }
}

function writeHiddenList(storageKey: string, keys: CoreFieldKey[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/**
 * שדות מוסתרים בכרטיס.
 * תבנית משותפת לכל הכרטיסים מאותו סטטוס (נשמרת מיד, נטענת בכל פתיחת כרטיס).
 */
export function getHiddenCoreFields(
  studentId: string,
  status?: StudentStatus | null,
  _category?: string | null
): CoreFieldKey[] {
  ensureCardLayoutVersion();
  if (status) {
    const scoped = readHiddenList(statusHiddenKey(status));
    if (scoped !== null) return scoped;

    // מיגרציה ממפתח scope ישן (סטטוס+קטגוריה)
    if (typeof window !== "undefined") {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (
            key?.startsWith(`${HIDDEN_FIELDS_KEY}.scope.${status}__`)
          ) {
            const legacyScope = readHiddenList(key);
            if (legacyScope !== null) {
              writeHiddenList(statusHiddenKey(status), legacyScope);
              return legacyScope;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (studentId) {
      const legacy = readHiddenList(hiddenKey(studentId));
      if (legacy !== null) {
        writeHiddenList(statusHiddenKey(status), legacy);
        return legacy;
      }
    }
    return defaultHiddenCoreFields(status);
  }

  return studentId
    ? (readHiddenList(hiddenKey(studentId)) ?? defaultHiddenCoreFields(status))
    : defaultHiddenCoreFields(status);
}

export function setHiddenCoreFields(
  studentId: string,
  keys: CoreFieldKey[],
  status?: StudentStatus | null,
  _category?: string | null
): void {
  if (status) {
    writeHiddenList(statusHiddenKey(status), keys);
    return;
  }
  if (studentId) writeHiddenList(hiddenKey(studentId), keys);
}

const FIELD_ORDER_KEY = "matoah.card.field-order";

export const INTEGRATION_FREQUENCY_ORDER_ID = "integration_frequency";

export function coreFieldOrderId(key: CoreFieldKey): string {
  // לשכיחות מזהה משלה עוד מהתקופה שבה לא הייתה חלק מרשימת שדות הליבה
  return key === "integration_frequency"
    ? INTEGRATION_FREQUENCY_ORDER_ID
    : `core:${key}`;
}

export function customFieldOrderId(fieldId: string): string {
  return `custom:${fieldId}`;
}

/** מזהה לפי תווית — לסדר משותף בין כרטיסים מאותו סטטוס */
export function customLabelOrderId(label: string): string {
  return `custom-label:${label.trim()}`;
}

function fieldOrderStorageKey(status?: StudentStatus | null, studentId?: string): string {
  if (status) {
    return `${FIELD_ORDER_KEY}.status.${layoutScope(status)}`;
  }
  return `${FIELD_ORDER_KEY}.${studentId ?? "unknown"}`;
}

function readOrderList(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed)
      ? parsed.map((id) => String(id)).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

function writeOrderList(storageKey: string, order: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // ignore
  }
}

export function getCardFieldOrder(
  studentId: string,
  status?: StudentStatus | null,
  _category?: string | null
): string[] {
  ensureCardLayoutVersion();
  if (status) {
    const scoped = readOrderList(fieldOrderStorageKey(status, studentId));
    if (scoped !== null) return scoped;

    if (typeof window !== "undefined") {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key?.startsWith(`${FIELD_ORDER_KEY}.scope.${status}__`)) {
            const legacyScope = readOrderList(key);
            if (legacyScope !== null) {
              writeOrderList(fieldOrderStorageKey(status, studentId), legacyScope);
              return legacyScope;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (studentId) {
      const legacy = readOrderList(`${FIELD_ORDER_KEY}.${studentId}`);
      if (legacy !== null) {
        writeOrderList(fieldOrderStorageKey(status, studentId), legacy);
        return legacy;
      }
    }
    return [];
  }
  return readOrderList(fieldOrderStorageKey(null, studentId)) ?? [];
}

export function setCardFieldOrder(
  studentId: string,
  order: string[],
  status?: StudentStatus | null,
  _category?: string | null
): void {
  writeOrderList(fieldOrderStorageKey(status, studentId), order);
}

/** סדר שנשמר לפני פיצול «שם מלא» — נפרס לשני השדות באותו מיקום */
function expandLegacyOrderIds(savedOrder: string[]): string[] {
  const fullNameId = coreFieldOrderId("full_name");
  return savedOrder.flatMap((id) =>
    id === fullNameId
      ? [coreFieldOrderId("first_name"), coreFieldOrderId("last_name"), id]
      : [id]
  );
}

/** ממזג סדר שמור עם השדות הזמינים כרגע */
export function resolveCardFieldOrder(
  savedOrder: string[],
  availableIds: string[]
): string[] {
  const available = new Set(availableIds);
  const resolved: string[] = [];
  for (const id of expandLegacyOrderIds(savedOrder)) {
    if (available.has(id) && !resolved.includes(id)) resolved.push(id);
  }
  for (const id of availableIds) {
    if (!resolved.includes(id)) resolved.push(id);
  }
  return resolved;
}

export function moveCardFieldInOrder(
  order: string[],
  fieldId: string,
  direction: -1 | 1
): string[] {
  const index = order.indexOf(fieldId);
  if (index < 0) return order;
  const target = index + direction;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** מעביר שדה למיקום של שדה יעד (במקומו ברשימה) */
export function moveCardFieldBefore(
  order: string[],
  dragId: string,
  targetId: string
): string[] {
  if (dragId === targetId) return order;
  const from = order.indexOf(dragId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  const insertAt = next.indexOf(targetId);
  if (insertAt < 0) return order;
  next.splice(insertAt, 0, item);
  return next;
}

const CUSTOM_LABELS_KEY = "matoah.card.custom-field-labels";
/** מפתח ישן לצוות — למיגרציה */
const STAFF_CUSTOM_LABELS_KEY = "matoah.card.staff-custom-field-labels";

function statusCustomLabelsKey(status: StudentStatus): string {
  return `${CUSTOM_LABELS_KEY}.status.${layoutScope(status)}`;
}

/** «שדה 1–8» / «שדה נוסף 1–8» — שאריות מהוספה בלי שם */
const PLACEHOLDER_EXTRA_LABEL = /^שדה(?:\s*נוסף)?\s*[1-8]$/u;

function normalizeCustomFieldLabel(label: string): string {
  return label.trim().replace(/:+\s*$/, "");
}

/** כפילות של שדה היישוב (עמודת city) — לא להחזיק גם כשדה מותאם */
export function isPersonalBasketCityDuplicateLabel(label: string): boolean {
  const t = normalizeCustomFieldLabel(label);
  return t === "עיר" || t === "ישוב" || t === "יישוב";
}

export function isPersonalBasketPlaceholderExtraLabel(label: string): boolean {
  return PLACEHOLDER_EXTRA_LABEL.test(label.trim());
}

/** מסנן תוויות שאריות מתבנית סל אישי (שדה נוסף 1–8, כפילות עיר/ישוב) */
export function sanitizePersonalBasketCustomLabels(labels: string[]): string[] {
  return labels.filter(
    (label) =>
      !isPersonalBasketPlaceholderExtraLabel(label) &&
      !isPersonalBasketCityDuplicateLabel(label)
  );
}

function readLabelList(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as string[];
    return parsed.map((label) => label.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLabelList(storageKey: string, labels: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const unique: string[] = [];
    for (const label of labels) {
      const trimmed = label.trim();
      if (!trimmed) continue;
      if (
        !unique.some(
          (existing) => existing.localeCompare(trimmed, "he") === 0
        )
      ) {
        unique.push(trimmed);
      }
    }
    window.localStorage.setItem(storageKey, JSON.stringify(unique));
  } catch {
    // ignore
  }
}

/** תוויות שדות נוספים משותפות לכל הכרטיסים מאותו סטטוס */
export function getStatusCustomFieldLabels(
  status: StudentStatus,
  _category?: string | null
): string[] {
  const readAndSanitize = (labels: string[]): string[] => {
    if (status !== "personal-basket") return labels;
    const cleaned = sanitizePersonalBasketCustomLabels(labels);
    if (cleaned.length !== labels.length) {
      writeLabelList(statusCustomLabelsKey(status), cleaned);
    }
    return cleaned;
  };

  const primary = readLabelList(statusCustomLabelsKey(status));
  if (primary.length > 0) return readAndSanitize(primary);

  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(`${CUSTOM_LABELS_KEY}.scope.${status}__`)) {
          const legacyScope = readLabelList(key);
          if (legacyScope.length > 0) {
            const cleaned = readAndSanitize(legacyScope);
            writeLabelList(statusCustomLabelsKey(status), cleaned);
            return cleaned;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (status === "integration-teacher") {
    const legacy = readLabelList(STAFF_CUSTOM_LABELS_KEY);
    if (legacy.length > 0) {
      writeLabelList(statusCustomLabelsKey(status), legacy);
      return legacy;
    }
  }
  return [];
}

export function setStatusCustomFieldLabels(
  status: StudentStatus,
  labels: string[],
  _category?: string | null
): void {
  const next =
    status === "personal-basket"
      ? sanitizePersonalBasketCustomLabels(labels)
      : labels;
  writeLabelList(statusCustomLabelsKey(status), next);
}

export function rememberStatusCustomFieldLabel(
  status: StudentStatus,
  label: string,
  _category?: string | null
): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const current = getStatusCustomFieldLabels(status);
  if (current.some((existing) => existing.localeCompare(trimmed, "he") === 0)) {
    return;
  }
  setStatusCustomFieldLabels(status, [...current, trimmed]);
}

export function forgetStatusCustomFieldLabel(
  status: StudentStatus,
  label: string,
  _category?: string | null
): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  setStatusCustomFieldLabels(
    status,
    getStatusCustomFieldLabels(status).filter(
      (existing) => existing.localeCompare(trimmed, "he") !== 0
    )
  );
}

/** תאימות לאחור — צוות */
export function getStaffCustomFieldLabels(): string[] {
  return getStatusCustomFieldLabels("integration-teacher");
}

export function setStaffCustomFieldLabels(labels: string[]): void {
  setStatusCustomFieldLabels("integration-teacher", labels);
}

export function rememberStaffCustomFieldLabel(label: string): void {
  rememberStatusCustomFieldLabel("integration-teacher", label);
}

export function forgetStaffCustomFieldLabel(label: string): void {
  forgetStatusCustomFieldLabel("integration-teacher", label);
}

const FOLDERS_KEY = "matoah.doc-folders";
const HIDDEN_FOLDERS_KEY = "matoah.doc-folders-hidden";

function readFolderList(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return parsed.map((name) => name.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeFolderList(storageKey: string, folders: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(folders));
  } catch {
    // ignore
  }
}

function hiddenFoldersKey(studentId: string): string {
  return `${HIDDEN_FOLDERS_KEY}.${studentId}`;
}

function customFoldersKey(studentId: string): string {
  return `${FOLDERS_KEY}.${studentId}`;
}

export function getHiddenDocumentFolders(studentId: string): string[] {
  return readFolderList(hiddenFoldersKey(studentId));
}

export function getKnownDocumentFolders(
  studentId: string,
  status?: StudentStatus | null
): string[] {
  const hidden = new Set(getHiddenDocumentFolders(studentId));
  const defaults = getDefaultDocumentFolders(status);
  const set = new Set<string>(
    defaults.filter((folder) => !hidden.has(folder))
  );

  // כיתות חינוך מיוחד — רק תיקיות התרשים, בלי תיקיות מותאמות
  if (isSpecialEdPortfolioStatus(status)) {
    return Array.from(set);
  }

  const customRaw = readFolderList(customFoldersKey(studentId));
  const customClean = customRaw.filter(
    (name) =>
      !hidden.has(name) &&
      !isInternalPortfolioSlot(name) &&
      !ALL_DEFAULT_DOCUMENT_FOLDERS.includes(name)
  );
  // ניקוי כפילויות ישנות שנשמרו כתיקיות ברמת התיק
  if (customClean.length !== customRaw.length) {
    writeFolderList(customFoldersKey(studentId), customClean);
  }
  for (const name of customClean) {
    set.add(name);
  }
  return Array.from(set);
}

export function rememberDocumentFolder(
  studentId: string,
  folder: string
): void {
  const name = folder.trim();
  if (!name || typeof window === "undefined") return;

  // כפתורי טפסים / קבוצות פנימיות — לא מוסיפים לרשימת תיקיות התיק
  if (isInternalPortfolioSlot(name)) {
    return;
  }

  const hidden = getHiddenDocumentFolders(studentId).filter(
    (folderName) => folderName !== name
  );
  writeFolderList(hiddenFoldersKey(studentId), hidden);

  if (isDefaultDocumentFolder(name)) return;

  const current = getKnownDocumentFolders(studentId);
  if (current.includes(name)) return;
  const custom = current.filter(
    (folderName) => !ALL_DEFAULT_DOCUMENT_FOLDERS.includes(folderName)
  );
  writeFolderList(customFoldersKey(studentId), [...custom, name]);
}

export function isDefaultDocumentFolder(folder: string): boolean {
  return ALL_DEFAULT_DOCUMENT_FOLDERS.includes(folder.trim());
}

/** הסרת תיקייה מתיק התלמיד (כולל תיקיות ברירת מחדל) */
export function forgetDocumentFolder(
  studentId: string,
  folder: string
): void {
  const name = folder.trim();
  if (!name || typeof window === "undefined") return;

  if (isDefaultDocumentFolder(name)) {
    const hidden = getHiddenDocumentFolders(studentId);
    if (!hidden.includes(name)) {
      writeFolderList(hiddenFoldersKey(studentId), [...hidden, name]);
    }
    return;
  }

  const extra = readFolderList(customFoldersKey(studentId));
  writeFolderList(
    customFoldersKey(studentId),
    extra.filter((folderName) => folderName !== name)
  );
}
