/** תבנית כפתורי מסמך לפי תרשים תיק תלמיד שילוב / סל אישי / חינוך מיוחד */

import { sameHebrewFolderName } from "@/lib/hebrew-quotes";
import type { StudentStatus } from "@/lib/supabase/types";

export type FolderButtonKind = "fixed" | "expandable" | "multi-add" | "group";

export interface PortfolioFolderButtonDef {
  label: string;
  kind?: FolderButtonKind;
  /**
   * נתיב יחסי (מתחת ל-/public) לקובץ תבנית להורדה — טופס רשמי של משרד
   * החינוך שהמורה מורידה, ממלאת ומעלה בחזרה. אם מוגדר, יוצג אייקון
   * הורדה על הכפתור בתיקייה.
   */
  templateHref?: string;
}

/**
 * מסמכים רשמיים של משרד החינוך שמופיעים כברירת מחדל בתוך
 * "מסמכים נוספים" של תלמידי שילוב ותלמידי סל אישי.
 * הקבצים עצמם ב-`matoah/public/portfolio-templates/` בשמות ASCII בלבד
 * (שמות עבריים ב־URL נשברים ב־Vercel וגורמים ל־500).
 */
const OFFICIAL_EXTRA_DOCUMENTS: readonly PortfolioFolderButtonDef[] = [
  { label: "ויתור סודיות לוועדת אפיון וזכאות" },
  { label: "ויתור סודיות לצוות רב מקצועי" },
  { label: "ויתור סודיות לוועדת השגה" },
  {
    label: "שאלון הפניה",
    templateHref: "/portfolio-templates/sheelon-hafnaya.docx",
  },
  {
    label: "שאלון הפנייה לוועדת אפיון וזכאות",
    templateHref:
      "/portfolio-templates/sheelon-hafnaya-eligibility.docx",
  },
  {
    label: "שאלון להורים",
    templateHref: "/portfolio-templates/sheelon-lehorim.pdf",
  },
  {
    label: "המלצת פסיכולוג לשינוי קוד אפיון",
    templateHref:
      "/portfolio-templates/psychologist-recommendation.docx",
  },
  {
    label: "אישור הורים לוועדת אפיון וזכאות ללא נוכחות הורים",
    templateHref:
      "/portfolio-templates/parent-approval-without-attendance.docx",
  },
  {
    label:
      "טופס לקבלת הסכמת הורה / אפוטרופוס לפעילות באתר בית הספר/ פרסום תמונות",
    templateHref: "/portfolio-templates/school-website-photo-consent.docx",
  },
  {
    label: "חידוש הזכאות לשירותי חינוך מיוחדים",
    templateHref: "/portfolio-templates/appendix-6.11.docx",
  },
  {
    label: "מיצוי אפשרויות",
    templateHref: "/portfolio-templates/mitzuy-efsharuyot.docx",
  },
  {
    label: "נספח 8",
    templateHref: "/portfolio-templates/appendix-8.docx",
  },
  {
    label: "הכלה",
    templateHref: "/portfolio-templates/hachala.pdf",
  },
  {
    label: "דוח חינוכי תפקודי",
    templateHref: "/portfolio-templates/functional-educational-report.doc",
  },
] as const;

/**
 * תבנית תיק תלמיד — תלמידי שילוב.
 * 5 תיקיות: אינפורמציה כללית, תיעוד תהליך למידה, תח"י, אינטגרציה טיפולית, מעקב הישגים.
 */
export const PORTFOLIO_FOLDER_BUTTONS: Record<
  string,
  readonly PortfolioFolderButtonDef[]
