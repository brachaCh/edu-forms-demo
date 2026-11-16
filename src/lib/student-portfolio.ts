import {
  Award,
  BookOpen,
  ClipboardList,
  FileText,
  FolderOpen,
  HeartHandshake,
  Info,
  type LucideIcon,
} from "lucide-react";
import { encodeFolderParam } from "@/lib/hebrew-quotes";
import type { StudentStatus } from "@/lib/supabase/types";

export type PortfolioCategoryId =
  | "class-curriculum"
  | "general-info"
  | "diagnoses"
  | "hearing-vision"
  | "learning-process"
  | "therapy"
  | "tla"
  | "therapeutic-integration"
  | "inclusion"
  | "achievements"
  | "extra-documents";

export interface PortfolioDocCategory {
  id: PortfolioCategoryId;
  /** שם התיקייה שנשמר על המסמך */
  folder: string;
  textPath: string;
  icon: LucideIcon;
}

/**
 * תיק תלמיד — תלמידי שילוב:
 * אינפורמציה כללית (כולל בדיקות שמיעה וראיה), תיעוד תהליך למידה, תח"י,
 * אינטגרציה טיפולית, מעקב הישגים, מסמכים נוספים.
 */
export const INTEGRATION_PORTFOLIO_CATEGORIES: readonly PortfolioDocCategory[] =
  [
    {
      id: "general-info",
      folder: "אינפורמציה כללית",
      textPath: "studentPortfolio.catGeneralInfo",
      icon: Info,
    },
    {
      id: "learning-process",
      folder: "תיעוד תהליך למידה",
      textPath: "studentPortfolio.catLearningProcess",
      icon: BookOpen,
    },
    {
      id: "therapy",
      folder: 'תח"י',
      textPath: "studentPortfolio.catTherapy",
      icon: ClipboardList,
    },
    {
      id: "therapeutic-integration",
      folder: "אינטגרציה טיפולית",
      textPath: "studentPortfolio.catTherapeuticIntegration",
      icon: HeartHandshake,
    },
    {
      id: "achievements",
      folder: "מעקב אחרי הישגי התלמיד",
      textPath: "studentPortfolio.catAchievements",
      icon: Award,
    },
    {
      id: "extra-documents",
      folder: "מסמכים נוספים",
      textPath: "studentPortfolio.catExtraDocuments",
      icon: FolderOpen,
    },
  ] as const;

/**
 * תיק תלמיד כיתה — כיתות חינוך מיוחד (לפי תרשים בלבד).
 * תל"כ מנוהל בנפרד ברמת הכיתה.
 */
export const SPECIAL_ED_PORTFOLIO_CATEGORIES: readonly PortfolioDocCategory[] =
  [
    {
      id: "general-info",
      folder: "אינפורמציה כללית",
      textPath: "studentPortfolio.catGeneralInfo",
      icon: Info,
    },
    {
      id: "diagnoses",
      folder: "אבחונים ודוחות",
      textPath: "studentPortfolio.catDiagnoses",
      icon: FileText,
    },
    {
      id: "tla",
      folder: 'תל"א',
      textPath: "studentPortfolio.catTla",
      icon: ClipboardList,
    },
    {
      id: "therapeutic-integration",
      folder: "אינטגרציה טיפולית",
      textPath: "studentPortfolio.catTherapeuticIntegration",
      icon: HeartHandshake,
    },
    {
      id: "inclusion",
      folder: "שילוב",
      textPath: "studentPortfolio.catInclusion",
      icon: BookOpen,
    },
    {
      id: "achievements",
      folder: "מעקב הישגי התלמיד",
      textPath: "studentPortfolio.catSpecialEdAchievements",
      icon: Award,
    },
    {
      id: "extra-documents",
      folder: "מסמכים נוספים",
      textPath: "studentPortfolio.catExtraDocuments",
      icon: FolderOpen,
    },
  ] as const;

/**
 * תיק תלמיד — תלמידי סל אישי:
 * אינפורמציה כללית (כולל בדיקות שמיעה וראיה), תיעוד תהליך למידה, תח"י,
 * אינטגרציה טיפולית, מעקב הישגים, מסמכים נוספים.
 */
