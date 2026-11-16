/** קטלוג שדות משותפים — מיפוי לכרטיס התלמיד */

import { joinPersonName, splitPersonName } from "@/lib/person-name";
import {
  FAMILY_STATUS_VALUES,
  type FamilyStatus,
  type Student,
} from "@/lib/supabase/types";

export type SharedFieldKey =
  | "full_name"
  | "id_number"
  | "birth_date"
  | "gender"
  | "home_address"
  | "city"
  | "phone"
  | "email"
  | "father_name"
  | "mother_name"
  | "father_mobile"
  | "mother_mobile"
  | "class_name"
  | "teacher_name"
  | "family_status"
  | "notes";

export type FormFieldType =
  | "text"
  | "textarea"
  | "date"
  | "checkbox"
  | "select"
  /** טקסט קבוע/פסקה — ללא קלט (כותרת מסבירה, נוסח הצהרה וכו') */
  | "static"
  /** שורת חתימה */
  | "signature"
  /** טבלת דירוג (דוח מחנכת הכיתה וכד') */
  | "rating-grid"
  /** מערכת שעות — ימים × שעות */
  | "schedule-grid"
  /** טבלה רב־שורתית (תכנון למידה, התאמות וכו') */
  | "row-table"
  /** בחירת סוג קושי + התאמות בכיתה/מבחן מהקטלוג */
  | "accommodations-picker";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type?: FormFieldType;
  required?: boolean;
  /** אם true — השדה מסונכרן עם כרטיס התלמיד */
  shared?: boolean;
  /** מפתח בכרטיס כש-shared (ברירת מחדל: אותו key) */
  studentKey?: SharedFieldKey;
  rows?: number;
  /** אפשרויות לבחירה (select) */
  options?: FormFieldOption[];
  /** וריאנט מערכת שעות: פשוטה / מפורטת / תל"כ לפי המסמך */
  scheduleVariant?:
    | "simple"
    | "detailed"
    | "tlk-weekly"
    | "tlk-paramedical"
    | "tlk-inclusion"
    | "tlk-personal"
    | "staff-weekly";
  /** הערה מתחת לשדה (למשל מערכת שעות) */
  hint?: string;
}

/** חתימות הורים — במסך מורה אין ציור, רק שליחה לחתימה */
const PARENT_SIGNATURE_KEYS = new Set([
  "father_signature",
  "mother_signature",
  "parents_signature",
  "parent_signature",
  "parent_sign",
  "parent1_sign",
  "parent2_sign",
]);

export function isParentSignatureField(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (PARENT_SIGNATURE_KEYS.has(k)) return true;
  return /^(parent\d*|parents|father|mother)(_sign|_signature)/.test(k);
}

/** חתימות של בעלי תפקידים אחרים (מנהל/ת, מפקח/ת) — לא של ממלא/ת הטופס */
const MANAGEMENT_SIGNATURE_KEYS = new Set([
  "principal_sign",
  "principal_signature",
  "supervisor_sign",
  "supervisor_signature",
  "inspector_sign",
  "inspector_signature",
]);

/**
 * חתימה של צד שלישי — הורים, מנהל/ת, מפקח/ת.
 * לא נכתבת ממסך מורה / קישור מילוי; רק מקישור «שליחה לחתימה».
 * במסך המילוי כל שדות החתימה לקריאה בלבד (גם צוות) — חותמים רק מהמייל.
 */
export function isThirdPartySignatureField(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (isParentSignatureField(k)) return true;
  if (MANAGEMENT_SIGNATURE_KEYS.has(k)) return true;
  return /^(principal|supervisor|inspector)\d*(_sign|_signature)/.test(k);
}

/** כל שדה משטח חתימה — במסך מילוי נעול; נשמר רק מקישור שנשלח למייל */
export function isSignaturePadField(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (isThirdPartySignatureField(k)) return true;
  return /(_signature|_sign)$/.test(k);
}

