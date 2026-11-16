/**
 * מעבר לטופס/מסמך הבא באותה תיקיית אב אחרי סיום מילוי או העלאה.
 * אם אין עוד טפסים בתיקייה — מעבר לתיקייה הבאה בתיק.
 */

import { getFolderActionButtons } from "@/lib/folder-actions";
import {
  getFormSchemaByFolder,
  studentPortfolioFillHref,
} from "@/lib/form-schemas";
import { isGroupFolderButton } from "@/lib/portfolio-folder-templates";
import {
  getPortfolioCategoriesForStatus,
  studentPortfolioFolderHref,
  studentPortfolioFormsHref,
} from "@/lib/student-portfolio";
import type { Category, StudentStatus } from "@/lib/supabase/types";

function collectParentFolders(
  studentId: string,
  status?: StudentStatus | null
): string[] {
  const parents = getPortfolioCategoriesForStatus(status).map((c) => c.folder);
  const extra: string[] = [];
  for (const parent of parents) {
    for (const btn of getFolderActionButtons(studentId, parent, status)) {
      if (isGroupFolderButton(parent, btn, status) && !parents.includes(btn)) {
        extra.push(btn);
      }
    }
  }
  return [...parents, ...extra];
}

function isTopLevelCategory(
  folder: string,
  status?: StudentStatus | null
): boolean {
  return getPortfolioCategoriesForStatus(status).some(
    (c) => c.folder === folder
  );
}

/** תיקיית האב שמכילה את הכפתור/הטופס הנוכחי */
export function findParentFolderForSlot(
  studentId: string,
  slotLabel: string,
  status?: StudentStatus | null,
  preferredParent?: string | null
): string | null {
  const label = slotLabel.trim();
  if (!label) return preferredParent?.trim() || null;

  const preferred = preferredParent?.trim() || null;
  const candidates = [
    ...(preferred ? [preferred] : []),
    ...collectParentFolders(studentId, status),
  ].filter((folder, index, all) => all.indexOf(folder) === index);

  for (const parent of candidates) {
    const buttons = getFolderActionButtons(studentId, parent, status);
    if (preferred === label) return preferred;

    const nestedGroup = buttons.find(
      (btn) =>
        isGroupFolderButton(parent, btn, status) &&
        getFolderActionButtons(studentId, btn, status).includes(label)
    );
    if (nestedGroup) return nestedGroup;

    if (buttons.includes(label)) return parent;
  }

  return preferred;
}

function indexOfCurrentSlot(
  buttons: string[],
  currentLabel: string,
  status?: StudentStatus | null,
  category?: Category | string | null
): number {
  const direct = buttons.indexOf(currentLabel);
  if (direct >= 0) return direct;

  return buttons.findIndex((btn) => {
    const schema = getFormSchemaByFolder(btn, status, category);
    return Boolean(schema && schema.folder === currentLabel);
  });
}

export interface NextPortfolioSibling {
  label: string;
  href: string;
  /** טופס באותה תיקייה או מעבר לתיקייה הבאה */
  kind?: "form" | "folder";
}

export interface PortfolioSiblingNavItem extends NextPortfolioSibling {
  current: boolean;
}

function hrefForSlot(options: {
  studentId: string;
  label: string;
  parent: string;
  status?: StudentStatus | null;
  category?: Category | string | null;
  backHref?: string;
  preferFill?: boolean;
}): string {
  const { studentId, label, parent, status, category, backHref, preferFill } =
    options;
  if (isGroupFolderButton(parent, label, status)) {
    return studentPortfolioFolderHref(studentId, label, status, backHref);
  }
  if (preferFill) {
    const schema = getFormSchemaByFolder(label, status, category);
    if (schema) {
      return studentPortfolioFillHref(studentId, schema.id, backHref, { parentFolder: parent });
    }
  }
  return studentPortfolioFormsHref(studentId, label, backHref, parent);
}

/**
 * כל האחים באותה תיקייה (למשל כל מערכות השעות) — למעבר ישיר ביניהם.
 */
export function listSiblingPortfolioNav(options: {
  studentId: string;
  currentLabel: string;
  status?: StudentStatus | null;
  category?: Category | string | null;
  preferredParent?: string | null;
  backHref?: string;
  preferFill?: boolean;
}): PortfolioSiblingNavItem[] {
  const {
    studentId,
    currentLabel,
    status,
    category,
    preferredParent,
    backHref,
    preferFill = true,
  } = options;

  const parent = findParentFolderForSlot(
    studentId,
    currentLabel,
    status,
    preferredParent
  );
  if (!parent) return [];

  const buttons = getFolderActionButtons(studentId, parent, status);
  const currentIdx = indexOfCurrentSlot(
    buttons,
    currentLabel.trim(),
    status,
    category
  );

  return buttons.map((label, index) => {
    const current = index === currentIdx;
    return {
      label,
      current,
      kind: "form" as const,
      href: hrefForSlot({
        studentId,
        label,
        parent,
        status,
        category,
        backHref,
        preferFill,
      }),
    };
  });
}