export const PERSONAL_BASKET_PORTFOLIO_CATEGORIES: readonly PortfolioDocCategory[] =
  [
    {
      id: "general-info",
      folder: "אינפורמציה כללית",
      textPath: "studentPortfolio.catGeneralInfo",
      icon: Info,
    },
    {
      id: "learning-process",
      folder: "תיעוד תהליך למידה",
      textPath: "studentPortfolio.catLearningProcess",
      icon: BookOpen,
    },
    {
      id: "therapy",
      folder: 'תח"י',
      textPath: "studentPortfolio.catTherapy",
      icon: ClipboardList,
    },
    {
      id: "therapeutic-integration",
      folder: "אינטגרציה טיפולית",
      textPath: "studentPortfolio.catTherapeuticIntegration",
      icon: HeartHandshake,
    },
    {
      id: "achievements",
      folder: "מעקב אחרי הישגי התלמיד",
      textPath: "studentPortfolio.catAchievements",
      icon: Award,
    },
    {
      id: "extra-documents",
      folder: "מסמכים נוספים",
      textPath: "studentPortfolio.catExtraDocuments",
      icon: FolderOpen,
    },
  ] as const;

/** תאימות לאחור — ברירת מחדל = שילוב */
export const PORTFOLIO_DOC_CATEGORIES = INTEGRATION_PORTFOLIO_CATEGORIES;

export function isSpecialEdPortfolioStatus(
  status: StudentStatus | null | undefined
): boolean {
  return status === "special-ed-class";
}

export function isPersonalBasketPortfolioStatus(
  status: StudentStatus | null | undefined
): boolean {
  return status === "personal-basket";
}

export function getPortfolioCategoriesForStatus(
  status: StudentStatus | null | undefined
): readonly PortfolioDocCategory[] {
  if (isPersonalBasketPortfolioStatus(status)) {
    return PERSONAL_BASKET_PORTFOLIO_CATEGORIES;
  }
  if (isSpecialEdPortfolioStatus(status)) {
    return SPECIAL_ED_PORTFOLIO_CATEGORIES;
  }
  return INTEGRATION_PORTFOLIO_CATEGORIES;
}

export function getDefaultDocumentFolders(
  status?: StudentStatus | null
): string[] {
  return getPortfolioCategoriesForStatus(status).map((c) => c.folder);
}

export const DEFAULT_DOCUMENT_FOLDERS = INTEGRATION_PORTFOLIO_CATEGORIES.map(
  (c) => c.folder
);

/** כל תיקיות ברירת מחדל בכל סוגי התיקים */
export const ALL_DEFAULT_DOCUMENT_FOLDERS: readonly string[] = Array.from(
  new Set([
    ...INTEGRATION_PORTFOLIO_CATEGORIES.map((c) => c.folder),
    ...SPECIAL_ED_PORTFOLIO_CATEGORIES.map((c) => c.folder),
    ...PERSONAL_BASKET_PORTFOLIO_CATEGORIES.map((c) => c.folder),
  ])
);

/** מיפוי מזהי קטגוריה ישנים (לפני עדכון התרשים) */
const LEGACY_CATEGORY_IDS: Record<string, PortfolioCategoryId> = {
  general: "general-info",
  diagnosis: "diagnoses",
  diagnoses: "diagnoses",
  approvals: "general-info",
  programs: "learning-process",
  committees: "therapeutic-integration",
  reports: "achievements",
  correspondence: "therapeutic-integration",
  "hearing-vision": "general-info",
};

/** מיפוי שם תיקייה → מזהה קטגוריה (כולל שמות נוכחיים וישנים) */
const LEGACY_FOLDER_TO_CATEGORY: Record<string, PortfolioCategoryId> = {
  כללי: "general-info",
  "אינפורמציה כללית": "general-info",
  אבחון: "diagnoses",
  "אבחונים ודוחות": "diagnoses",
  אישורים: "general-info",
  תוכניות: "learning-process",
  "תיעוד תהליך למידה": "learning-process",
  ועדות: "therapeutic-integration",
  "דוחות מעקב": "achievements",
  "תכתובת הורים": "therapeutic-integration",
  "בדיקות שמיעה וראיה": "general-info",
  'תל"כ': "class-curriculum",
  'תח"י': "therapy",
  'תל"א': "tla",
  שילוב: "inclusion",
  "אינטגרציה טיפולית": "therapeutic-integration",
  "אינטראקציה טיפולית": "therapeutic-integration",
  "מעקב אחרי הישגי התלמיד": "achievements",
  "מעקב הישגי התלמיד": "achievements",
  "מסמכים נוספים": "extra-documents",
};