/** סימון checkbox לשליחה ל-SimpleSign ולהדפסת טפסי ויתור */
export function formatCheckboxMark(value: string | undefined): string {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "on" || v === "כן" || v === "v") {
    return "V";
  }
  return "";
}

/** שדה ת.ז שממלא ההורה יחד עם החתימה בקישור הציבורי */
export function companionIdFieldForSignature(
  signatureFieldKey: string
): { key: string; label: string } | null {
  const k = signatureFieldKey.trim().toLowerCase();
  if (k === "father_signature") {
    return { key: "father_id", label: "ת.ז האב" };
  }
  if (k === "mother_signature") {
    return { key: "mother_id", label: "ת.ז האם" };
  }
  return null;
}

/**
 * תווית לבחירת נמען בשליחה לחתימה —
 * מעדיפה את שם השדה בטופס (למשל «חתימת האב»), ומבדילה הורה 1/2
 * כשכותרת השדה היא סתם «חתימה».
 */
export function resolveSignatureRequestLabel(
  field: Pick<FormFieldDef, "key" | "label">,
  sectionTitle?: string | null
): string {
  const key = field.key.trim().toLowerCase();
  const title = (sectionTitle ?? "").trim();
  const label = (field.label ?? "").trim();

  // תווית מפורשת מהטופס (חתימת האב / חתימת האם / חתימת המחנכת וכו')
  if (label && !/^חתימה$/i.test(label)) {
    return label;
  }

  if (
    key === "father_signature" ||
    key.startsWith("parent1_") ||
    key === "parent1_sign" ||
    key === "parent1_signature"
  ) {
    return "הורה / אפוטרופוס 1";
  }
  if (
    key === "mother_signature" ||
    key.startsWith("parent2_") ||
    key === "parent2_sign" ||
    key === "parent2_signature"
  ) {
    return "הורה / אפוטרופוס 2";
  }
  if (title && (/^חתימה$/i.test(label) || !label)) {
    return title;
  }
  if (label) return label;
  if (title) return title;
  return "חתימה";
}

/** תאימות לאחור — אותו מיפוי כמו resolveSignatureRequestLabel */
export function resolveParentSignatureRequestLabel(
  field: Pick<FormFieldDef, "key" | "label">,
  sectionTitle?: string | null
): string {
  return resolveSignatureRequestLabel(field, sectionTitle);
}

const PARENT_COMPANION_ID_KEYS = new Set([
  "father_id",
  "mother_id",
  "parent1_id",
  "parent2_id",
]);

export function isParentCompanionIdField(key: string): boolean {
  return PARENT_COMPANION_ID_KEYS.has(key.trim());
}

/** חתימות + ת.ז. הורים — נשמרים מהשרת כשחוזרים מקישור חתימה */
export function isReturnedParentField(key: string): boolean {
  return isParentSignatureField(key) || isParentCompanionIdField(key);
}

/** לא דורסים חתימת הורים / ת.ז. שכבר חזרו לשרת בשמירה מקומית ריקה */
export function preserveParentSignatures(
  nextData: Record<string, string>,
  existingData?: Record<string, string> | null
): Record<string, string> {
  if (!existingData) return nextData;
  const merged = { ...nextData };
  for (const [key, value] of Object.entries(existingData)) {
    if (!isReturnedParentField(key)) continue;
    const incoming = (merged[key] ?? "").trim();
    const kept = String(value ?? "").trim();
    if (!incoming && kept) merged[key] = kept;
  }
  return merged;
}

export const SHARED_FIELD_DEFS: Record<
  SharedFieldKey,
  { label: string; studentKey: SharedFieldKey }