> = {
  "אינפורמציה כללית": [
    { label: "טופס ויתור סודיות" },
    { label: "מידע על התלמיד" },
    { label: "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')" },
    {
      label: "שאלון הפניה ופרוטוקול",
      kind: "group",
    },
    { label: "בדיקות שמיעה וראיה", kind: "group" },
  ],
  "שאלון הפניה ופרוטוקול": [
    {
      label: "לדיון בצוות רב מקצועי",
      templateHref: "/portfolio-templates/sheelon-hafnaya-multidisciplinary.docx",
    },
    {
      label: "לדיון בוועדת אפיון וזכאות",
      templateHref: "/portfolio-templates/sheelon-hafnaya.docx",
    },
  ],
  "תיעוד תהליך למידה": [
    { label: "מערכת שעות" },
    { label: "תכנון למידה יומי" },
  ],
  'תח"י': [
    {
      label: 'דף הכנה לתח"י',
      templateHref: "/portfolio-templates/machon-talmid.docx",
    },
    { label: 'שאלון הורים בניית תח"י' },
    {
      label: "שאלון תלמיד",
      templateHref: "/portfolio-templates/sheelon-talmid.pdf",
    },
    { label: 'תח"י (בקובץ נפרד)' },
    {
      label: 'תח"י אינטגרטיבי',
      templateHref: "/portfolio-templates/tachi-integrative.docx",
    },
    { label: "התאמות" },
    { label: "הערכה מעצבת טבלה" },
    { label: "הערכה מעצבת מילולי" },
    { label: "הערכה מסכמת טבלה" },
    { label: "הערכה מסכמת מילולי" },
  ],
  "אינטגרציה טיפולית": [
    { label: "ישיבות צוות" },
    { label: "שיחות עם הורים" },
    { label: "תכתובות עם גורמים מטפלים מחוץ לביה\"ס" },
  ],
  "מעקב אחרי הישגי התלמיד": [
    { label: "דוגמאות דפי עבודה מתוארכים" },
    { label: "מבחנים" },
    { label: "תעודות" },
  ],
  "בדיקות שמיעה וראיה": [
    { label: "בדיקת שמיעה" },
    { label: "בדיקת ראיה" },
  ],
  "מסמכים נוספים": [
    ...OFFICIAL_EXTRA_DOCUMENTS,
    { label: "מסמכים נוספים", kind: "expandable" },
  ],
};

/**
 * תבנית כיתות חינוך מיוחד — בדיוק לפי תרשים ניהול כיתת חינוך מיוחד.
 * אין תוספות ואין חוסרים.
 */
export const SPECIAL_ED_PORTFOLIO_FOLDER_BUTTONS: Record<
  string,
  readonly PortfolioFolderButtonDef[]
> = {
  'תל"כ': [
    { label: "רשימת תלמידים" },
    { label: "אשכולות לימוד" },
    { label: "פרופיל כיתה" },
    { label: "טופס ריכוז תוכנית לימודים כיתתית" },
    { label: "תוכנית הלימודים בכיתה בהלימה לתוכנית הלימודים" },
    { label: "תוכנית הוראה כיתתית" },
    { label: "מערכות שעות", kind: "group" },
  ],
  "מערכות שעות": [
    { label: "מערכת שעות שבועית" },
    { label: "מערכת שעות פרא-רפואית" },
    { label: "מערכת שילוב" },
    { label: "מערכת שעות אישית" },
  ],
  "אינפורמציה כללית": [
    { label: "פרטי זיהוי (שם, ת.ז., לידה, רחוב)" },
    { label: "טופס ויתור סודיות חתום" },
    { label: "פרטי צוות תלמיד (תפקיד וטלפון)" },
  ],
  "אבחונים ודוחות": [
    {
      label: "אבחונים מעודכנים (פסיכולוגי, רפואי)",
      kind: "expandable",
    },
    { label: "שאלון תצפית ופרוטוקול" },
  ],
  'תח"י': [
    {
      label: 'דף הכנה לתח"י',
      templateHref: "/portfolio-templates/machon-talmid.docx",
    },
    { label: 'שאלון הורים בניית תח"י' },
    { label: 'תח"י (בקובץ נפרד)' },
    {
      label: 'תח"י אינטגרטיבי',
      templateHref: "/portfolio-templates/tachi-integrative.docx",
    },
    { label: "התאמות" },
    { label: "הערכה מעצבת טבלה" },
    { label: "הערכה מעצבת מילולי" },
    { label: "הערכה מסכמת טבלה" },
    { label: "הערכה מסכמת סיכום מילולי" },
  ],
  'תל"א': [
    {
      label: 'דף הכנה לתל"א',
      templateHref: "/portfolio-templates/machon-talmid.docx",
    },
    { label: 'דף הצגת תל"א (מוקדי כוח וחוזק)' },
    { label: "שאלון הורים (לימודי, חברתי, רגשי)" },
    {
      label: "שאלון תלמיד (ציפיות וקשיים)",
      templateHref: "/portfolio-templates/sheelon-talmid.pdf",
    },
    { label: 'תל"א (בקובץ נפרד)' },
    {
      label: 'תל"א אינטגרטיבי',
      templateHref: "/portfolio-templates/tachi-integrative.docx",
    },
  ],
  "אינטגרציה טיפולית": [
    { label: "הדרכה מומחית תחום" },
    { label: "סיכומי ישיבות צוות" },
    { label: "תיעוד שיחות עם הורים" },
    { label: "תכתובות עם גורמים חיצוניים" },
  ],
  שילוב: [
    { label: "מערכת שילוב אישית" },
    { label: "תיעוד ישיבות שילוב (מחנכת ומורה משלבת)" },
  ],
  "מעקב הישגי התלמיד": [
    { label: "דוגמאות דפי עבודה מתוארכים" },
    { label: "מבחנים" },
    { label: "תעודות" },
  ],
  "מסמכים נוספים": [
    ...OFFICIAL_EXTRA_DOCUMENTS,
    { label: "מסמכים נוספים", kind: "expandable" },
  ],
};