function firstItemInFolder(options: {
  studentId: string;
  folder: string;
  status?: StudentStatus | null;
  category?: Category | string | null;
  backHref?: string;
  preferFill?: boolean;
}): NextPortfolioSibling | null {
  const { studentId, folder, status, category, backHref, preferFill = true } =
    options;
  const buttons = getFolderActionButtons(studentId, folder, status);
  if (buttons.length === 0) {
    return {
      label: folder,
      kind: "folder",
      href: studentPortfolioFolderHref(studentId, folder, status, backHref),
    };
  }
  const first = buttons[0];
  return {
    label: first,
    kind: "folder",
    href: hrefForSlot({
      studentId,
      label: first,
      parent: folder,
      status,
      category,
      backHref,
      preferFill,
    }),
  };
}

/**
 * הטופס/המסמך הבא באותה תיקייה.
 * אם אין עוד — התיקייה הבאה בתיק (או הפריט הראשון בה).
 * @param preferFill — אם true ומציאת טופס מובנה, מעביר ישירות למסך המילוי
 */
export function getNextSiblingPortfolioNav(options: {
  studentId: string;
  currentLabel: string;
  status?: StudentStatus | null;
  category?: Category | string | null;
  preferredParent?: string | null;
  backHref?: string;
  preferFill?: boolean;
}): NextPortfolioSibling | null {
  const {
    studentId,
    currentLabel,
    status,
    category,
    preferredParent,
    backHref,
    preferFill = true,
  } = options;

  // מסך קטגוריה ברמת התיק (למשל «אבחונים ודוחות») — אין אב; מעבר לתיקייה הבאה
  const label = currentLabel.trim();
  if (label && isTopLevelCategory(label, status)) {
    return getNextCategoryNav({
      studentId,
      currentCategoryFolder: label,
      status,
      category,
      backHref,
      preferFill,
    });
  }

  const siblings = listSiblingPortfolioNav(options);
  const idx = siblings.findIndex((item) => item.current);
  if (idx >= 0 && idx < siblings.length - 1) {
    const next = siblings[idx + 1];
    return { label: next.label, href: next.href, kind: "form" };
  }

  const parent = findParentFolderForSlot(
    studentId,
    currentLabel,
    status,
    preferredParent
  );
  if (!parent) return null;

  // בתוך קבוצה מקוננת (למשל מערכות שעות) — ממשיכים לפריט הבא בתיקיית האב
  if (!isTopLevelCategory(parent, status)) {
    const categoryParent = findParentFolderForSlot(
      studentId,
      parent,
      status,
      null
    );
    if (categoryParent) {
      const parentButtons = getFolderActionButtons(
        studentId,
        categoryParent,
        status
      );
      const groupIdx = parentButtons.indexOf(parent);
      if (groupIdx >= 0 && groupIdx < parentButtons.length - 1) {
        const nextLabel = parentButtons[groupIdx + 1];
        return {
          label: nextLabel,
          kind: "form",
          href: hrefForSlot({
            studentId,
            label: nextLabel,
            parent: categoryParent,
            status,
            category,
            backHref,
            preferFill,
          }),
        };
      }
      // סוף תיקיית האב — ממשיכים לתיקייה הבאה ברמת התיק
      return getNextCategoryNav({
        studentId,
        currentCategoryFolder: categoryParent,
        status,
        category,
        backHref,
        preferFill,
      });
    }
  }

  return getNextCategoryNav({
    studentId,
    currentCategoryFolder: parent,
    status,
    category,
    backHref,
    preferFill,
  });
}

function getNextCategoryNav(options: {
  studentId: string;
  currentCategoryFolder: string;
  status?: StudentStatus | null;
  category?: Category | string | null;
  backHref?: string;
  preferFill?: boolean;
}): NextPortfolioSibling | null {
  const {
    studentId,
    currentCategoryFolder,
    status,
    category,
    backHref,
    preferFill = true,
  } = options;

  const categories = getPortfolioCategoriesForStatus(status);
  const catIdx = categories.findIndex(
    (c) => c.folder === currentCategoryFolder
  );
  if (catIdx < 0 || catIdx >= categories.length - 1) return null;

  const nextFolder = categories[catIdx + 1].folder;
  const first = firstItemInFolder({
    studentId,
    folder: nextFolder,
    status,
    category,
    backHref,
    preferFill,
  });
  if (!first) return null;

  // מציגים את שם התיקייה הבאה (לא את הטופס הראשון) בכפתור המעבר
  return {
    label: nextFolder,
    kind: "folder",
    href: preferFill
      ? first.href
      : studentPortfolioFolderHref(studentId, nextFolder, status, backHref),
  };
}