> = {
  full_name: { label: "שם מלא", studentKey: "full_name" },
  id_number: { label: "ת.ז", studentKey: "id_number" },
  birth_date: { label: "תאריך לידה", studentKey: "birth_date" },
  gender: { label: "מין", studentKey: "gender" },
  home_address: { label: "רחוב", studentKey: "home_address" },
  city: { label: "ישוב", studentKey: "city" },
  phone: { label: "טלפון", studentKey: "phone" },
  email: { label: "דוא\"ל", studentKey: "email" },
  father_name: { label: "שם האב", studentKey: "father_name" },
  mother_name: { label: "שם האם", studentKey: "mother_name" },
  father_mobile: { label: "נייד אבא", studentKey: "father_mobile" },
  mother_mobile: { label: "נייד אמא", studentKey: "mother_mobile" },
  class_name: { label: "כיתה / קבוצה", studentKey: "class_name" },
  teacher_name: { label: "מורה", studentKey: "teacher_name" },
  family_status: { label: "מצב משפחתי", studentKey: "family_status" },
  notes: { label: "הערות", studentKey: "notes" },
};

const FORM_FIELD_TO_STUDENT_KEY_ALIASES: Partial<Record<string, SharedFieldKey>> = {
  student_name: "full_name",
  student_id_number: "id_number",
  parent1_phone: "father_mobile",
  parent2_phone: "mother_mobile",
  parent1_name: "father_name",
  parent2_name: "mother_name",
  family_phone: "phone",
  marital_status: "family_status",
  class_level: "class_name",
  class_or_gan_level: "class_name",
  // מחנכת ≠ מורה בכרטיס — לא למפות homeroom_teacher ל-teacher_name
};

export function sharedField(
  key: SharedFieldKey,
  overrides?: Partial<FormFieldDef>
): FormFieldDef {
  const base = SHARED_FIELD_DEFS[key];
  return {
    key,
    label: base.label,
    type: key === "notes" ? "textarea" : "text",
    shared: true,
    studentKey: base.studentKey,
    ...overrides,
  };
}

/** ערכי שדות משותפים מכרטיס התלמיד */
export function studentToSharedValues(
  student: Student
): Record<string, string> {
  return {
    full_name: student.full_name ?? "",
    id_number: student.id_number ?? "",
    birth_date: student.birth_date ?? "",
    gender: student.gender ?? "",
    home_address: student.home_address ?? "",
    city: student.city ?? "",
    phone: student.phone ?? "",
    email: student.email ?? "",
    father_name: student.father_name ?? "",
    mother_name: student.mother_name ?? "",
    father_mobile: student.father_mobile ?? "",
    mother_mobile: student.mother_mobile ?? "",
    class_name: student.class_name ?? "",
    teacher_name: student.teacher_name ?? "",
    homeroom_teacher: student.homeroom_teacher ?? "",
    family_status: student.family_status ?? "",
    notes: student.notes ?? "",
  };
}

function resolveStudentKeyForField(
  field: Pick<FormFieldDef, "key" | "shared" | "studentKey">,
  includeImplicit = false
): SharedFieldKey | null {
  const direct = field.studentKey ?? (field.key as SharedFieldKey);
  if (field.shared && direct in SHARED_FIELD_DEFS) return direct;

  const alias = FORM_FIELD_TO_STUDENT_KEY_ALIASES[field.key];
  if (alias) return alias;

  // teacher_name בכרטיס = מורה משויכת, לא מחנכת — רק כש-shared במפורש
  if (
    includeImplicit &&
    field.key in SHARED_FIELD_DEFS &&
    field.key !== "teacher_name"
  ) {
    return field.key as SharedFieldKey;
  }

  return null;
}

export function mapGenderCardToForm(
  cardValue: string,
  options?: FormFieldOption[]
): string {
  const raw = cardValue.trim();
  if (!raw) return "";
  const optionValues = new Set((options ?? []).map((o) => o.value));
  if (optionValues.size === 0 || optionValues.has(raw)) return raw;
  if ((raw === "ז" || raw === "זכר") && optionValues.has("male")) return "male";
  if ((raw === "נ" || raw === "נקבה") && optionValues.has("female")) {
    return "female";
  }
  if (raw === "male" && optionValues.has("ז")) return "ז";
  if (raw === "female" && optionValues.has("נ")) return "נ";
  return raw;
}