/**
 * תבנית תיק תלמיד — תלמידי סל אישי בלבד.
 */
export const PERSONAL_BASKET_PORTFOLIO_FOLDER_BUTTONS: Record<
  string,
  readonly PortfolioFolderButtonDef[]
> = {
  "אינפורמציה כללית": [
    { label: "טופס ויתור סודיות" },
    { label: "כרטיס תלמיד סל אישי" },
    { label: "פרטי צוות תלמיד" },
    { label: "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')" },
    {
      label: "שאלון הפניה ופרוטוקול",
      templateHref: "/portfolio-templates/sheelon-hafnaya.docx",
    },
    { label: "בדיקות שמיעה וראיה", kind: "group" },
  ],
  "תיעוד תהליך למידה": [
    { label: "מערכת שעות אישית" },
    { label: "תכנון למידה יומי" },
  ],
  'תח"י': [
    {
      label: 'דף הכנה לתח"י',
      templateHref: "/portfolio-templates/machon-talmid.docx",
    },
    { label: 'שאלון הורים בניית תח"י' },
    {
      label: "שאלון תלמיד",
      templateHref: "/portfolio-templates/sheelon-talmid.pdf",
    },
    { label: 'תח"י (בקובץ נפרד)' },
    {
      label: 'תח"י אינטגרטיבי',
      templateHref: "/portfolio-templates/tachi-integrative.docx",
    },
    { label: "הערכה מעצבת טבלה" },
    { label: "הערכה מעצבת סיכום מילולי" },
    { label: "הערכה מסכמת טבלה" },
    { label: "הערכה מסכמת סיכום מילולי" },
    { label: "התאמות" },
  ],
  "אינטגרציה טיפולית": [
    { label: "הדרכת מומחית תחום" },
    { label: "ישיבות צוות" },
    { label: "שיחות עם הורים" },
    { label: "תכתובות עם גורמים מטפלים מחוץ לביה\"ס" },
  ],
  "מעקב אחרי הישגי התלמיד": [
    { label: "דוגמאות דפי עבודה מתוארכים" },
    { label: "מבחנים" },
    { label: "תעודות" },
  ],
  "בדיקות שמיעה וראיה": [
    { label: "בדיקת שמיעה" },
    { label: "בדיקת ראיה" },
  ],
  "מסמכים נוספים": [
    ...OFFICIAL_EXTRA_DOCUMENTS,
    { label: "מסמכים נוספים", kind: "expandable" },
  ],
};

