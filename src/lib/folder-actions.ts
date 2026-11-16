/** תת־תיקיות בתוך קטגוריית תיק + שיוך מסמך (תאימות לאחור) */

import {
  getDefaultFolderActionLabels,
  getPortfolioFolderButtonDefs,
  isCustomDocumentFolder,
  isExpandableFolderButton,
  nextExpandableSlotLabel,
  normalizeDocumentFolderLabel,
} from "@/lib/portfolio-folder-templates";
import type { StudentStatus } from "@/lib/supabase/types";

const ACTIONS_KEY = "matoah.folder-actions";
const ACTION_RENAMES_KEY = "matoah.folder-action-renames";
const DOC_SLOT_KEY = "matoah.doc-slots";
const DOC_ROLE_KEY = "matoah.doc-roles";

export type DocumentSlotRole = "fill" | "upload";

export const DEFAULT_FOLDER_ACTION_BUTTONS = [
  "מסמך 1",
  "מסמך 2",
  "מסמך 3",
  "מסמך 4",
  "מסמך 5",
  "מסמך 6",
] as const;

function defaultButtonsForFolder(
  folderName: string,
  status?: StudentStatus | null
): string[] {
  const fromTemplate = getDefaultFolderActionLabels(folderName, status);
  if (fromTemplate.length > 0) return fromTemplate;
  return [...DEFAULT_FOLDER_ACTION_BUTTONS];
}

function actionsStorageKey(studentId: string, folderName: string): string {
  return `${ACTIONS_KEY}.${studentId}.${folderName}`;
}

function renamesStorageKey(studentId: string, folderName: string): string {
  return `${ACTION_RENAMES_KEY}.${studentId}.${folderName}`;
}

function readActionRenames(
  studentId: string,
  folderName: string
): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      renamesStorageKey(studentId, folderName)
    );
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeActionRenames(
  studentId: string,
  folderName: string,
  map: Record<string, string>
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      renamesStorageKey(studentId, folderName),
      JSON.stringify(map)
    );
  } catch {
    // ignore
  }
}

/** תוויות תבנית אחרי נרמול (ללא כפילויות legacy) */
export function getNormalizedFolderActionLabels(
  folderName: string,
  status?: StudentStatus | null
): string[] {
  return normalizeFolderButtons(
    folderName,
    defaultButtonsForFolder(folderName, status),
    status
  );
}

function isPlaceholderDocumentButtons(buttons: string[]): boolean {
  return (
    buttons.length > 0 &&
    buttons.every((label) => /^מסמך \d+$/.test(label.trim()))
  );
}

/**
 * שמות ישנים ששיכולים להישאר ב־localStorage מגרסאות קודמות ואינם חלק
 * מהמבנה החדש של 5 התיקיות — נסננם החוצה בעת קריאה כדי שלא יופיעו.
 */
const LEGACY_LABELS_TO_STRIP = new Set<string>([
  // אינפורמציה כללית — טפסים ישנים שאינם חלק מהמבנה הנוכחי
  // (שלושת סוגי ויתור הסודיות עברו ל"מסמכים נוספים" — לא מסננים אותם שם)
  "מידע על התלמיד",
  "שאלון הפנייה",
  "שאלון הפניה",
  "שאלון הפנייה לוועדת אפיון וזכאות",
  "שאלון הורים לוועדה",
  "שאלון תלמיד לוועדה",
  "שאלון הורים",
  "שאלון תלמיד",
  "שאלון תלמיד (ציפיות וקשיים)",
  "אישור הורים לקיום ועדה ללא נוכחות",
  "המלצת פסיכולוג לשינוי קוד אפיון",
  "מיצוי אפשרויות",
  "הכלה",
  "נספח 8",
  "מסמכים נוספים",
  // אינטגרציה טיפולית — לשון זכר ישנה + כפתורי־ברירת־מחדל ישנים
  "הדרכת מומחה תחום",
  // שילוב — כפתורים ישנים
  "תוכנית שילוב אישית",
  "תיעוד ישיבות שילוב",
  // מעקב הישגים — שם ישן של כפתור
  "דפי עבודה משמעותיים",
  "דפי עבודה מעודכנים",
  // תל"א — שם ישן עם סיומת
  'תל"א אינטגרטיבי (בקובץ נפרד)',
]);

/**
 * מנרמל כפתורי תיקייה: כשיש תבנית רשמית — רק הטפסים שבה (אחרי rename),
 * בלי כפתורים ישנים/מיותרים מ־localStorage. בלי תבנית — שומרים את הרשימה
 * אחרי סינון legacy.
 */
