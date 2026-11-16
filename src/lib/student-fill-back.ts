/**
 * קישורי חזרה בעמודי מילוי /personal-area/students/fill/...
 * «חזרה לתיקיות» — תיק/תיקייה של אותו תלמיד, לא טופס הבא.
 * «חזרה לרשימת התלמידים» — רשימת התלמידים (לא רוסטר צוות).
 */

import {
  hrefPathOnly,
  isStudentFileHref,
  isStudentListHref,
  parseSafeFromParam,
  sameNavHref,
} from "@/lib/navigation-back";
import {
  resolveStudentsListBackHref,
  studentsListBackLabelPath,
  type StudentListSource,
} from "@/lib/student-list-back";
import { studentPortfolioHref } from "@/lib/student-portfolio";

export function isStudentFillHref(href: string): boolean {
  const path = hrefPathOnly(href);
  return /\/students\/(?:portfolio\/[^/]+\/fill|fill)\//.test(path);
}

export function isStudentFolderSurfaceHref(href: string): boolean {
  const path = hrefPathOnly(href);
  return /\/students\/(?:portfolio|folder|forms|category|pfolder)(?:\/|$)/.test(
    path
  );
}

function studentIdFromFileHref(href: string): string | null {
  const path = hrefPathOnly(href);
  const match = path.match(
    /\/students\/(?:portfolio|folder|forms|category|pfolder|fill|view)\/([^/]+)/
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * יעד «חזרה לתיקיות» מעמוד מילוי.
 * מכבדים ?from= רק אם זו תיקייה/תיק של אותו תלמיד — לא טופס ממולא אחר.
 */
export function resolveFillFolderBackHref(options: {
  from?: string | null;
  studentId: string;
  currentHref?: string | null;
}): string {
  const fallback = studentPortfolioHref(options.studentId);
  const safe = parseSafeFromParam(options.from);
  if (!safe) return fallback;
  if (isStudentFillHref(safe)) return fallback;
  if (options.currentHref && sameNavHref(safe, options.currentHref)) {
    return fallback;
  }
  if (!isStudentFolderSurfaceHref(safe) && !isStudentFileHref(safe)) {
    return fallback;
  }
  if (isStudentListHref(safe)) return fallback;

  const fromId = studentIdFromFileHref(safe);
  if (fromId && fromId !== options.studentId) return fallback;
  if (isStudentFolderSurfaceHref(safe)) return safe;
  return fallback;
}

/** רשימת תלמידים לחזרה — מתעלמים מ-from שהוא תיקייה/טופס */
export function resolveFillStudentsListBackHref(options: {
  from?: string | null;
  stored?: string | null;
  student?: StudentListSource | null;
}): string | null {
  return resolveStudentsListBackHref({
    from: options.from,
    stored: options.stored,
    student: options.student,
  });
}

/**
 * ?from= שנשמר ב-URL אחרי autosave / rememberFillInUrl.
 * שומרים את from המקורי (למשל רשימה מסוננת), לא את יעד «חזרה לתיקיות».
 */
export function fillPageUrlFromParam(options: {
  originalFrom?: string | null;
  folderBackHref: string;
}): string {
  return parseSafeFromParam(options.originalFrom) || options.folderBackHref;
}

export function fillStudentsListBackLabelPath(options: {
  href?: string | null;
  student?: Pick<StudentListSource, "status"> | null;
}): string {
  return studentsListBackLabelPath(options);
}