function isPersonalBasketStatus(
  status: StudentStatus | null | undefined
): boolean {
  return status === "personal-basket";
}

function isSpecialEdStatus(
  status: StudentStatus | null | undefined
): boolean {
  return status === "special-ed-class";
}

function findTemplateButtons(
  map: Record<string, readonly PortfolioFolderButtonDef[]>,
  folderName: string
): readonly PortfolioFolderButtonDef[] {
  const name = folderName.trim();
  if (map[name]) return map[name];
  for (const [key, buttons] of Object.entries(map)) {
    if (sameHebrewFolderName(key, name)) return buttons;
  }
  return [];
}

function resolveTemplateForFolder(
  folderName: string,
  status: StudentStatus | null | undefined
): readonly PortfolioFolderButtonDef[] {
  const name = folderName.trim();
  if (isPersonalBasketStatus(status)) {
    return findTemplateButtons(PERSONAL_BASKET_PORTFOLIO_FOLDER_BUTTONS, name);
  }
  if (isSpecialEdStatus(status)) {
    const normalized = normalizeDocumentFolderLabel(name, status);
    const direct = findTemplateButtons(
      SPECIAL_ED_PORTFOLIO_FOLDER_BUTTONS,
      name
    );
    if (direct.length > 0) return direct;
    return findTemplateButtons(SPECIAL_ED_PORTFOLIO_FOLDER_BUTTONS, normalized);
  }
  return findTemplateButtons(PORTFOLIO_FOLDER_BUTTONS, name);
}

export function getPortfolioFolderButtonDefs(
  folderName: string,
  status?: StudentStatus | null
): readonly PortfolioFolderButtonDef[] {
  return resolveTemplateForFolder(folderName, status);
}

export function getDefaultFolderActionLabels(
  folderName: string,
  status?: StudentStatus | null
): string[] {
  const defs = getPortfolioFolderButtonDefs(folderName, status);
  if (defs.length > 0) return defs.map((d) => d.label);
  return [];
}

export function isExpandableFolderButton(
  folderName: string,
  label: string,
  status?: StudentStatus | null
): boolean {
  const def = getPortfolioFolderButtonDefs(folderName, status).find(
    (d) => d.label === label || label.startsWith(`${d.label} `)
  );
  return def?.kind === "expandable";
}

export function isMultiAddFolderButton(
  folderName: string,
  label: string,
  status?: StudentStatus | null
): boolean {
  const def = getPortfolioFolderButtonDefs(folderName, status).find(
    (d) => d.label === label || label.startsWith(`${d.label} `)
  );
  return def?.kind === "multi-add";
}

export function isGroupFolderButton(
  folderName: string,
  label: string,
  status?: StudentStatus | null
): boolean {
  const def = getPortfolioFolderButtonDefs(folderName, status).find(
    (d) => d.label === label
  );
  return def?.kind === "group";
}

export function isCustomDocumentFolder(folderName: string): boolean {
  return folderName === "מסמכים נוספים";
}

/** תיקיית־קבוצה: שאלון הפניה + פרוטוקול (כולל תתי־טפסים) */
export const REFERRAL_PROTOCOL_FOLDER = "שאלון הפניה ופרוטוקול";

const REFERRAL_PROTOCOL_ALIASES = [
  REFERRAL_PROTOCOL_FOLDER,
  "שאלון הפניה",
  "שאלון הפנייה",
  "לדיון בוועדת אפיון וזכאות",
  "לדיון בצוות רב מקצועי",
  "שאלון הפניה לצוות רב מקצועי",
  "שאלון הפנייה לוועדת אפיון וזכאות",
] as const;

export function isReferralProtocolFolder(folderName: string): boolean {
  const name = folderName.trim();
  return REFERRAL_PROTOCOL_ALIASES.some((alias) =>
    sameHebrewFolderName(alias, name)
  );
}