function normalizeFolderButtons(
  folderName: string,
  buttons: string[],
  status?: StudentStatus | null,
  renames: Record<string, string> = {}
): string[] {
  let next = [...buttons];

  // החלפת "מסמך 1..6" בתבנית האמיתית של התיקייה כשיש כזו
  if (isPlaceholderDocumentButtons(next)) {
    const template = defaultButtonsForFolder(folderName, status);
    if (template.length > 0) next = template;
  }

  const templateLabels = defaultButtonsForFolder(folderName, status).map(
    (label) => renames[label] ?? label
  );

  const defs = getPortfolioFolderButtonDefs(folderName, status);
  const isDynamicFolder =
    isCustomDocumentFolder(folderName) ||
    defs.some((d) => d.kind === "expandable" || d.kind === "multi-add");

  // תיקייה דינמית (מסמכים נוספים / expandable) — שומרים תוספות מעבר לתבנית
  if (templateLabels.length > 0 && isDynamicFolder) {
    const merged = [...templateLabels];
    const expandableBases = defs
      .filter((d) => d.kind === "expandable" || d.kind === "multi-add")
      .map((d) => d.label);
    for (const label of next) {
      const normalized =
        status === "special-ed-class"
          ? normalizeDocumentFolderLabel(label, status)
          : label;
      if (merged.includes(normalized)) continue;
      if (LEGACY_LABELS_TO_STRIP.has(normalized) && normalized !== "מסמכים נוספים") {
        continue;
      }
      // כיתות חינוך מיוחד — רק הרחבות של כפתורי expandable מהתרשים
      if (status === "special-ed-class") {
        const isExpansion = expandableBases.some(
          (base) =>
            normalized === base || normalized.startsWith(`${base} (`)
        );
        if (!isExpansion) continue;
      }
      merged.push(normalized);
    }
    return merged.filter((label, index) => merged.indexOf(label) === index);
  }

  // יש תבנית רשמית — רק היא (אין תוספות מיותרות כמו "מידע על התלמיד")
  if (templateLabels.length > 0) {
    return templateLabels.filter(
      (label, index) => templateLabels.indexOf(label) === index
    );
  }

  // תיקייה מותאמת בלי תבנית — סינון legacy בלבד
  next = next.filter((label) => !LEGACY_LABELS_TO_STRIP.has(label));
  return next.filter((label, index) => next.indexOf(label) === index);
}

export function getFolderActionButtons(
  studentId: string,
  folderName: string,
  status?: StudentStatus | null
): string[] {
  if (typeof window === "undefined") {
    return defaultButtonsForFolder(folderName, status);
  }
  try {
    const renames = readActionRenames(studentId, folderName);
    const raw = window.localStorage.getItem(
      actionsStorageKey(studentId, folderName)
    );
    if (!raw) {
      return normalizeFolderButtons(
        folderName,
        defaultButtonsForFolder(folderName, status),
        status,
        renames
      );
    }
    const parsed = JSON.parse(raw) as string[];
    const cleaned = parsed.map((s) => s.trim()).filter(Boolean);
    const base =
      cleaned.length > 0
        ? cleaned
        : defaultButtonsForFolder(folderName, status);
    const normalized = normalizeFolderButtons(
      folderName,
      base,
      status,
      renames
    );
    const result =
      normalized.length > 0
        ? normalized
        : defaultButtonsForFolder(folderName, status);

    // ניקוי localStorage מכפתורים מיותרים (מידע על התלמיד וכו')
    if (JSON.stringify(cleaned) !== JSON.stringify(result)) {
      setFolderActionButtons(studentId, folderName, result, status);
    }
    return result;
  } catch {
    return defaultButtonsForFolder(folderName, status);
  }
}

export function setFolderActionButtons(
  studentId: string,
  folderName: string,
  buttons: string[],
  status?: StudentStatus | null
): void {
  if (typeof window === "undefined") return;
  const cleaned = buttons.map((s) => s.trim()).filter(Boolean);
  try {
    window.localStorage.setItem(
      actionsStorageKey(studentId, folderName),
      JSON.stringify(
        cleaned.length > 0
          ? cleaned
          : defaultButtonsForFolder(folderName, status)
      )
    );
  } catch {
    // ignore
  }
}