export function isPortfolioCategoryId(
  value: string
): value is PortfolioCategoryId {
  return (
    INTEGRATION_PORTFOLIO_CATEGORIES.some((c) => c.id === value) ||
    SPECIAL_ED_PORTFOLIO_CATEGORIES.some((c) => c.id === value) ||
    PERSONAL_BASKET_PORTFOLIO_CATEGORIES.some((c) => c.id === value)
  );
}

export function getPortfolioCategory(
  id: string,
  status?: StudentStatus | null
): PortfolioDocCategory | undefined {
  if (status !== undefined && status !== null) {
    return getPortfolioCategoriesForStatus(status).find((c) => c.id === id);
  }
  return (
    INTEGRATION_PORTFOLIO_CATEGORIES.find((c) => c.id === id) ??
    SPECIAL_ED_PORTFOLIO_CATEGORIES.find((c) => c.id === id) ??
    PERSONAL_BASKET_PORTFOLIO_CATEGORIES.find((c) => c.id === id)
  );
}

export function resolvePortfolioCategoryId(
  value: string
): PortfolioCategoryId | undefined {
  if (isPortfolioCategoryId(value)) return value;
  if (LEGACY_CATEGORY_IDS[value]) return LEGACY_CATEGORY_IDS[value];
  return LEGACY_FOLDER_TO_CATEGORY[value];
}

export function studentPortfolioHref(
  studentId: string,
  from?: string | null
): string {
  const base = `/personal-area/students/portfolio/${studentId}`;
  if (!from?.trim()) return base;
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("://")) {
    return base;
  }
  return `${base}?from=${encodeURIComponent(from)}`;
}

export function studentPortfolioCategoryHref(
  studentId: string,
  categoryId: PortfolioCategoryId
): string {
  // Turbopack מחזיר 404 על /students/category/[id]/[category] ועל /portfolio/.../[category].
  // /students/folder/[id]/[folder] יציב — משתמשים בו גם לקטגוריות קבועות.
  const cat = getPortfolioCategory(categoryId);
  const folder = cat?.folder ?? categoryId;
  return `/personal-area/students/folder/${studentId}/${encodeFolderParam(folder)}`;
}

/** קישור לתיקייה — קטגוריה קבועה או תיקייה מותאמת */
export function studentPortfolioFolderHref(
  studentId: string,
  folderName: string,
  status?: StudentStatus | null,
  backHref?: string
): string {
  const match = getPortfolioCategoriesForStatus(status).find(
    (c) => c.folder === folderName
  );
  const base = match
    ? studentPortfolioCategoryHref(studentId, match.id)
    : `/personal-area/students/folder/${studentId}/${encodeFolderParam(folderName)}`;
  if (!backHref?.trim()) return base;
  if (
    !backHref.startsWith("/") ||
    backHref.startsWith("//") ||
    backHref.includes("://")
  ) {
    return base;
  }
  return `${base}?from=${encodeURIComponent(backHref)}`;
}

/** עמוד טפסים של תיקיית משנה (ריבוע) */
export function studentPortfolioFormsHref(
  studentId: string,
  folderName: string,
  backHref?: string,
  parentFolder?: string
): string {
  const base = `/personal-area/students/forms/${studentId}/${encodeFolderParam(folderName)}`;
  const params = new URLSearchParams();
  if (backHref) params.set("from", backHref);
  if (parentFolder) params.set("fromFolder", parentFolder);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function folderIconForName(
  folderName: string,
  status?: StudentStatus | null
): LucideIcon {
  const match = getPortfolioCategoriesForStatus(status).find(
    (c) => c.folder === folderName
  );
  return match?.icon ?? FolderOpen;
}