export function mapGenderFormToCard(
  formValue: string
): Student["gender"] | undefined {
  const raw = formValue.trim();
  if (raw === "ז" || raw === "זכר" || raw === "male") return "ז";
  if (raw === "נ" || raw === "נקבה" || raw === "female") return "נ";
  return undefined;
}

export function mapFamilyStatusCardToForm(
  cardValue: string,
  options?: FormFieldOption[]
): string {
  const raw = cardValue.trim();
  if (!raw) return "";
  const optionValues = new Set((options ?? []).map((o) => o.value));
  if (optionValues.size === 0 || optionValues.has(raw)) return raw;
  if (raw === "נשואים" && optionValues.has("married")) return "married";
  if (raw === "גרושים" && optionValues.has("divorced")) return "divorced";
  if (raw === "פרודים") {
    if (optionValues.has("separated")) return "separated";
    if (optionValues.has("other")) return "other";
  }
  const byLabel = (options ?? []).find((option) => option.label.trim() === raw);
  if (byLabel) return byLabel.value;
  return raw;
}

export function mapFamilyStatusFormToCard(
  formValue: string,
  options?: FormFieldOption[]
): FamilyStatus | undefined {
  const raw = formValue.trim();
  if (!raw) return undefined;
  if ((FAMILY_STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as FamilyStatus;
  }
  const selected = (options ?? []).find((option) => option.value === raw);
  const label = (selected?.label ?? "").trim();
  if (label === "נשואים" || raw === "married") return "נשואים";
  if (label === "גרושים" || raw === "divorced") return "גרושים";
  if (label === "פרודים" || raw === "separated") return "פרודים";
  return undefined;
}

export function getStudentPrefillValue(
  field: Pick<FormFieldDef, "key" | "shared" | "studentKey" | "options">,
  values: Record<string, string>
): string {
  const studentKey = resolveStudentKeyForField(field, true);
  if (studentKey === "gender") {
    return mapGenderCardToForm(values.gender ?? "", field.options);
  }
  if (studentKey === "family_status") {
    return mapFamilyStatusCardToForm(values.family_status ?? "", field.options);
  }
  if (studentKey) return values[studentKey] ?? "";

  // שם פרטי / משפחה מתוך full_name בכרטיס
  if (field.key === "first_name" || field.key === "last_name") {
    const parts = splitPersonName(values.full_name ?? "");
    return field.key === "first_name" ? parts.first_name : parts.last_name;
  }

  // מחנכת — מהכרטיס (לא מ־teacher_name, כדי לא לבלבל עם מורה משויכת)
  if (field.key === "homeroom_teacher") {
    return (values.homeroom_teacher ?? "").trim();
  }

  return "";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** תאריך בפורמט ISO או יום/חודש/שנה — לא מספר טלפון */
export function looksLikeDateValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return true;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(v)) return true;
  return false;
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || looksLikeDateValue(trimmed)) return false;
  const compact = trimmed.replace(/[\s\-()]/g, "");
  // YYYYMMDD אחרי הסרת מקפים לא ייחשב טלפון
  if (/^\d{8}$/.test(compact)) {
    const y = Number(compact.slice(0, 4));
    const m = Number(compact.slice(4, 6));
    const d = Number(compact.slice(6, 8));
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return false;
    }
  }
  return /^\+?\d{7,15}$/.test(compact);
}

