/**
 * Next.js (Turbopack) לא רושם דפים מתחת ל-
 * /personal-area/sector/.../status/[status]
 * (הסטטוס עצמו, teacher, mode, class, frequency) — הם מחזירים 404.
 * מעבירים אותם לראוטים הקצרים תחת /personal-area/category/... שעובדים.
 */

import { encodeFolderParam } from "@/lib/hebrew-quotes";
export function rewrittenSectorHomeDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "sector" ||
    segments.length !== 3
  ) {
    return null;
  }

  const sector = segments[2] ?? "";
  if (!sector) return null;

  return {
    pathname: `/personal-area/sector-home/${sector}`,
    search,
  };
}

export function rewrittenSectorFrameworkDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "sector" ||
    segments[3] !== "framework" ||
    segments.length !== 5
  ) {
    return null;
  }

  const sector = segments[2] ?? "";
  const framework = segments[4] ?? "";
  if (!sector || !framework) return null;

  return {
    pathname: `/personal-area/sector-table/${sector}/${framework}`,
    search,
  };
}

export function rewrittenSectorNestedDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "sector" ||
    segments[3] !== "framework" ||
    segments[5] !== "status" ||
    segments.length < 7
  ) {
    return null;
  }

  const sector = segments[2] ?? "";
  const framework = segments[4] ?? "";
  const rest = segments.slice(6);
  if (!sector || !framework || rest.length === 0) return null;

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (!params.get("sector")) params.set("sector", sector);
  if (!params.get("framework")) params.set("framework", framework);

  const qs = params.toString();
  return {
    pathname: `/personal-area/category/${rest.join("/")}`,
    search: qs ? `?${qs}` : "",
  };
}

/**
 * Next.js (Turbopack) מחזיר לפעמים 404 גם על
 * /personal-area/students/portfolio/[id]/custom/[folder]
 * למרות שהעמוד קיים. נעביר לראוט קצר ושקוף שעובד יציב.
 */
export function rewrittenPortfolioCustomFolderDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "portfolio" ||
    segments[4] !== "custom" ||
    segments.length !== 6
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const folder = segments[5] ?? "";
  if (!studentId || !folder) return null;

  return {
    pathname: `/personal-area/students/folder/${studentId}/${folder}`,
    search,
  };
}

/**
 * Next.js (Turbopack) מחזיר לפעמים 404 גם על
 * /personal-area/students/portfolio/[id]/forms/[folder]
 * למרות שהעמוד קיים. נעביר לראוט קצר ושקוף שעובד יציב.
 */
export function rewrittenPortfolioFormsDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "portfolio" ||
    segments[4] !== "forms" ||
    segments.length !== 6
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const folder = segments[5] ?? "";
  if (!studentId || !folder) return null;

  return {
    pathname: `/personal-area/students/forms/${studentId}/${folder}`,
    search,
  };
}

/**
 * Next.js (Turbopack) מחזיר לפעמים 404 גם על
 * /personal-area/students/portfolio/[id]/[category]
 * ועל /students/category/... — מעבירים ל-/folder היציב.
 */
const PORTFOLIO_CATEGORY_ID_TO_FOLDER: Record<string, string> = {
  "class-curriculum": 'תל"כ',
  "general-info": "אינפורמציה כללית",
  diagnoses: "אבחונים ודוחות",
  "hearing-vision": "אינפורמציה כללית",
  "learning-process": "תיעוד תהליך למידה",
  therapy: 'תח"י',
  tla: 'תל"א',
  "therapeutic-integration": "אינטגרציה טיפולית",
  inclusion: "שילוב",
  achievements: "מעקב אחרי הישגי התלמיד",
  "extra-documents": "מסמכים נוספים",
};

const LEGACY_CATEGORY_TO_ID: Record<string, string> = {
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

function portfolioCategoryToFolderPath(
  studentId: string,
  categoryParam: string
): string | null {
  const raw = (() => {
    try {
      return decodeURIComponent(categoryParam.trim());
    } catch {
      return categoryParam.trim();
    }
  })();
  if (!raw) return null;
  const id = PORTFOLIO_CATEGORY_ID_TO_FOLDER[raw]
    ? raw
    : LEGACY_CATEGORY_TO_ID[raw] ?? raw;
  const folder = PORTFOLIO_CATEGORY_ID_TO_FOLDER[id];
  if (!folder) return null;
  return `/personal-area/students/folder/${studentId}/${encodeFolderParam(folder)}`;
}

export function rewrittenPortfolioCategoryDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "portfolio" ||
    segments.length !== 5
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const category = segments[4] ?? "";
  if (!studentId || !category) return null;

  const folderPath = portfolioCategoryToFolderPath(studentId, category);
  if (!folderPath) return null;

  return { pathname: folderPath, search };
}