export function addFolderActionButton(
  studentId: string,
  folderName: string,
  label?: string,
  status?: StudentStatus | null
): string {
  const current = getFolderActionButtons(studentId, folderName, status);
  const nextLabel =
    label?.trim() || `מסמך ${current.length + 1}`;
  const unique = current.includes(nextLabel)
    ? `${nextLabel} (${current.length + 1})`
    : nextLabel;
  setFolderActionButtons(studentId, folderName, [...current, unique], status);
  return unique;
}

export function removeFolderActionButton(
  studentId: string,
  folderName: string,
  label: string,
  status?: StudentStatus | null
): void {
  const current = getFolderActionButtons(studentId, folderName, status);
  if (current.length <= 1) return;
  setFolderActionButtons(
    studentId,
    folderName,
    current.filter((item) => item !== label),
    status
  );
}

/**
 * TZ-100: שמות הטפסים ב«מסמכים נוספים» קבועים (טפסי מערכת / משרד החינוך).
 * תיקיות אחרות נשארות ניתנות לשינוי שם, אלא אם המבנה נעול בנפרד.
 */
export function canRenameFolderActionButtons(folderName: string): boolean {
  return !isCustomDocumentFolder(folderName.trim());
}

export function renameFolderActionButton(
  studentId: string,
  folderName: string,
  from: string,
  to: string,
  status?: StudentStatus | null
): void {
  if (!canRenameFolderActionButtons(folderName)) return;
  const next = to.trim();
  if (!next) return;
  const current = getFolderActionButtons(studentId, folderName, status);
  setFolderActionButtons(
    studentId,
    folderName,
    current.map((item) => (item === from ? next : item)),
    status
  );

  // שמירת rename של כפתור תבנית — כדי שהנרמול לא יחזיר את השם הישן ליד החדש
  const template = defaultButtonsForFolder(folderName, status);
  const renames = readActionRenames(studentId, folderName);
  const originalKey =
    Object.entries(renames).find(([, value]) => value === from)?.[0] ??
    (template.includes(from) ? from : null);
  if (originalKey) {
    if (next === originalKey) delete renames[originalKey];
    else renames[originalKey] = next;
    writeActionRenames(studentId, folderName, renames);
  }

  if (typeof window === "undefined") return;
  try {
    const map = readDocSlotMap();
    let changed = false;
    for (const [docId, slot] of Object.entries(map)) {
      if (slot === from) {
        map[docId] = next;
        changed = true;
      }
    }
    if (changed) writeDocSlotMap(map);
  } catch {
    // ignore
  }
}

function readDocSlotMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DOC_SLOT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDocSlotMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOC_SLOT_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getDocumentSlot(documentId: string): string | null {
  return readDocSlotMap()[documentId] ?? null;
}

export function setDocumentSlot(documentId: string, slotLabel: string): void {
  const map = readDocSlotMap();
  map[documentId] = slotLabel.trim();
  writeDocSlotMap(map);
}

function readDocRoleMap(): Record<string, DocumentSlotRole> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DOC_ROLE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DocumentSlotRole>) : {};
  } catch {
    return {};
  }
}

function writeDocRoleMap(map: Record<string, DocumentSlotRole>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOC_ROLE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getDocumentRole(documentId: string): DocumentSlotRole {
  return readDocRoleMap()[documentId] ?? "upload";
}

export function setDocumentRole(
  documentId: string,
  role: DocumentSlotRole
): void {
  const map = readDocRoleMap();
  map[documentId] = role;
  writeDocRoleMap(map);
}

/** לאחר העלאה לכפתור expandable — מוסיף קוביה ריקה נוספת */
export function maybeExpandFolderSlot(
  studentId: string,
  folderName: string,
  slotLabel: string,
  status?: StudentStatus | null
): string | null {
  const allowExpand =
    isCustomDocumentFolder(folderName) ||
    isExpandableFolderButton(folderName, slotLabel, status);
  if (!allowExpand) return null;
  const current = getFolderActionButtons(studentId, folderName, status);
  const expandableDef = getPortfolioFolderButtonDefs(folderName, status).find(
    (d) =>
      d.kind === "expandable" &&
      (d.label === slotLabel || slotLabel.startsWith(`${d.label} `))
  );
  const base = isCustomDocumentFolder(folderName)
    ? "מסמכים נוספים"
    : (expandableDef?.label ?? slotLabel);
  const next = nextExpandableSlotLabel(base, current);
  if (current.includes(next)) return null;
  setFolderActionButtons(studentId, folderName, [...current, next], status);
  return next;
}