/** המרה ל־YYYY-MM-DD כשאפשר; אחרת מחזיר את המקור */
export function normalizeDateValueForStorage(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return v;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

/**
 * שמירת ערך לשדה ליבה — אם הערך שייך לשדה אחר (טלפון בת. לידה וכו'),
 * מנתבים לעמודה הנכונה כדי ש«טלפון» תמיד יישמר בטלפון ו«ת. לידה» בתאריך.
 */
export function routeCoreFieldSavePatch(
  key: string,
  value: string | null | undefined
): Partial<Student> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { [key]: null } as Partial<Student>;
  }

  if (key === "birth_date") {
    if (looksLikeDateValue(trimmed)) {
      return { birth_date: normalizeDateValueForStorage(trimmed) };
    }
    if (looksLikePhone(trimmed)) {
      return { birth_date: null, phone: trimmed };
    }
    return { birth_date: trimmed };
  }

  if (key === "phone") {
    if (looksLikeDateValue(trimmed)) {
      return {
        phone: null,
        birth_date: normalizeDateValueForStorage(trimmed),
      };
    }
    return { phone: trimmed };
  }

  if (key === "email" && looksLikePhone(trimmed)) {
    return { email: null, phone: trimmed };
  }

  if (key === "single_responsible_party") {
    if (trimmed === "true") return { single_responsible_party: true };
    if (trimmed === "false") return { single_responsible_party: false };
    return { single_responsible_party: null };
  }

  return { [key]: trimmed } as Partial<Student>;
}

/** כינוי תואם לאחור — אותו ניתוב ערכים */
export const buildTypedCoreFieldPatch = routeCoreFieldSavePatch;

/** נתיב כיתוב ב־site-texts לשדה משותף בכרטיס */
export const SHARED_FIELD_SITE_TEXT_PATH: Partial<
  Record<SharedFieldKey, string>
> = {
  full_name: "studentFields.name",
  id_number: "studentFields.idNumber",
  birth_date: "studentFields.birthDate",
  gender: "studentFields.gender",
  home_address: "studentFields.homeAddress",
  city: "studentFields.city",
  phone: "studentFields.phone",
  email: "studentFields.email",
  father_name: "studentFields.father",
  mother_name: "studentFields.mother",
  father_mobile: "studentFields.fatherMobile",
  mother_mobile: "studentFields.motherMobile",
  class_name: "studentFields.className",
  teacher_name: "studentFields.teacher",
  family_status: "studentFields.familyStatus",
  notes: "studentFields.notes",
};

/**
 * תווית להצגה בטופס: כיתוב מעודכן מ־site-texts אם קיים, אחרת תווית הסכמה.
 */
export function resolveFormFieldLabel(
  field: Pick<FormFieldDef, "key" | "label" | "shared" | "studentKey">,
  getLabel: (path: string) => string
): string {
  const studentKey = resolveStudentKeyForField(field, true);
  if (!studentKey) return field.label;
  const sharedDefault = SHARED_FIELD_DEFS[studentKey]?.label;
  // תווית מפורשת בטופס (שונה מכיתוב הכרטיס) — לא מוחלפת בכיתוב האתר
  if (field.label && sharedDefault && field.label !== sharedDefault) {
    return field.label;
  }
  const path = SHARED_FIELD_SITE_TEXT_PATH[studentKey];
  if (!path) return field.label;
  const fromSite = getLabel(path).trim();
  return fromSite || field.label;
}

/**
 * אם בשם הורה נשמר בטעות טלפון/מייל — מעביר לשדה המתאים ומנקה את השם.
 * אם בטלפון נשמר תאריך / בתאריך לידה נשמר טלפון — מחליפים לעמודות הנכונות.
 */