/** האם זו תיקיית־הקבוצה עצמה (לא תת־טופס) */
export function isReferralProtocolGroupFolder(folderName: string): boolean {
  const name = folderName.trim();
  return (
    sameHebrewFolderName(name, REFERRAL_PROTOCOL_FOLDER) ||
    sameHebrewFolderName(name, "שאלון הפניה") ||
    sameHebrewFolderName(name, "שאלון הפנייה")
  );
}

/**
 * תוויות/תיקיות שמסמך שלהן שייך לשאלון הפניה ופרוטוקול
 * (כולל תתי־הטפסים והשמות הישנים).
 */
export function referralProtocolDocumentLabels(
  folderName: string,
  status?: StudentStatus | null
): string[] {
  const name = folderName.trim();
  if (!isReferralProtocolFolder(name)) return [name];

  if (isReferralProtocolGroupFolder(name)) {
    const children = getPortfolioFolderButtonDefs(
      REFERRAL_PROTOCOL_FOLDER,
      status
    ).map((d) => d.label);
    return Array.from(
      new Set([
        REFERRAL_PROTOCOL_FOLDER,
        ...REFERRAL_PROTOCOL_ALIASES,
        ...children,
      ])
    );
  }

  return [name];
}

export function documentBelongsToReferralProtocolFolder(opts: {
  docFolder: string;
  docSlot: string | null | undefined;
  folderName: string;
  status?: StudentStatus | null;
}): boolean {
  const labels = referralProtocolDocumentLabels(
    opts.folderName,
    opts.status
  );
  const folder = (opts.docFolder || "").trim();
  const slot = (opts.docSlot || "").trim();
  return labels.some(
    (label) =>
      sameHebrewFolderName(label, folder) || sameHebrewFolderName(label, slot)
  );
}

/**
 * מחזיר את נתיב ההורדה של הטופס הרשמי המצורף לכפתור, אם קיים.
 * משמש להצגת אייקון "הורדת תבנית ריקה" על כפתורי "מסמכים נוספים".
 */
export function sameNormalizedFolderName(
  a: string,
  b: string,
  status?: StudentStatus | null
): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (sameHebrewFolderName(left, right)) return true;
  return sameHebrewFolderName(
    normalizeDocumentFolderLabel(left, status),
    normalizeDocumentFolderLabel(right, status)
  );
}

export function getFolderButtonTemplateHref(
  folderName: string,
  label: string,
  status?: StudentStatus | null,
  category?: string | null
): string | null {
  const normalizedLabel = normalizeDocumentFolderLabel(label, status);
  const def = getPortfolioFolderButtonDefs(folderName, status).find(
    (d) =>
      d.label === label ||
      d.label === normalizedLabel ||
      sameHebrewFolderName(d.label, label) ||
      sameHebrewFolderName(d.label, normalizedLabel)
  );
  if (
    category === "kindergartens" &&
    (label === "שאלון הפניה ופרוטוקול" ||
      label === "שאלון הפניה" ||
      label === "שאלון הפנייה" ||
      label === "לדיון בוועדת אפיון וזכאות")
  ) {
    return "/portfolio-templates/sheelon-hafnaya-eligibility.docx";
  }
  return def?.templateHref ?? null;
}

/**
 * תבנית להורדה לפי שם תיקיית/טופס (מחפש בהורים הנפוצים).
 */
export function getFormsFolderTemplateHref(
  formsFolder: string,
  status?: StudentStatus | null,
  category?: string | null
): string | null {
  const raw = formsFolder.trim();
  if (!raw) return null;
  const names = [raw];
  const normalized = normalizeDocumentFolderLabel(raw, status);
  if (normalized && normalized !== raw) names.push(normalized);

  const parents = [
    REFERRAL_PROTOCOL_FOLDER,
    "אינפורמציה כללית",
    "מסמכים נוספים",
  ];

  for (const name of names) {
    if (category === "kindergartens" && isReferralProtocolFolder(name)) {
      return "/portfolio-templates/sheelon-hafnaya-eligibility.docx";
    }
    for (const parent of parents) {
      const href = getFolderButtonTemplateHref(parent, name, status, category);
      if (href) return href;
    }
    if (isReferralProtocolGroupFolder(name)) {
      return (
        getFolderButtonTemplateHref(
          "אינפורמציה כללית",
          REFERRAL_PROTOCOL_FOLDER,
          status,
          category
        ) || "/portfolio-templates/sheelon-hafnaya.docx"
      );
    }
  }
  return null;
}