/** /students/category/... → /students/folder/... (Turbopack 404 על category) */
export function rewrittenStudentsCategoryAliasDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "category" ||
    segments.length !== 5
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const category = segments[4] ?? "";
  if (!studentId || !category) return null;

  const folderPath = portfolioCategoryToFolderPath(studentId, category);
  if (!folderPath) return null;

  return { pathname: folderPath, search };
}

/** תאימות לאחור — /students/pfolder/... (גרסה קודמת של ה-alias) */
export function rewrittenLegacyPfolderCategoryDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "pfolder" ||
    segments.length !== 5
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const category = segments[4] ?? "";
  if (!studentId || !category) return null;

  const folderPath = portfolioCategoryToFolderPath(studentId, category);
  if (!folderPath) return null;

  return { pathname: folderPath, search };
}

export function rewrittenPortfolioFillDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] !== "personal-area" ||
    segments[1] !== "students" ||
    segments[2] !== "portfolio" ||
    segments[4] !== "fill" ||
    segments.length !== 6
  ) {
    return null;
  }

  const studentId = segments[3] ?? "";
  const formId = segments[5] ?? "";
  if (!studentId || !formId) return null;

  return {
    pathname: `/personal-area/students/fill/${studentId}/${formId}`,
    search,
  };
}

/**
 * Next.js מחזיר 404 על מקטע דינמי בעברית (כמו /teacher/שם).
 * בנוסף, /class/mode/... נשבר בגלל התנגשות עם /class/[class]/mode/...
 * /class/איידי → /class?name=איידי
 * /class/איידי/mode/curriculum → /mode/curriculum?name=איידי
 */
export function rewrittenClassNameDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  const classAt = segments.lastIndexOf("class");
  if (classAt < 0 || classAt >= segments.length - 1) return null;

  const afterClass = segments[classAt + 1] ?? "";
  if (!afterClass || afterClass === "mode") return null;

  let className = afterClass;
  try {
    className = decodeURIComponent(afterClass);
  } catch {
    className = afterClass;
  }
  if (!className.trim()) return null;

  const restAfterName = segments.slice(classAt + 2);
  let nextSegments: string[];
  if (restAfterName[0] === "mode" && restAfterName[1]) {
    // /class/שם/mode/X → /mode/X (class-mode לא נרשם ב-Turbopack)
    nextSegments = [
      ...segments.slice(0, classAt),
      "mode",
      restAfterName[1],
      ...restAfterName.slice(2),
    ];
  } else {
    nextSegments = [...segments.slice(0, classAt + 1), ...restAfterName];
  }
  const nextPath = `/${nextSegments.join("/")}`;

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (!params.get("name")) params.set("name", className);
  const qs = params.toString();

  return {
    pathname: nextPath,
    search: qs ? `?${qs}` : "",
  };
}

/**
 * Next.js/Turbopack: /class/mode/... מתנגש עם /class/[class]/mode ונותן 404.
 * גם /class-mode/... לא נרשם (התנגשות קידומת עם /class/).
 * /class/mode/curriculum?name=איידי → /mode/curriculum?name=איידי
 */
export function rewrittenBrokenClassModeDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  const classAt = segments.lastIndexOf("class");
  if (classAt < 0) return null;
  if (segments[classAt + 1] !== "mode") return null;
  const mode = segments[classAt + 2];
  if (!mode) return null;

  const nextPath = `/${[
    ...segments.slice(0, classAt),
    "mode",
    mode,
    ...segments.slice(classAt + 3),
  ].join("/")}`;

  const normalizedSearch =
    !search || search.startsWith("?") ? search : `?${search}`;

  return {
    pathname: nextPath,
    search: normalizedSearch,
  };
}

/**
 * /class-mode/... לא נרשם ב-Turbopack (קידומת משותפת עם /class/).
 * /class-mode/student?name=כיתה → /mode/student?name=כיתה
 * /class-mode?name=כיתה → /class?name=כיתה
 */
export function rewrittenClassModeAliasDestination(
  pathname: string,
  search = ""
): { pathname: string; search: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  const aliasAt = segments.lastIndexOf("class-mode");
  if (aliasAt < 0) return null;

  const mode = segments[aliasAt + 1];
  const nextSegments = mode
    ? [...segments.slice(0, aliasAt), "mode", mode, ...segments.slice(aliasAt + 2)]
    : [...segments.slice(0, aliasAt), "class"];

  const normalizedSearch =
    !search || search.startsWith("?") ? search : `?${search}`;

  return {
    pathname: `/${nextSegments.join("/")}`,
    search: normalizedSearch,
  };
}