export function buildMisfiledContactRepairPatch(
  student: Student
): Partial<Student> | null {
  const patch: Partial<Student> = {};
  const father = (student.father_name ?? "").trim();
  const mother = (student.mother_name ?? "").trim();
  const phone = (student.phone ?? "").trim();
  const email = (student.email ?? "").trim();
  const fatherMobile = (student.father_mobile ?? "").trim();
  const motherMobile = (student.mother_mobile ?? "").trim();
  const birthDate = (student.birth_date ?? "").trim();

  if (father && looksLikePhone(father)) {
    if (!phone) patch.phone = father;
    else if (!fatherMobile) patch.father_mobile = father;
    patch.father_name = null;
  } else if (father && looksLikeEmail(father)) {
    if (!email) patch.email = father;
    patch.father_name = null;
  }

  if (mother && looksLikeEmail(mother)) {
    if (!email && !patch.email) patch.email = mother;
    patch.mother_name = null;
  } else if (mother && looksLikePhone(mother)) {
    if (!motherMobile) patch.mother_mobile = mother;
    else if (!phone && !patch.phone) patch.phone = mother;
    patch.mother_name = null;
  }

  let effectivePhone = String(
    (patch.phone as string | null | undefined) ?? phone ?? ""
  ).trim();
  let effectiveBirth = String(
    (patch.birth_date as string | null | undefined) ?? birthDate ?? ""
  ).trim();

  const phoneIsDate = Boolean(effectivePhone && looksLikeDateValue(effectivePhone));
  const birthIsPhone = Boolean(effectiveBirth && looksLikePhone(effectiveBirth));

  if (phoneIsDate && birthIsPhone) {
    patch.birth_date = normalizeDateValueForStorage(effectivePhone);
    patch.phone = effectiveBirth;
    effectivePhone = effectiveBirth;
    effectiveBirth = String(patch.birth_date);
  } else if (phoneIsDate) {
    if (!effectiveBirth) {
      patch.birth_date = normalizeDateValueForStorage(effectivePhone);
    }
    patch.phone = null;
    effectivePhone = "";
  } else if (birthIsPhone) {
    if (!effectivePhone) {
      patch.phone = effectiveBirth;
    }
    patch.birth_date = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * עדכון כרטיס מערכי טופס.
 * כותבים רק ערכים לא־ריקים — כדי לא למחוק נתונים קיימים בכרטיס.
 */
export function sharedValuesToStudentPatch(
  fields: FormFieldDef[],
  data: Record<string, string>
): Partial<Student> {
  const patch: Partial<Student> = {};
  for (const field of fields) {
    const studentKey = resolveStudentKeyForField(field, true);
    if (!studentKey) continue;
    const raw = (data[field.key] ?? "").trim();
    if (!raw) continue;

    if (studentKey === "full_name") {
      patch.full_name = raw;
    } else if (studentKey === "gender") {
      const mapped = mapGenderFormToCard(raw);
      if (mapped) patch.gender = mapped;
    } else if (studentKey === "family_status") {
      const mapped = mapFamilyStatusFormToCard(raw, field.options);
      if (mapped) patch.family_status = mapped;
    } else if (studentKey === "birth_date" || studentKey === "phone") {
      Object.assign(patch, routeCoreFieldSavePatch(studentKey, raw));
    } else if (
      (studentKey === "father_name" || studentKey === "mother_name") &&
      looksLikePhone(raw)
    ) {
      // תיקון נפוץ: טלפון נכתב בשם הורה
      const mobileKey =
        studentKey === "father_name" ? "father_mobile" : "mother_mobile";
      if (!patch[mobileKey]) patch[mobileKey] = raw;
    } else if (
      (studentKey === "father_name" || studentKey === "mother_name") &&
      looksLikeEmail(raw)
    ) {
      if (!patch.email) patch.email = raw;
    } else {
      patch[studentKey] = raw;
    }
  }

  // אם מולאו שם פרטי/משפחה בנפרד — מרכיבים full_name כשאין ערך מפורש
  const first = (data.first_name ?? "").trim();
  const last = (data.last_name ?? "").trim();
  if ((first || last) && !patch.full_name) {
    const composed = joinPersonName(first, last);
    if (composed) patch.full_name = composed;
  }

  return patch;
}

export function resolveStudentKey(field: FormFieldDef): SharedFieldKey | null {
  return resolveStudentKeyForField(field, false);
}

/** מפתח בכרטיס התלמיד שאליו ממופה שדה בטופס (כולל כינויים) */
export function studentKeyForFormField(
  field: Pick<FormFieldDef, "key" | "shared" | "studentKey">
): SharedFieldKey | null {
  return resolveStudentKeyForField(field, true);
}

/** מחליף מציינים כמו {full_name} בטקסט סטטי לפי נתוני הטופס */
export function interpolateFormStaticLabel(
  label: string,
  data: Record<string, string>
): string {
  return label.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = (data[key] ?? "").trim();
    return value || "________";
  });
}