/** שמות ישנים / כפתורי משנה שלא אמורים להופיע כתיקיות ברמת התיק */
const LEGACY_INTERNAL_SLOT_LABELS = [
  "ויתור סודיות",
  "טופס ויתור סודיות",
  "טופס ויתור סודיות חתום",
  "ויתור סודיות לוועדת אפיון וזכאות",
  "ויתור סודיות לצוות רב מקצועי",
  "ויתור סודיות לוועדת השגה",
  "מידע על התלמיד",
  "מידע על התלמיד/ה",
  "אבחונים ודוחות פורמליים",
  "שאלון הפנייה",
  "שאלון הפניה",
  "שאלון הפנייה לוועדת אפיון וזכאות",
  "לדיון בצוות רב מקצועי",
  "לדיון בוועדת אפיון וזכאות",
  "שאלון הורים",
  'תח"י (בקובץ נפרד)',
  'תל"א (בקובץ נפרד)',
  'תל"א אינטגרטיבי',
  'תל"א אינטגרטיבי (בקובץ נפרד)',
  'תח"י אינטגרטיבי',
  "כרטיס תלמיד סל אישי",
  "פרטי זיהוי",
  "פרטי זיהוי (שם, ת.ז., לידה)",
  "פרטי זיהוי (שם, ת.ז., לידה, רחוב)",
  "הערכה מעצבת סיכום מילולי",
  "הערכה מסכמת סיכום מילולי",
  "הערכה מעצבת מילולי",
  "הערכה מסכמת מילולי",
  "דוג' של דפי עבודה משמעותיים (כולל תאריך)",
  "דוגמאות של דפי עבודה מעודכנים (כולל תאריך)",
  "דוגמאות דפי עבודה מתוארכים",
  "דוח חינוכי תפקודי",
] as const;

/** מיפוי שמות תיקייה ישנים → השם הנוכחי של הטופס המובנה (כל הסטטוסים) */
export const LEGACY_FOLDER_LABEL_ALIASES: Record<string, string> = {
  "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ": "דוח חינוכי תפקודי",
  "שאלון הפניה": "שאלון הפניה ופרוטוקול",
  "שאלון הפנייה": "שאלון הפניה ופרוטוקול",
  "שאלון הפנייה לוועדת אפיון וזכאות": "שאלון הפנייה לוועדת אפיון וזכאות",
  'שאלון הורים בנית תח"י': 'שאלון הורים בניית תח"י',
  "הערכת מסכמת טבלה": "הערכה מסכמת טבלה",
};

/** מיפוי שמות ישנים → שמות התרשים — כיתות חינוך מיוחד בלבד */
export const SPECIAL_ED_LEGACY_FOLDER_LABEL_ALIASES: Record<string, string> = {
  "פרטי זיהוי": "פרטי זיהוי (שם, ת.ז., לידה, רחוב)",
  "פרטי זיהוי (שם, ת.ז., לידה)": "פרטי זיהוי (שם, ת.ז., לידה, רחוב)",
  "טופס ויתור סודיות": "טופס ויתור סודיות חתום",
  "פרטי צוות תלמיד": "פרטי צוות תלמיד (תפקיד וטלפון)",
  // תל"כ — שמות ישנים שעדיין מופיעים בטפסים ישנים
  "תוכנית הוראה כיתתית": "תוכנית הוראה כיתתית",
  "אינטראקציה טיפולית": "אינטגרציה טיפולית",
  "מעקב אחרי הישגי התלמיד": "מעקב הישגי התלמיד",
  "תוכנית שילוב אישית": "מערכת שילוב אישית",
  "תיעוד ישיבות שילוב": "תיעוד ישיבות שילוב (מחנכת ומורה משלבת)",
  "ישיבות צוות": "סיכומי ישיבות צוות",
  "הדרכת מנהלת תחום": "הדרכה מומחית תחום",
  "הדרכת מומחית תחום": "הדרכה מומחית תחום",
  "הדרכת מומחה תחום": "הדרכה מומחית תחום",
  "שיחות עם הורים": "תיעוד שיחות עם הורים",
  "תיעוד קשר עם הורים": "תיעוד שיחות עם הורים",
  "התכתבות עם גורמים חיצוניים": "תכתובות עם גורמים חיצוניים",
  'תכתובות עם גורמים מטפלים מחוץ לביה"ס': "תכתובות עם גורמים חיצוניים",
  "תכתובות עם גורמים מחוץ לבית הספר": "תכתובות עם גורמים חיצוניים",
  "דוג' של דפי עבודה משמעותיים (כולל תאריך)": "דוגמאות דפי עבודה מתוארכים",
  "דוגמאות של דפי עבודה מעודכנים (כולל תאריך)": "דוגמאות דפי עבודה מתוארכים",
  // תל"כ — שמות ישנים → לפי מסמך התל"כ
  "אסטרטגיות לימוד": "אשכולות לימוד",
  "רשימת תלמידים (אפיון ותיאור תפקוד)": "רשימת תלמידים",
  "פרוטוקול כיתה (מוקדי כוח, חיזוק ומטרות)": "פרופיל כיתה",
  "פרוטוקול כיתה": "פרופיל כיתה",
  "פרופיל כיתה (מוקדי כח, חיזוק ומטרות)": "פרופיל כיתה",
  "תוכנית לימודים מותאמת וספרי לימוד":
    "תוכנית הלימודים בכיתה בהלימה לתוכנית הלימודים",
  "תוכנית הוראה כיתתית (מטרות ודרכי הוראה)": "תוכנית הוראה כיתתית",
  "מערכת טיפול פרא-רפואית": "מערכת שעות פרא-רפואית",
  "מערכת אישית כיתתית": "מערכת שעות אישית",
};

export function normalizeDocumentFolderLabel(
  folderName: string,
  status?: StudentStatus | null
): string {
  const name = folderName.trim();
  if (isSpecialEdStatus(status)) {
    return (
      SPECIAL_ED_LEGACY_FOLDER_LABEL_ALIASES[name] ??
      LEGACY_FOLDER_LABEL_ALIASES[name] ??
      name
    );
  }
  return LEGACY_FOLDER_LABEL_ALIASES[name] ?? name;
}

let cachedInternalSlots: Set<string> | null = null;

/** כפתורי טפסים / קבוצות פנימיות — לא תיקיות ברמת תיק התלמיד */
export function getInternalPortfolioSlotLabels(): Set<string> {
  if (cachedInternalSlots) return cachedInternalSlots;
  const set = new Set<string>(LEGACY_INTERNAL_SLOT_LABELS);
  for (const buttons of Object.values(PORTFOLIO_FOLDER_BUTTONS)) {
    for (const button of buttons) {
      set.add(button.label);
    }
  }
  for (const buttons of Object.values(SPECIAL_ED_PORTFOLIO_FOLDER_BUTTONS)) {
    for (const button of buttons) {
      set.add(button.label);
    }
  }
  for (const buttons of Object.values(PERSONAL_BASKET_PORTFOLIO_FOLDER_BUTTONS)) {
    for (const button of buttons) {
      set.add(button.label);
    }
  }
  set.delete("מסמכים נוספים");
  cachedInternalSlots = set;
  return set;
}

export function isInternalPortfolioSlot(folderName: string): boolean {
  const name = folderName.trim();
  if (/^מסמך \d+$/.test(name)) return true;
  return getInternalPortfolioSlotLabels().has(name);
}

export function nextExpandableSlotLabel(
  baseLabel: string,
  existing: string[]
): string {
  if (!existing.includes(baseLabel)) return baseLabel;
  let n = 2;
  while (existing.includes(`${baseLabel} (${n})`)) n += 1;
  return `${baseLabel} (${n})`;
}
