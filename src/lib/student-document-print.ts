/** הדפסת מסמכי תלמיד — תיקייה בודדת או כמה תיקיות יחד */

import {
  currentCalendarYear,
  formatHebrewYear,
  parseCalendarYear,
  resolveDocumentCalendarYear,
} from "@/lib/calendar-year";
import {
  CONFIDENTIALITY_WAIVER_FORM_ID,
} from "@/lib/confidentiality-waiver-gate";
import type { DocumentBrandLogos } from "@/lib/document-branding";
import {
  loadProtocolLogoDataUrl,
  protocolLogoPlaceholderDataUrl,
  resolveAssociationLogoDataUrl,
  resolveSchoolLogoDataUrl,
} from "@/lib/document-branding";
import {
  buildFormSnapshotHtml,
  buildPrintFixedHeaderHtml,
  resolveSchedulePrintLayout,
} from "@/lib/form-snapshot";
import {
  AUTO_PRINT_SCRIPT,
  openDetachedPrintWindow,
  POPUP_BLOCKED_MESSAGE,
  PRINT_WINDOW_NOT_READY_MESSAGE,
  type DetachedPrintWindow,
} from "@/lib/detached-print";
import { getFormSchema } from "@/lib/form-schemas";
import {
  getDocumentSlot,
  getFolderActionButtons,
} from "@/lib/folder-actions";
import { sameHebrewFolderName } from "@/lib/hebrew-quotes";
import {
  getStudentDocuments,
  getStudentFormFills,
  getStudents,
  getUser,
  loadStudentFormFills,
} from "@/lib/mock-store";
import {
  getPortfolioFolderButtonDefs,
} from "@/lib/portfolio-folder-templates";
import {
  listPortfolioFolderFormFills,
} from "@/lib/portfolio-form-fills";
import {
  convertDocxDataUrlToHtml,
  detectPrintEmbedKind,
  mapWithConcurrency,
  PRINT_DOC_CONCURRENCY,
  renderPdfDataUrlToImages,
  type PrintEmbedKind,
} from "@/lib/student-document-print-embed";
import {
  PRINT_LARGE_DOC_CONCURRENCY,
  PRINT_LARGE_FILE_BYTES,
  PRINT_LARGE_PAYLOAD_TIMEOUT_MS,
  PRINT_PAYLOAD_TIMEOUT_MS,
  clearPrintBytes,
  hasInlinePrintPayload,
  isLargePrintDocument,
  printPayloadTimeoutMs,
} from "@/lib/print-payload";
import { mergePrintFormDataWithStudent } from "@/lib/print-form-data";
import { formatStudentDisplayName } from "@/lib/person-name";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import { isFreeAccessMode } from "@/lib/free-access";
import type {
  Student,
  StudentDocument,
  StudentFormFill,
  StudentStatus,
} from "@/lib/supabase/types";
import {
  canUseSupabase,
  isStudentDocumentDataError,
} from "@/lib/supabase-db";
import {
  ensureStudentDocumentData,
  reloadStudentDocuments,
} from "@/lib/data-cache";
import { SHARED_PRINT_LAYOUT_CSS } from "@/lib/print-layout-css";
import { decodeDataUrlPrefix, sniffMagic } from "@/lib/upload-magic";

const WAIVER_PRINT_FOLDER = "אינפורמציה כללית";
const WAIVER_PRINT_SLOT = "טופס ויתור סודיות";
const WAIVER_PRINT_SLOT_SIGNED = "טופס ויתור סודיות חתום";

export {
  PRINT_LARGE_FILE_BYTES,
  PRINT_LARGE_PAYLOAD_TIMEOUT_MS,
  PRINT_PAYLOAD_TIMEOUT_MS,
};

export const PRINT_FOLDERS_FAILED_MESSAGE =
  "הדפסה נכשלה בעת הכנת המסמך. רעננו את הדף הראשי ונסו שוב. אפשר להדפיס תיקיות בנפרד.";

export const PRINT_NO_CONTENT_MESSAGE = "אין תוכן להדפסה בתיקיות שנבחרו.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoImg(
  src: string | null | undefined,
  alt: string,
  className: string
): string {
  const url = src?.trim();
  if (!url) {
    return `<div class="${className} print-cover-logo-slot" aria-hidden="true"></div>`;
  }
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`;
}

/** לוגואים לשער / הדפסת תיק לפי התלמיד והמשתמש המחובר */
export function resolvePortfolioPrintLogos(
  student?: Pick<Student, "teacher_name" | "institution_id"> | null
): DocumentBrandLogos {
  const user = typeof window !== "undefined" ? getUser() : null;
  const institutionId =
    student?.institution_id ?? user?.institution_id ?? null;
  const schoolScope = {
    teacherName: student?.teacher_name ?? user?.full_name ?? null,
    institutionId,
    userId: user?.id ?? null,
  };
  const associationScope = {
    institutionId,
    institutionCode: user?.institution_code ?? null,
  };
  return {
    schoolLogoUrl: resolveSchoolLogoDataUrl(schoolScope),
    associationLogoUrl: resolveAssociationLogoDataUrl(associationScope),
    protocolLogoUrl: protocolLogoPlaceholderDataUrl(),
  };
}

/** כמו resolvePortfolioPrintLogos + טעינת לוגו פרוטוקל מקובץ המותג */
export async function resolvePortfolioPrintLogosAsync(
  student?: Pick<Student, "teacher_name" | "institution_id"> | null
): Promise<DocumentBrandLogos> {
  const logos = resolvePortfolioPrintLogos(student);
  try {
    logos.protocolLogoUrl = await loadProtocolLogoDataUrl();
  } catch {
    logos.protocolLogoUrl = protocolLogoPlaceholderDataUrl();
  }
  return logos;
}

/** שמות תיקייה/סלוט שנכללים בהדפסה/הורדה — כולל כפתורי משנה והעלאה עצמאית */
export function printFolderMatchNames(
  studentId: string,
  folderName: string,
  status?: StudentStatus | null
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const queue = [folderName.trim()];

  while (queue.length > 0) {
    const current = queue.shift() ?? "";
    if (!current || seen.has(current)) continue;
    seen.add(current);
    names.push(current);

    const fromButtons = getFolderActionButtons(studentId, current, status);
    const fromTemplate = getPortfolioFolderButtonDefs(current, status).map(
      (d) => d.label
    );
    const labels = [...fromButtons, ...fromTemplate]
      .map((label) => label.trim())
      .filter(Boolean);

    // חשוב: רק דוחפים לתור — לא מסמנים seen כאן, כדי שתיקיות-קבוצה
    // (כמו «בדיקות שמיעה וראיה») יורחבו לכפתורי המשנה שלהן
    for (const label of labels) {
      if (!seen.has(label)) queue.push(label);
    }
  }

  return names;
}

export function documentBelongsToFolder(
  doc: StudentDocument,
  folderName: string,
  matchNames?: readonly string[]
): boolean {
  const aliases = matchNames ?? [folderName];
  const docFolder = (doc.folder || "כללי").trim();
  if (aliases.some((name) => sameHebrewFolderName(name, docFolder))) {
    return true;
  }
  const slot = (getDocumentSlot(doc.id) || "").trim();
  return Boolean(
    slot && aliases.some((name) => sameHebrewFolderName(name, slot))
  );
}

function uploadTime(doc: StudentDocument): number {
  const t = new Date(doc.uploaded_at).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * אינדקס בסדר הטפסים בתיקייה — כולל כפתורים מקוננים (למשל בדיקת שמיעה תחת בדיקות שמיעה וראיה).
 * קודם לפי slot, ורק אם אין — לפי שם תיקיית המסמך (לא לוקחים את תיקיית האב כשקיים slot).
 */
function printOrderIndex(
  doc: StudentDocument,
  orderNames: readonly string[],
  rootFolder: string
): number {
  const slot = (getDocumentSlot(doc.id) || "").trim();
  if (slot) {
    const slotIdx = orderNames.findIndex((name) =>
      sameHebrewFolderName(name, slot)
    );
    if (slotIdx >= 0) return slotIdx;
  }

  const folder = (doc.folder || "").trim();
  if (folder && !sameHebrewFolderName(folder, rootFolder)) {
    const folderIdx = orderNames.findIndex((name) =>
      sameHebrewFolderName(name, folder)
    );
    if (folderIdx >= 0) return folderIdx;
  }

  return orderNames.length + 1;
}

/** סדר הדפסה: לפי סדר התיקייה/הטפסים (כולל מקוננים), ואז מהישן לחדש */
function sortDocsForPrint(
  docs: StudentDocument[],
  folderName: string,
  studentId: string,
  status?: StudentStatus | null
): StudentDocument[] {
  const orderNames = printFolderMatchNames(studentId, folderName, status);
  return [...docs].sort((a, b) => {
    const orderA = printOrderIndex(a, orderNames, folderName);
    const orderB = printOrderIndex(b, orderNames, folderName);
    if (orderA !== orderB) return orderA - orderB;
    const byTime = uploadTime(a) - uploadTime(b);
    if (byTime !== 0) return byTime;
    return a.name.localeCompare(b.name, "he");
  });
}

export function collectDocumentsForFolders(
  studentId: string,
  folderNames: string[],
  options?: { includeMissingPayloads?: boolean }
): StudentDocument[] {
  const wanted = folderNames.map((name) => name.trim()).filter(Boolean);
  if (wanted.length === 0) return [];

  const student =
    getStudents().find((item) => item.id === studentId) ?? null;
  const status = student?.status ?? null;
  const activeYear =
    parseCalendarYear(student?.calendar_year) ?? currentCalendarYear();

  // פעילים + ארכיון של השנה הנוכחית (טפסים שהושלמו נשמרים בארכיון)
  const allDocs = getStudentDocuments(studentId).filter((doc) => {
    if (!options?.includeMissingPayloads && !doc.data_url?.trim()) return false;
    if (!doc.archived_at) return true;
    const docYear = resolveDocumentCalendarYear({
      calendar_year: doc.calendar_year,
      uploaded_at: doc.uploaded_at,
      archived_at: doc.archived_at,
      fallbackYear: activeYear,
    });
    return docYear === activeYear;
  });
  const used = new Set<string>();
  const ordered: StudentDocument[] = [];

  for (const folder of wanted) {
    const matchNames = printFolderMatchNames(studentId, folder, status);
    const inFolder = allDocs.filter(
      (doc) =>
        !used.has(doc.id) && documentBelongsToFolder(doc, folder, matchNames)
    );
    for (const doc of sortDocsForPrint(inFolder, folder, studentId, status)) {
      used.add(doc.id);
      ordered.push(doc);
    }
  }

  return ordered;
}

export interface FolderPrintGroup {
  folder: string;
  docs: StudentDocument[];
}

/**
 * מקבצת את המסמכים לפי התיקיות שנבחרו, בסדר הבחירה.
 * תיקיות ריקות נשארות ברשימה עם מערך ריק — כדי שיודפס להן עמוד.
 */
export function collectFolderPrintGroups(
  studentId: string,
  folderNames: string[]
): FolderPrintGroup[] {
  const wanted = folderNames.map((name) => name.trim()).filter(Boolean);
  const used = new Set<string>();

  return wanted.map((folder) => {
    const docs = collectDocumentsForFolders(studentId, [folder], {
      includeMissingPayloads: true,
    }).filter((doc) => !used.has(doc.id));
    for (const doc of docs) used.add(doc.id);
    return { folder, docs };
  });
}

function isSyntheticPrintDocument(doc: Pick<StudentDocument, "id">): boolean {
  return (
    doc.id.startsWith("fill-print-") || doc.id.startsWith("waiver-fill-")
  );
}

export function printUploadUnavailableNote(
  kind: PrintEmbedKind | "missing" | "too-large"
): string {
  if (kind === "too-large") {
    return "קובץ גדול מדי להדפסה מרוכזת — הדפיסו אותו בנפרד";
  }
  if (kind === "missing") {
    return "לא ניתן היה לטעון את הקובץ להדפסה. שאר המסמכים מודפסים כרגיל.";
  }
  if (kind === "pdf") {
    return "קובץ PDF שהועלה לתיק — לא ניתן היה להציג את עמודי המסמך בהדפסה זו.";
  }
  if (kind === "docx") {
    return "לא ניתן היה להציג את קובץ ה-Word בהדפסה. שאר המסמכים מודפסים כרגיל.";
  }
  if (kind === "image") {
    return "לא ניתן היה להציג את התמונה בהדפסה. שאר המסמכים מודפסים כרגיל.";
  }
  return "מסמך שהועלה לתיק — לא ניתן היה להציג את תוכן הקובץ בהדפסה זו.";
}

export function withAbortTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, ms);
  });
  return Promise.race([factory(controller.signal), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * משלים data_url לכל מסמך בתיקיות ההדפסה, קובץ-קובץ.
 * כישלון / timeout של קובץ אחד לא מבטל את השאר.
 */
export async function hydratePrintGroupPayloads(
  groups: FolderPrintGroup[],
  options?: {
    onProgress?: (done: number, total: number, label?: string) => void;
    load?: (doc: StudentDocument) => Promise<StudentDocument | null>;
    timeoutMs?: number;
    largeTimeoutMs?: number;
  }
): Promise<FolderPrintGroup[]> {
  const timeoutMs = options?.timeoutMs ?? PRINT_PAYLOAD_TIMEOUT_MS;
  const largeTimeoutMs = options?.largeTimeoutMs ?? PRINT_LARGE_PAYLOAD_TIMEOUT_MS;
  const load =
    options?.load ??
    ((doc: StudentDocument) => {
      const kind = detectPrintEmbedKind(doc.name, doc.mime_type);
      return withAbortTimeout(
        (signal) =>
          ensureStudentDocumentData(doc, { signal, purpose: "print" }),
        isLargePrintDocument(doc.size, kind) ? largeTimeoutMs : timeoutMs
      );
    });

  const missing = groups.flatMap((group) =>
    group.docs.filter(
      (doc) =>
        !hasInlinePrintPayload(doc.data_url) && !isSyntheticPrintDocument(doc)
    )
  );
  if (missing.length === 0) return groups;

  const loadedById = new Map<string, StudentDocument>();
  let done = 0;
  const hydrateOne = async (doc: StudentDocument) => {
    try {
      const full = await load(doc);
      if (full?.data_url?.trim()) loadedById.set(doc.id, full);
    } catch (error) {
      if (
        isStudentDocumentDataError(error) &&
        error.code === "DOCUMENT_TOO_LARGE"
      ) {
        loadedById.set(doc.id, {
          ...doc,
          data_url: "",
          mime_type: "application/x-matoah-too-large",
        });
      }
      // אחרת נשאר בלי תוכן — יוצג placeholder בהדפסה
    } finally {
      done += 1;
      options?.onProgress?.(
        done,
        missing.length,
        `טוען קובץ ${done} מתוך ${missing.length}…`
      );
    }
    return doc.id;
  };

  const small = missing.filter(
    (doc) =>
      !isLargePrintDocument(
        doc.size,
        detectPrintEmbedKind(doc.name, doc.mime_type)
      )
  );
  const large = missing.filter(
    (doc) =>
      isLargePrintDocument(
        doc.size,
        detectPrintEmbedKind(doc.name, doc.mime_type)
      )
  );
  await mapWithConcurrency(small, PRINT_DOC_CONCURRENCY, hydrateOne);
  await mapWithConcurrency(large, PRINT_LARGE_DOC_CONCURRENCY, hydrateOne);

  return groups.map((group) => ({
    folder: group.folder,
    docs: group.docs.map((doc) => loadedById.get(doc.id) ?? doc),
  }));
}

/** האם מסמך/מילוי בתיק הוא טופס ויתור הסודיות הראשי */
export function isConfidentialityWaiverPrintItem(
  doc: Pick<StudentDocument, "id" | "name">
): boolean {
  const slot = (getDocumentSlot(doc.id) || "").trim();
  const name = doc.name.trim();
  return (
    sameHebrewFolderName(slot, WAIVER_PRINT_SLOT) ||
    sameHebrewFolderName(slot, WAIVER_PRINT_SLOT_SIGNED) ||
    /ויתור\s*סודיות/i.test(name)
  );
}

/** טופס ויתור סודיות הבית-ספרי בלבד — לא נספחי משרד החינוך (2.1–2.3) */
export function isSchoolConfidentialityWaiverPrintItem(
  doc: Pick<StudentDocument, "id" | "name">
): boolean {
  if (doc.id.startsWith("waiver-fill-")) return true;
  const slot = (getDocumentSlot(doc.id) || "").trim();
  if (
    sameHebrewFolderName(slot, WAIVER_PRINT_SLOT) ||
    sameHebrewFolderName(slot, WAIVER_PRINT_SLOT_SIGNED)
  ) {
    return true;
  }
  const name = doc.name.trim();
  if (
    sameHebrewFolderName(name, WAIVER_PRINT_SLOT) ||
    sameHebrewFolderName(name, WAIVER_PRINT_SLOT_SIGNED)
  ) {
    return true;
  }
  return /טופס\s*ויתור\s*סודיות/i.test(name);
}

/** הדפסת הטופס עצמו (לא תיק שלם) — תיקיית הכפתור «טופס ויתור סודיות» */
export function selectedFoldersIncludeSchoolWaiver(
  folderNames: readonly string[]
): boolean {
  return folderNames.some((name) => {
    const trimmed = name.trim();
    return (
      sameHebrewFolderName(trimmed, WAIVER_PRINT_SLOT) ||
      sameHebrewFolderName(trimmed, WAIVER_PRINT_SLOT_SIGNED)
    );
  });
}

/**
 * Auto-add the school waiver from a fill only when printing that form's
 * own slot, or the single «אינפורמציה כללית» folder (as on main).
 * Never auto-add it to a multi-folder תיק סל אישי / whole-file print.
 * Uploaded/archived waiver documents in a folder are not stripped.
 */
export function shouldAutoAddSchoolWaiver(
  folderNames: readonly string[]
): boolean {
  if (selectedFoldersIncludeSchoolWaiver(folderNames)) return true;
  if (folderNames.length !== 1) return false;
  return sameHebrewFolderName(folderNames[0]!.trim(), WAIVER_PRINT_FOLDER);
}

export function printCollectionIncludesWaiver(
  docs: readonly StudentDocument[]
): boolean {
  return docs.some(isConfidentialityWaiverPrintItem);
}

function latestConfidentialityWaiverFill(
  studentId: string
): StudentFormFill | null {
  const fills = getStudentFormFills(studentId).filter(
    (fill) => fill.form_id === CONFIDENTIALITY_WAIVER_FORM_ID
  );
  if (fills.length === 0) return null;
  return [...fills].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];
}

function waiverFillHasPrintableContent(fill: StudentFormFill): boolean {
  const data = fill.data ?? {};
  if (fill.status === "completed") return true;
  const father = String(data.father_signature ?? "").trim();
  const mother = String(data.mother_signature ?? "").trim();
  if (father && mother) return true;
  return Boolean(
    String(data.student_name ?? data.full_name ?? "").trim() ||
      String(data.father_name ?? "").trim() ||
      String(data.mother_name ?? "").trim()
  );
}

function htmlSnapshotToDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** בונה מסמך HTML להדפסה ממילוי ויתור — כשאין עותק בארכיון (למשל אחרי חתימה במייל) */
export function buildWaiverPrintDocumentFromFill(
  studentId: string,
  student: Student | null,
  logos: DocumentBrandLogos,
  fill: StudentFormFill
): StudentDocument {
  const schema = getFormSchema(CONFIDENTIALITY_WAIVER_FORM_ID);
  if (!schema) {
    throw new Error(`Form schema not found: ${CONFIDENTIALITY_WAIVER_FORM_ID}`);
  }
  const displayName = formatStudentDisplayName(student?.full_name ?? "");
  const html = buildFormSnapshotHtml(
    schema,
    fill.data ?? {},
    displayName,
    logos
  );
  const now = fill.updated_at || new Date().toISOString();
  return {
    id: `waiver-fill-${fill.id}`,
    student_id: studentId,
    name: schema.title,
    folder: WAIVER_PRINT_FOLDER,
    mime_type: "text/html",
    size: html.length,
    data_url: htmlSnapshotToDataUrl(html),
    uploaded_at: now,
    archived_at: now,
    calendar_year:
      parseCalendarYear(student?.calendar_year) ?? currentCalendarYear(),
  };
}

/** מוסיף ויתור סודיות לראש תיקיית הוויתור / «אינפורמציה כללית» */
export function injectWaiverDocumentIntoGroups(
  groups: FolderPrintGroup[],
  waiverDoc: StudentDocument
): FolderPrintGroup[] {
  const targetIdx = groups.findIndex(
    (group) =>
      sameHebrewFolderName(group.folder, WAIVER_PRINT_SLOT) ||
      sameHebrewFolderName(group.folder, WAIVER_PRINT_SLOT_SIGNED) ||
      sameHebrewFolderName(group.folder, WAIVER_PRINT_FOLDER)
  );
  if (targetIdx >= 0) {
    const target = groups[targetIdx];
    if (target.docs.some((doc) => doc.id === waiverDoc.id)) return groups;
    const nextTarget: FolderPrintGroup = {
      folder: target.folder,
      docs: [
        waiverDoc,
        ...target.docs.filter((doc) => doc.id !== waiverDoc.id),
      ],
    };
    return groups.map((group, index) =>
      index === targetIdx ? nextTarget : group
    );
  }
  return [{ folder: WAIVER_PRINT_FOLDER, docs: [waiverDoc] }, ...groups];
}

/**
 * משלים ויתור סודיות ממילוי רק כשמדפיסים את תיקיית הטופס או
 * «אינפורמציה כללית» לבדה. לא מזריקים אותו להדפסת תיק סל אישי
 * (כמה תיקיות) — זה מה שגרם לו להופיע «שוב» (fd3c761).
 * מסמך שהועלה/נשמר בתיקייה מודפס כפי שהיה ב-main.
 */
export async function augmentPrintGroupsWithWaiver(
  studentId: string,
  groups: FolderPrintGroup[],
  logos: DocumentBrandLogos
): Promise<FolderPrintGroup[]> {
  if (groups.length === 0) return groups;
  if (!shouldAutoAddSchoolWaiver(groups.map((group) => group.folder))) {
    return groups;
  }
  const flat = groups.flatMap((group) => group.docs);
  if (printCollectionIncludesWaiver(flat)) return groups;

  await loadStudentFormFills(studentId);
  const fill = latestConfidentialityWaiverFill(studentId);
  if (!fill || !waiverFillHasPrintableContent(fill)) return groups;

  if (fill.document_id) {
    const linked = getStudentDocuments(studentId).find(
      (doc) => doc.id === fill.document_id && doc.data_url?.trim()
    );
    if (linked && !flat.some((doc) => doc.id === linked.id)) {
      return injectWaiverDocumentIntoGroups(groups, linked);
    }
  }

  const student = getStudents().find((item) => item.id === studentId) ?? null;
  const waiverDoc = buildWaiverPrintDocumentFromFill(
    studentId,
    student,
    logos,
    fill
  );
  return injectWaiverDocumentIntoGroups(groups, waiverDoc);
}

function fillHasPrintableFormData(fill: StudentFormFill): boolean {
  if (fill.status === "completed") return true;
  const data = fill.data ?? {};
  return Object.values(data).some((value) => String(value ?? "").trim().length > 0);
}

/** PDF ארכיון חתום של אותו טופס — בהדפסת תיק מעדיפים את פריסת הטופס הדיגיטלית */
export function isSignedArchiveDocForForm(
  doc: StudentDocument,
  opts: {
    formTitle: string;
    label: string;
    formFolder: string;
    linkedDocumentId?: string | null;
  }
): boolean {
  const linkedId = opts.linkedDocumentId?.trim() || null;
  if (linkedId && doc.id === linkedId) {
    // Linked HTML snapshots are the digital form — keep them. Only drop
    // a linked signed PDF (SimpleSign / print-to-PDF archive).
    const kind = detectPrintEmbedKind(doc.name, doc.mime_type, doc.data_url);
    if (kind === "html") return false;
    return kind === "pdf" || /\.pdf$/i.test(doc.name);
  }

  const name = doc.name.trim();
  const isSignedPdf =
    /—\s*חתום\.pdf$/i.test(name) ||
    (/\.pdf$/i.test(name) && /חתום/.test(name));
  if (!isSignedPdf) return false;

  const title = opts.formTitle.trim();
  const label = opts.label.trim();
  if (title && (name.startsWith(title) || name.includes(` ${title} `))) {
    return true;
  }
  if (label && label.length >= 2 && name.startsWith(label)) {
    return true;
  }

  const slot = (getDocumentSlot(doc.id) || "").trim();
  if (
    slot &&
    (sameHebrewFolderName(slot, opts.formFolder) ||
      sameHebrewFolderName(slot, label) ||
      sameHebrewFolderName(slot, title))
  ) {
    return true;
  }

  return false;
}

function buildFormPrintDocumentFromFill(
  studentId: string,
  student: Student | null,
  logos: DocumentBrandLogos,
  fill: StudentFormFill,
  formTitle: string,
  folder: string
): StudentDocument | null {
  const schema = getFormSchema(fill.form_id);
  if (!schema) return null;
  const displayName = formatStudentDisplayName(student?.full_name ?? "");
  const isSchedule = resolveSchedulePrintLayout(schema).isSchedule;
  const fillData =
    isSchedule && !fill.document_id
      ? mergePrintFormDataWithStudent(
          schema,
          fill.data ?? {},
          student
            ? { full_name: student.full_name, class_name: student.class_name }
            : null,
          fill
        )
      : (fill.data ?? {});
  const html = buildFormSnapshotHtml(schema, fillData, displayName, logos);
  const now = fill.updated_at || new Date().toISOString();
  return {
    id: `fill-print-${fill.id}`,
    student_id: studentId,
    name: formTitle || schema.title,
    folder,
    mime_type: "text/html",
    size: html.length,
    data_url: htmlSnapshotToDataUrl(html),
    uploaded_at: now,
    archived_at: now,
    calendar_year:
      parseCalendarYear(student?.calendar_year) ?? currentCalendarYear(),
  };
}

/**
 * משלים הדפסה מטפסים שמולאו כשאין עותק ארכיון עם data_url במטמון
 * (או כש-getStudentDocuments רץ לפני שטעינת המסמכים הסתיימה).
 */
export async function augmentPrintGroupsWithFilledForms(
  studentId: string,
  groups: FolderPrintGroup[],
  logos: DocumentBrandLogos
): Promise<FolderPrintGroup[]> {
  if (groups.length === 0) return groups;

  await loadStudentFormFills(studentId);
  const student = getStudents().find((item) => item.id === studentId) ?? null;

  const allowWaiverFill = shouldAutoAddSchoolWaiver(
    groups.map((group) => group.folder)
  );

  return groups.map((group) => {
    let docs = [...group.docs];
    const extra: StudentDocument[] = [];
    const entries = listPortfolioFolderFormFills(
      studentId,
      group.folder,
      student?.status ?? null
    );

    for (const entry of entries) {
      if (!fillHasPrintableFormData(entry.fill)) continue;
      if (
        entry.fill.form_id === CONFIDENTIALITY_WAIVER_FORM_ID &&
        !allowWaiverFill
      ) {
        continue;
      }

      const linkedId = entry.fill.document_id?.trim() || null;
      const formFolder = entry.schema.folder || entry.label;
      const isScheduleForm = resolveSchedulePrintLayout(entry.schema).isSchedule;

      const htmlDocMatchesForm = (doc: StudentDocument): boolean => {
        const docSlot = (getDocumentSlot(doc.id) || "").trim();
        return (
          sameHebrewFolderName(doc.name, entry.schema.title) ||
          sameHebrewFolderName(doc.name, entry.label) ||
          Boolean(docSlot && sameHebrewFolderName(docSlot, formFolder))
        );
      };
      const looksLikeHtmlDoc = (doc: StudentDocument): boolean =>
        doc.mime_type === "text/html" ||
        (doc.mime_type || "").toLowerCase().startsWith("text/html") ||
        doc.id.startsWith("fill-print-") ||
        detectPrintEmbedKind(doc.name, doc.mime_type, doc.data_url) === "html";

      // מסירים PDF חתום של אותו טופס — ברנדור ל־canvas העברית מתהפכת; מדפיסים HTML ברור.
      // מעטפת HTML בלי data_url (מטא-דאטה אחרי TZ-88) לא נחשבת עותק — אחרת
      // alreadyHtml מדלג על fill-print והטופס נעלם מההדפסה (TZ-89).
      docs = docs.filter((doc) => {
        if (
          isSignedArchiveDocForForm(doc, {
            formTitle: entry.schema.title,
            label: entry.label,
            formFolder,
            linkedDocumentId: linkedId,
          })
        ) {
          return false;
        }
        if (
          looksLikeHtmlDoc(doc) &&
          htmlDocMatchesForm(doc) &&
          (isScheduleForm || !doc.data_url?.trim())
        ) {
          // Live schedule fills rebuild from the current data. A signed /
          // archived HTML snapshot is the legal copy — keep it.
          const keepArchivedSchedule =
            isScheduleForm &&
            Boolean(doc.data_url?.trim()) &&
            Boolean(doc.archived_at || (linkedId && doc.id === linkedId));
          if (keepArchivedSchedule) return true;
          return false;
        }
        return true;
      });

      const pool = [...docs, ...extra];
      const alreadyHtml = pool.some((doc) => {
        if (!doc.data_url?.trim()) return false;
        if (!looksLikeHtmlDoc(doc)) return false;
        return htmlDocMatchesForm(doc);
      });
      if (alreadyHtml) continue;

      const synthetic = buildFormPrintDocumentFromFill(
        studentId,
        student,
        logos,
        entry.fill,
        entry.label,
        group.folder
      );
      if (!synthetic) continue;
      extra.push(synthetic);
    }

    if (extra.length === 0 && docs.length === group.docs.length) return group;
    return { folder: group.folder, docs: [...docs, ...extra] };
  });
}

/** כותרת סוג התיק לעמוד שער */
export function portfolioCoverKindLabel(
  status?: StudentStatus | null,
  options?: { classCurriculum?: boolean }
): string {
  if (options?.classCurriculum) return 'תל"כ';
  if (status === "personal-basket") return "תיק סל אישי";
  if (status === "integration") return "תיק שילוב";
  if (status === "special-ed-class") return "תיק תלמיד כיתה";
  return "תיק שילוב / סל אישי";
}

/** שער בהדפסת כמה תיקיות, או בכל הדפסה של בעל-תל"כ */
export function shouldIncludePortfolioCover(
  folderCount: number,
  isClassCurriculum: boolean
): boolean {
  if (folderCount <= 0) return false;
  return isClassCurriculum || folderCount > 1;
}

/**
 * האם לדלג על דפי שער לתיקיות בודדות.
 * כשיש שער ראשי ותיקייה אחת בלבד, השער הראשי כבר מכיל את כל המידע —
 * הוספת שער נוסף לתיקייה תיצור כפילות.
 */
export function shouldSkipFolderCovers(
  includeCover: boolean,
  folderCount: number
): boolean {
  return includeCover && folderCount === 1;
}

export function resolvePortfolioCoverFields(
  student?: Pick<
    Student,
    "full_name" | "class_name" | "teacher_name" | "status" | "notes"
  > | null
): {
  kindLabel: string;
  recipientLabel: string;
  displayName: string;
  className: string | null;
} {
  if (student && isClassCurriculumStudent(student)) {
    const className = (
      student.class_name?.trim() ||
      student.teacher_name?.trim() ||
      ""
    ).trim();
    return {
      kindLabel: portfolioCoverKindLabel(student.status, {
        classCurriculum: true,
      }),
      recipientLabel: "לכיתה",
      displayName: className,
      className: null,
    };
  }
  return {
    kindLabel: portfolioCoverKindLabel(student?.status),
    recipientLabel: "לתלמיד/ה",
    displayName: formatStudentDisplayName(student?.full_name),
    className: student?.class_name ?? null,
  };
}

export function resolvePortfolioCoverYear(
  student?: Pick<Student, "calendar_year"> | null
): string {
  const year =
    parseCalendarYear(student?.calendar_year) ?? currentCalendarYear();
  return formatHebrewYear(year);
}

/** עמוד שער להדפסה משותפת של כמה תיקיות */
export function buildPortfolioCoverHtml(options: {
  studentName: string;
  yearLabel: string;
  kindLabel: string;
  className?: string | null;
  recipientLabel?: string;
  logos?: DocumentBrandLogos | null;
}): string {
  const name = options.studentName.trim() || "____________________";
  const year = options.yearLabel.trim() || "________";
  const kind = options.kindLabel.trim() || "תיק שילוב / סל אישי";
  const recipient = (options.recipientLabel ?? "לתלמיד/ה").trim() || "לתלמיד/ה";
  const className = (options.className ?? "").trim();
  const showClassLine = Boolean(className) && recipient !== "לכיתה";
  const schoolSrc = options.logos?.schoolLogoUrl?.trim() || null;
  const associationSrc = options.logos?.associationLogoUrl?.trim() || null;

  return `
    <section class="print-doc print-cover">
      <div class="print-cover-page">
        <header class="print-cover-logos">
          ${logoImg(associationSrc, "לוגו עמותה", "print-cover-logo-association")}
          ${logoImg(schoolSrc, "לוגו בית הספר", "print-cover-logo-school")}
        </header>
        <div class="print-cover-body">
          <p class="print-cover-kind">${escapeHtml(kind)}</p>
          <p class="print-cover-line">
            ${escapeHtml(recipient)}
            <span class="print-cover-value">${escapeHtml(name)}</span>
          </p>
          ${
            showClassLine
              ? `<p class="print-cover-line">כיתה <span class="print-cover-value">${escapeHtml(className)}</span></p>`
              : ""
          }
          <p class="print-cover-line">
            לשנה
            <span class="print-cover-value">${escapeHtml(year)}</span>
          </p>
        </div>
      </div>
    </section>`;
}

export type FolderCoverFields = {
  studentName: string;
  yearLabel: string;
  className: string | null;
  recipientLabel: string;
  logos: DocumentBrandLogos;
};

/** דף שער לתיקייה בודדת בתוך הדפסת תיק */
export function buildFolderCoverHtml(options: {
  folderName: string;
  studentName: string;
  yearLabel: string;
  className?: string | null;
  recipientLabel?: string;
  logos?: DocumentBrandLogos | null;
  /** תיקייה שנבחרה להדפסה אך אין בה מסמכים */
  emptyNote?: boolean;
}): string {
  const folder = options.folderName.trim() || "תיקייה";
  const name = options.studentName.trim() || "____________________";
  const year = options.yearLabel.trim() || "________";
  const recipient = (options.recipientLabel ?? "לתלמיד/ה").trim() || "לתלמיד/ה";
  const className = (options.className ?? "").trim();
  const showClassLine = Boolean(className) && recipient !== "לכיתה";
  const schoolSrc = options.logos?.schoolLogoUrl?.trim() || null;
  const associationSrc = options.logos?.associationLogoUrl?.trim() || null;

  return `
    <section class="print-doc print-cover print-folder-cover">
      <div class="print-cover-page">
        <header class="print-cover-logos">
          ${logoImg(associationSrc, "לוגו עמותה", "print-cover-logo-association")}
          ${logoImg(schoolSrc, "לוגו בית הספר", "print-cover-logo-school")}
        </header>
        <div class="print-cover-body">
          <p class="print-cover-folder-name">${escapeHtml(folder)}</p>
          <p class="print-cover-line">
            ${escapeHtml(recipient)}
            <span class="print-cover-value">${escapeHtml(name)}</span>
          </p>
          ${
            showClassLine
              ? `<p class="print-cover-line">כיתה <span class="print-cover-value">${escapeHtml(className)}</span></p>`
              : ""
          }
          <p class="print-cover-line">
            לשנה
            <span class="print-cover-value">${escapeHtml(year)}</span>
          </p>
          ${
            options.emptyNote
              ? `<p class="print-cover-empty-note">אין מסמכים בתיקייה זו.</p>`
              : ""
          }
        </div>
      </div>
    </section>`;
}

function isHtmlDocument(doc: StudentDocument): boolean {
  return detectPrintEmbedKind(doc.name, doc.mime_type) === "html";
}

function isImageDocument(doc: StudentDocument): boolean {
  return detectPrintEmbedKind(doc.name, doc.mime_type) === "image";
}

function isDataUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.trim().toLowerCase().startsWith("data:");
}

const HEIC_HEIF_MIME_RE = /^data:image\/heic?(f)?(;|,)/i;

function isHeicHeifImage(dataUrl: string | null | undefined): boolean {
  if (!dataUrl) return false;
  const trimmed = dataUrl.trim();
  if (HEIC_HEIF_MIME_RE.test(trimmed)) return true;
  const bytes = decodeDataUrlPrefix(trimmed);
  if (!bytes || bytes.length === 0) return false;
  const kind = sniffMagic(bytes);
  return kind === "heic" || kind === "heif";
}

function decodeDataUrlToText(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try {
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function extractHtmlBody(html: string): string {
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (bodyMatch?.[1]) return bodyMatch[1];
  return html;
}

/**
 * מסיר כללי @page / גובה עמוד מלא / מעברי עמוד כפויים מטפסים מוטמעים.
 * מונע שוליים כפולים ועמודים ריקים בהדפסת תיק.
 */
export function sanitizeEmbeddedStyles(css: string): string {
  return (
    css
      .replace(/@page[^{]*\{[\s\S]*?\}/gi, "")
      /* מסגרת fixed מטופס בודד — בחלון תיק כבר יש .print-page-frame; כפילות יוצרת עמוד ריק */
      .replace(/\.page-frame\s*\{[^}]*\}/gi, ".page-frame{display:none!important}")
      .replace(/min-height\s*:\s*297mm/gi, "min-height:auto")
      .replace(/min-height\s*:\s*210mm/gi, "min-height:auto")
      .replace(/min-height\s*:\s*calc\(\s*297mm[^)]*\)/gi, "min-height:auto")
      .replace(/min-height\s*:\s*calc\(\s*210mm[^)]*\)/gi, "min-height:auto")
      .replace(/height\s*:\s*calc\(\s*297mm[^)]*\)/gi, "height:auto")
      .replace(/height\s*:\s*calc\(\s*210mm[^)]*\)/gi, "height:auto")
      .replace(/height\s*:\s*297mm/gi, "height:auto")
      .replace(/height\s*:\s*210mm/gi, "height:auto")
      .replace(/min-height\s*:\s*100vh/gi, "min-height:auto")
      .replace(/height\s*:\s*100vh/gi, "height:auto")
      /* מעברי עמוד כפויים מתוך טפסים מוטמעים — חלון ההדפסה כבר מפריד מסמכים */
      .replace(/page-break-before\s*:\s*always/gi, "page-break-before:auto")
      .replace(/page-break-after\s*:\s*always/gi, "page-break-after:auto")
      .replace(/break-before\s*:\s*page/gi, "break-before:auto")
      .replace(/break-after\s*:\s*page/gi, "break-after:auto")
  );
}

function extractHtmlStyles(html: string): string {
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html))) {
    styles.push(match[1]);
  }
  return sanitizeEmbeddedStyles(styles.join("\n"));
}

function uploadedFilePlaceholder(
  doc: StudentDocument,
  detail?: string
): {
  html: string;
  styles: string;
} {
  const note = (detail || printUploadUnavailableNote("other")).trim();
  return {
    styles: "",
    html: `
      <section class="print-doc">
        <h1 class="print-doc-title">${escapeHtml(doc.name)}</h1>
        <p class="print-doc-note">${escapeHtml(note)}</p>
      </section>`,
  };
}

function uploadedPdfPlaceholder(doc: StudentDocument): {
  html: string;
  styles: string;
} {
  return uploadedFilePlaceholder(doc, printUploadUnavailableNote("pdf"));
}

/**
 * Each PDF page is its own print section. Filename is a tiny caption so it
 * does not sit in-flow with a full A4 bitmap (that pairing overflows and
 * Chromium may drop `break-inside:avoid` images).
 */
export function buildUploadedPdfPrintHtml(
  docName: string,
  pageImages: string[]
): string {
  return pageImages
    .map((src, index) => {
      const caption =
        index === 0
          ? `<p class="print-doc-pdf-caption">${escapeHtml(docName)}</p>`
          : "";
      return `
          <section class="print-doc print-doc-upload print-doc-pdf">
            ${caption}
            <img class="print-doc-pdf-page" src="${src}" alt="${escapeHtml(docName)} — עמוד ${index + 1}" />
          </section>`;
    })
    .join("\n");
}

/** מחדיר לוגואים לגוף HTML של טופס שארכב בלי לוגו מוסד/בי״ס */
export function ensureEmbeddedFormHeaderLogos(
  bodyHtml: string,
  logos: DocumentBrandLogos
): string {
  const schoolSrc = logos.schoolLogoUrl?.trim() || null;
  const associationSrc = logos.associationLogoUrl?.trim() || null;
  if (!schoolSrc && !associationSrc) return bodyHtml;
  if (/<img[^>]*class="[^"]*logo-(?:school|association)/i.test(bodyHtml)) {
    return bodyHtml;
  }

    const header = (() => {
    const school = schoolSrc
      ? logoImg(schoolSrc, "לוגו בית הספר", "logo-school")
      : "";
    const association = associationSrc
      ? logoImg(associationSrc, "לוגו עמותה", "logo-association")
      : "";
    return `<header class="doc-header">${association}${school}</header>`;
  })();

  if (/<header class="doc-header">[\s\S]*?<\/header>/i.test(bodyHtml)) {
    return bodyHtml.replace(
      /<header class="doc-header">[\s\S]*?<\/header>/i,
      header
    );
  }

  if (/<header class="moe-official-header">/i.test(bodyHtml)) {
    if (/moe-official-side/i.test(bodyHtml)) return bodyHtml;
    return bodyHtml.replace(
      /(<\/header>)/i,
      `<div class="moe-official-side">${
        associationSrc
          ? logoImg(associationSrc, "לוגו עמותה", "logo-association")
          : ""
      }${
        schoolSrc ? logoImg(schoolSrc, "לוגו בית הספר", "logo-school") : ""
      }</div>$1`
    );
  }

  if (/<div class="doc-header-screen">/i.test(bodyHtml)) {
    return bodyHtml.replace(
      /<div class="doc-header-screen">([\s\S]*?)<\/div>/i,
      `<div class="doc-header-screen">${header}</div>`
    );
  }

  if (/<thead[^>]*>\s*<tr[^>]*>\s*<td[^>]*>/i.test(bodyHtml)) {
    return bodyHtml.replace(
      /(<thead[^>]*>\s*<tr[^>]*>\s*<td[^>]*>)/i,
      `$1${header}`
    );
  }

  return `${header}${bodyHtml}`;
}

export async function buildPrintableBlock(
  doc: StudentDocument,
  logos?: DocumentBrandLogos | null
): Promise<{
  html: string;
  styles: string;
} | null> {
  if (!doc.data_url) return null;
  const kind = detectPrintEmbedKind(doc.name, doc.mime_type, doc.data_url);

  if (kind === "html" || isHtmlDocument(doc)) {
    const raw = decodeDataUrlToText(doc.data_url);
    if (!raw) return null;
    let body = extractHtmlBody(raw).trim();
    if (!body) return null;
    if (logos) {
      body = ensureEmbeddedFormHeaderLogos(body, logos);
    }
    const isSchedule = /class="[^"]*\bschedule-grid\b/.test(body);
    return {
      styles: extractHtmlStyles(raw),
      html: `
        <section class="print-doc print-doc-form${isSchedule ? " print-doc-schedule" : ""}">
          <div class="print-doc-body">${body}</div>
        </section>`,
    };
  }

  if (kind === "image" || isImageDocument(doc)) {
    if (!isDataUrl(doc.data_url)) {
      return {
        styles: "",
        html: `
          <section class="print-doc print-doc-upload">
            <h1 class="print-doc-title">${escapeHtml(doc.name)}</h1>
            <p class="print-doc-note">לא ניתן היה לטעון את התמונה להדפסה</p>
          </section>`,
      };
    }
    if (isHeicHeifImage(doc.data_url)) {
      return {
        styles: "",
        html: `
          <section class="print-doc print-doc-upload">
            <h1 class="print-doc-title">${escapeHtml(doc.name)}</h1>
            <p class="print-doc-note">פורמט התמונה אינו נתמך בדפדפן (HEIC וכדומה) — הורידו את הקובץ לצפייה</p>
          </section>`,
      };
    }
    return {
      styles: "",
      html: `
        <section class="print-doc print-doc-upload">
          <h1 class="print-doc-title">${escapeHtml(doc.name)}</h1>
          <img class="print-doc-image" src="${escapeHtml(doc.data_url ?? "")}" alt="${escapeHtml(doc.name)}" />
        </section>`,
    };
  }

  if (kind === "pdf") {
    try {
      const pages = await renderPdfDataUrlToImages(doc.data_url, doc.id);
      if (pages.length === 0) return uploadedPdfPlaceholder(doc);
      return { styles: "", html: buildUploadedPdfPrintHtml(doc.name, pages) };
    } catch {
      return uploadedPdfPlaceholder(doc);
    }
  }

  if (kind === "docx") {
    try {
      const html = await convertDocxDataUrlToHtml(doc.data_url, doc.id);
      if (!html) {
        return uploadedFilePlaceholder(doc, printUploadUnavailableNote("docx"));
      }
      return {
        styles: "",
        html: `
          <section class="print-doc print-doc-upload">
            <h1 class="print-doc-title">${escapeHtml(doc.name)}</h1>
            <div class="print-doc-body print-doc-word" dir="rtl" lang="he">${html}</div>
          </section>`,
      };
    } catch {
      return uploadedFilePlaceholder(doc, printUploadUnavailableNote("docx"));
    }
  }

  return uploadedFilePlaceholder(doc);
}


/** עמוד לתיקייה שנבחרה להדפסה אך אין בה מסמכים */
export function buildEmptyFolderHtml(folderName: string): string {
  return `
    <section class="print-doc print-folder-empty">
      <h1 class="print-doc-title">${escapeHtml(folderName)}</h1>
      <p class="print-doc-note">אין מסמכים בתיקייה זו.</p>
    </section>`;
}

type PrintableBlock = { html: string; styles: string };

function withPrintDocLastClass(blocks: string[]): string[] {
  if (blocks.length === 0) return blocks;
  const last = blocks.length - 1;
  return blocks.map((html, index) => {
    if (index !== last || /\bprint-doc-last\b/.test(html)) return html;
    return html.replace(
      /class="([^"]*\bprint-doc\b[^"]*)"/,
      'class="$1 print-doc-last"'
    );
  });
}

/** עמוד עם כותרת קבועה בלבד — בלי טקסט/תמונה אחרי הסרת סגנונות */
export function isVisuallyEmptyPrintHtml(html: string): boolean {
  if (
    /background-image\s*:\s*(?!none\b)[^;)]+/i.test(html) ||
    /style\s*=\s*["'][^"']*url\(/i.test(html)
  ) {
    return false;
  }
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(img|svg|canvas|object|embed|iframe)\b[\s\S]*?>/gi, "VIS")
    .replace(/<(?:input|textarea|select)\b[^>]*>/gi, "INP")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}

/**
 * פותח חלון הדפסה עם כל המסמכים הניתנים להדפסה.
 * חשוב: החלון נפתח מיד (לפני עיבוד PDF/Word) כדי שהדפדפן לא יחסום אותו.
 * החלון מנותק (noopener) — דיאלוג ההדפסה לא מקפיא את הדף הראשי.
 * מחזיר false אם אין מה להדפיס.
 */
export async function printStudentDocuments(
  docs: StudentDocument[],
  title = "הדפסת מסמכים",
  options?: {
    coverHtml?: string | null;
    printWindow?: DetachedPrintWindow | null;
    /** עמודים נוספים לתיקיות ריקות, בסדר ההדפסה */
    groups?: FolderPrintGroup[] | null;
    /** שדות לדף שער לכל תיקייה (כש-groups מוגדר) */
    folderCoverFields?: FolderCoverFields | null;
    /** לוגו פרוטוקל שמודפס בתחתית כל עמוד */
    footerLogoUrl?: string | null;
    /** לוגואים לכותרת קבועה / החדרה לטפסים מוטמעים */
    headerLogos?: DocumentBrandLogos | null;
    /** טוען data_url למסמך חסר — במקביל להמרה של טפסים שכבר מוכנים (TZ-101) */
    loadDoc?: (doc: StudentDocument) => Promise<StudentDocument | null>;
  }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const groups = options?.groups ?? null;
  if (docs.length === 0 && !groups?.length) {
    options?.printWindow?.fail(PRINT_NO_CONTENT_MESSAGE);
    return false;
  }

  const printWindow = options?.printWindow ?? openDetachedPrintWindow(title);
  if (!printWindow) {
    window.alert(POPUP_BLOCKED_MESSAGE);
    return false;
  }

  try {
  const blocks: string[] = [];
  const styles: string[] = [];
  const coverHtml = options?.coverHtml?.trim();
  if (coverHtml) blocks.push(coverHtml);

  const folderCoverFields = options?.folderCoverFields ?? null;
  const headerLogos = options?.headerLogos ?? folderCoverFields?.logos ?? null;

  type WorkItem =
    | { kind: "folder-cover"; folder: string; empty: boolean }
    | { kind: "empty"; folder: string }
    | { kind: "doc"; doc: StudentDocument };

  const workItems: WorkItem[] = [];
  if (groups) {
    for (const group of groups) {
      if (folderCoverFields) {
        workItems.push({
          kind: "folder-cover",
          folder: group.folder,
          empty: group.docs.length === 0,
        });
        if (group.docs.length === 0) continue;
      } else if (group.docs.length === 0) {
        workItems.push({ kind: "empty", folder: group.folder });
        continue;
      }
      for (const doc of group.docs) {
        workItems.push({ kind: "doc", doc });
      }
    }
  } else {
    for (const doc of docs) {
      workItems.push({ kind: "doc", doc });
    }
  }

  const docCount = workItems.filter((item) => item.kind === "doc").length;
  let docsDone = 0;

  if (docCount > 0) printWindow.setProgress(0, docCount);

  const built = await mapWithConcurrency(
    workItems,
    PRINT_DOC_CONCURRENCY,
    async (item): Promise<PrintableBlock | null> => {
      try {
        if (item.kind === "folder-cover") {
          if (!folderCoverFields) return null;
          return {
            html: buildFolderCoverHtml({
              folderName: item.folder,
              studentName: folderCoverFields.studentName,
              yearLabel: folderCoverFields.yearLabel,
              className: folderCoverFields.className,
              recipientLabel: folderCoverFields.recipientLabel,
              logos: folderCoverFields.logos,
              emptyNote: item.empty,
            }),
            styles: "",
          };
        }
        if (item.kind === "empty") {
          return { html: buildEmptyFolderHtml(item.folder), styles: "" };
        }
        let doc = item.doc;
        if (
          !hasInlinePrintPayload(doc.data_url) &&
          !isSyntheticPrintDocument(doc) &&
          options?.loadDoc
        ) {
          try {
            const loaded = await options.loadDoc(doc);
            if (loaded) doc = loaded;
          } catch (error) {
            if (
              isStudentDocumentDataError(error) &&
              error.code === "DOCUMENT_TOO_LARGE"
            ) {
              docsDone += 1;
              if (docCount > 0) printWindow.setProgress(docsDone, docCount);
              return uploadedFilePlaceholder(
                doc,
                printUploadUnavailableNote("too-large")
              );
            }
          }
        }
        if (doc.mime_type === "application/x-matoah-too-large") {
          docsDone += 1;
          if (docCount > 0) printWindow.setProgress(docsDone, docCount);
          return uploadedFilePlaceholder(
            doc,
            printUploadUnavailableNote("too-large")
          );
        }
        const block = await buildPrintableBlock(doc, headerLogos);
        docsDone += 1;
        if (docCount > 0) printWindow.setProgress(docsDone, docCount);
        if (block) return block;
        const kind = doc.data_url?.trim()
          ? detectPrintEmbedKind(
              doc.name,
              doc.mime_type,
              doc.data_url
            )
          : "missing";
        return uploadedFilePlaceholder(
          doc,
          printUploadUnavailableNote(kind)
        );
      } catch {
        if (item.kind === "doc") {
          docsDone += 1;
          if (docCount > 0) printWindow.setProgress(docsDone, docCount);
          return uploadedFilePlaceholder(
            item.doc,
            printUploadUnavailableNote(
              detectPrintEmbedKind(
                item.doc.name,
                item.doc.mime_type,
                item.doc.data_url
              )
            )
          );
        }
        return null;
      }
    }
  );

  for (const block of built) {
    if (!block) continue;
    if (isVisuallyEmptyPrintHtml(block.html)) continue;
    if (block.styles) styles.push(block.styles);
    blocks.push(block.html);
  }

  const onlyMainCover =
    Boolean(coverHtml) && blocks.length === 1 && blocks[0] === coverHtml;
  if (blocks.length === 0 || onlyMainCover) {
    printWindow.fail(PRINT_NO_CONTENT_MESSAGE);
    return false;
  }

  let footerLogoUrl = options?.footerLogoUrl?.trim() ?? "";
  if (!footerLogoUrl) {
    try {
      footerLogoUrl = await loadProtocolLogoDataUrl();
    } catch {
      footerLogoUrl = protocolLogoPlaceholderDataUrl();
    }
  }

  const hasFormDocs = blocks.some((html) => html.includes("print-doc-form"));
  const pageHeaderHtml = hasFormDocs
    ? buildPrintFixedHeaderHtml(
        headerLogos?.schoolLogoUrl?.trim() || null,
        headerLogos?.associationLogoUrl?.trim() || null
      ).replace('class="doc-header-fixed"', 'class="print-page-header"')
    : "";
  const hasPageHeader = Boolean(pageHeaderHtml);

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* שוליים 1.5 ס״מ — כמו בטפסים בודדים */
    @page { size: A4 portrait; margin: 1.5cm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto !important;
      background: #fff;
      color: #111;
      font-family: Arial, "Segoe UI", sans-serif;
    }
    /* מעבר עמוד לפני מסמך הבא — לא אחרי (מונע עמוד ריק בסוף מסמך) */
    .print-doc + .print-doc {
      break-before: page;
      page-break-before: always;
    }
    .print-docs > .print-doc:last-child,
    .print-doc.print-doc-last {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }
    .print-doc:empty {
      display: none !important;
    }
    .print-doc {
      break-after: auto;
      page-break-after: auto;
      /* מרווח לכותרת קבועה בלבד — padding תחתון גדול גולש לעמוד ריק */
      padding: ${hasPageHeader ? "20mm" : "0"} 0 0;
      margin: 0;
    }
    .print-cover {
      display: block;
      padding: 0;
      margin: 0;
    }
    /* גובה לפי תוכן — גובה כפוי של עמוד מלא יוצר עמוד ריק אחרי השער */
    .print-cover-page {
      min-height: 0;
      height: auto;
      width: 100%;
      border: none;
      display: flex;
      flex-direction: column;
      padding: 8mm 10mm 14mm;
      overflow: visible;
    }
    .print-cover-logos {
      display: flex;
      flex-direction: row;
      direction: ltr;
      justify-content: space-between;
      align-items: center;
      gap: 8mm;
      min-height: 22mm;
      margin: 0 0 10mm;
      padding: 0 0 4mm;
      border-bottom: 1px solid #d7dde5;
    }
    ${
      hasPageHeader
        ? `/* כותרת קבועה כבר מציגה לוגואים — בלי כפילות בשער */
    .print-cover-logos {
      display: none !important;
    }
    .print-cover.print-doc,
    .print-cover {
      padding-top: 20mm;
    }`
        : ""
    }
    .print-cover-logo-school,
    .print-cover-logo-association {
      display: block;
      flex: 0 0 auto;
      width: auto;
      height: auto;
      max-width: 42mm;
      max-height: 22mm;
      object-fit: contain;
    }
    .print-cover-logo-protocol {
      display: block;
      margin: 0 auto;
      width: auto;
      height: auto;
      max-width: 68mm;
      max-height: 24mm;
      object-fit: contain;
      opacity: 0.55;
    }
    .print-cover-logo-slot {
      width: 32mm;
      height: 16mm;
      border: 1px dashed #c5ced8;
      border-radius: 4px;
      background: #f8fafc;
    }
    .print-cover-body {
      flex: 0 1 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8mm 4mm 4mm;
    }
    .print-cover-footer {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: auto;
      padding-top: 6mm;
      border-top: 1px solid #d7dde5;
    }
    .print-cover-kind,
    .print-cover-folder-name {
      margin: 0 0 14mm;
      font-size: 26pt;
      font-weight: 700;
      color: #2f3b67;
      line-height: 1.3;
    }
    .print-cover-empty-note {
      margin: 8mm 0 0;
      font-size: 13pt;
      color: #64748b;
      line-height: 1.5;
    }
    .print-cover-line {
      margin: 0 0 10mm;
      font-size: 16pt;
      color: #111;
      line-height: 1.5;
    }
    .print-cover-value {
      display: inline-block;
      min-width: 42mm;
      margin-inline: 4px;
      padding: 0 4px 2px;
      border-bottom: 1.5px solid #2f3b67;
      font-weight: 700;
      color: #07527d;
    }
    .print-doc-title {
      font-size: 14pt;
      margin: 0 0 6mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid #d7dde5;
      color: #084e76;
    }
    .print-doc-image {
      display: block;
      max-width: 100%;
      /* גובה מקסימלי בתוך שטח ההדפסה — תמונת A4 מלאה + כותרת גורמת לעמוד ריק */
      max-height: 230mm;
      width: auto;
      height: auto;
      margin: 0 auto 10mm;
      object-fit: contain;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .print-doc-title + .print-doc-image {
      max-height: 215mm;
    }
    /* PDF pages: rasterized images. Do not use break-inside:avoid (Chromium
       can drop a near-full-page replaced element instead of printing it). */
    .print-doc.print-doc-pdf {
      padding-top: ${hasPageHeader ? "22mm" : "0"};
      padding-bottom: 0;
    }
    .print-doc-pdf-caption {
      margin: 0 0 1.5mm;
      padding: 0;
      border: none;
      font-size: 8pt;
      line-height: 1.2;
      color: #084e76;
    }
    .print-doc-pdf-page {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      max-height: ${hasPageHeader ? "220mm" : "250mm"};
      margin: 0 auto;
      object-fit: contain;
      page-break-inside: auto;
      break-inside: auto;
    }
    .print-doc-word {
      font-size: 11pt;
      line-height: 1.45;
      padding-bottom: 12mm;
      direction: rtl;
      text-align: right;
    }
    .print-doc-word p { margin: 0 0 3mm; }
    .print-doc-word table {
      border-collapse: collapse;
      width: 100%;
      margin: 0 0 4mm;
    }
    .print-doc-word td,
    .print-doc-word th {
      border: 0.5pt solid #333;
      padding: 1.5mm 2mm;
      vertical-align: top;
    }
    .print-doc-word img {
      max-width: 100%;
      height: auto;
    }
    .print-doc-word ul,
    .print-doc-word ol {
      margin: 0 0 3mm;
      padding-inline-start: 6mm;
    }
    .print-doc-note {
      color: #666;
      font-size: 10pt;
    }
    .print-doc-form .print-doc-body,
    .print-doc-upload .print-doc-body {
      padding-bottom: 12mm;
    }
    /* ביטול גובה עמוד מלא מטפסים מוטמעים — מונע עמוד לבן; המסגרת הקבועה ב-.print-page-frame */
    .print-doc-body .page,
    .print-doc-body .page-sheet {
      width: auto !important;
      max-width: 100% !important;
      min-height: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 5mm !important;
      overflow: visible !important;
      border: none !important;
      position: relative !important;
    }
    .print-doc-body .page-frame {
      display: none !important;
    }
    .print-doc-body .doc-header {
      position: static !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      top: auto !important;
      margin: 0 0 6mm !important;
      padding: 0 !important;
    }
    ${
      hasPageHeader
        ? `/* כותרת קבועה בחלון ההדפסה — מסתירים כפילות מתוך הטופס */
    .print-doc-body .doc-header,
    .print-doc-body .doc-header-screen,
    .print-doc-body .moe-official-side {
      display: none !important;
    }`
        : ""
    }
    /* לוגו הפרוטוקל שבתוך הטופס המוטמע מוסתר — במקומו הלוגו שחוזר בכל עמוד */
    .print-doc-body .doc-footer {
      display: none !important;
    }
    .print-doc-body .doc-header-fixed {
      display: none !important;
    }
    .print-doc-body .page-sheet > tfoot {
      display: none !important;
    }
    /* השריון של הטופס המוטמע מיותר — השריון של חלון ההדפסה מספיק */
    .print-doc-body .doc-footer-space,
    .print-doc-body .doc-header-space {
      display: none !important;
      height: 0 !important;
    }
    .print-doc-body .holistic-grid,
    .print-doc-body .cluster-card,
    .print-doc-body table {
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    /* Rows/cards stay together — never re-apply avoid on tables (rq-grid would jump) */
    .print-doc-body .data-grid tr,
    .print-doc-body .homeroom-grid tr,
    .print-doc-body .holistic-cell {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* מערכות שעות מוטמעות מהתל"כ — טבלה רחבה שצריכה להיכנס לעמוד A4 לאורך */
    .print-doc-body .schedule-grid {
      font-size: 6.5pt !important;
      table-layout: fixed !important;
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 2mm 0 4mm !important;
    }
    .print-doc-body .schedule-grid th,
    .print-doc-body .schedule-grid td {
      padding: 0.75mm 0.5mm !important;
      line-height: 1.2 !important;
      text-align: center !important;
      vertical-align: top !important;
      border: 0.5pt solid #333 !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      font-size: 6.5pt !important;
    }
    .print-doc-body .schedule-grid .period {
      width: 5mm !important;
      font-size: 6pt !important;
      font-weight: 700 !important;
      background: #f5f7fa !important;
    }
    .print-doc-body .schedule-grid .sched-cell {
      white-space: pre-wrap !important;
    }
    .print-doc-body .schedule-grid .sched-subject {
      min-height: 0 !important;
      margin-bottom: 0.5mm !important;
      white-space: pre-wrap !important;
      line-height: 1.15 !important;
    }
    .print-doc-body .schedule-grid .sched-flags {
      font-size: 5.5pt !important;
      border-top: 0.5pt solid #999 !important;
      padding-top: 0.5mm !important;
    }
    .print-doc-body .table-hint {
      font-size: 7pt !important;
      margin: 1mm 0 2mm !important;
    }
    /* לוגו מוסד/בי״ס בראש כל עמוד — כשיש טפסים בהדפסה */
    .print-page-header {
      display: none;
    }
    ${
      hasPageHeader
        ? `.print-page-header {
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      justify-content: space-between;
      align-items: center;
      gap: 4mm;
      margin: 0;
      padding: 0 0 2mm;
      border-bottom: 1px solid #d7dde5;
      background: #fff;
      z-index: 1;
      pointer-events: none;
    }
    .print-page-header .logo-school,
    .print-page-header .logo-association {
      display: block;
      max-width: 36mm;
      max-height: 18mm;
      object-fit: contain;
    }
    .print-page-header .logo-slot {
      width: 36mm;
      height: 18mm;
    }`
        : ""
    }
    /* מודפס בתחתית כל עמוד — אלמנט fixed חוזר בכל עמוד בהדפסה */
    .print-page-footer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      justify-content: center;
      align-items: flex-end;
      margin: 0;
      padding: 0;
      pointer-events: none;
      z-index: 0;
    }
    .print-page-footer-logo {
      display: block;
      width: auto;
      max-width: 60mm;
      max-height: 10mm;
      object-fit: contain;
      opacity: 0.45;
    }
    /* מסגרת קבועה — inset box-shadow במקום border (border על fixed+inset יוצר עמוד ריק בכרום) */
    .print-page-frame {
      position: fixed;
      top: 0;
      right: 1px;
      bottom: 1px;
      left: 0;
      width: auto;
      height: auto;
      max-height: 100%;
      border: none;
      box-shadow: inset 0 0 0 1.5pt #2f3b67;
      pointer-events: none;
      z-index: 3;
    }
    ${styles.join("\n")}
    ${SHARED_PRINT_LAYOUT_CSS}
    /* אחרי סגנונות מוטמעים — מבטל גובה עמוד מלא שנשאר בטפסים */
    .print-doc-body .page,
    .print-doc-body .page-sheet {
      min-height: 0 !important;
      height: auto !important;
      width: auto !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 2mm !important;
      border: none !important;
    }
    .print-doc-body .page-frame,
    .print-doc-body .doc-footer,
    .print-doc-body .doc-header-fixed,
    .print-doc-body .page-sheet > tfoot,
    .print-doc-body .doc-footer-space,
    .print-doc-body .doc-header-space {
      display: none !important;
    }
  </style>
</head>
<body>
<div class="print-docs">
${withPrintDocLastClass(blocks).join("\n")}
</div>
  ${pageHeaderHtml}
  <footer class="print-page-footer" aria-hidden="true">
    <img class="print-page-footer-logo" src="${escapeHtml(footerLogoUrl)}" alt="" />
  </footer>
  <div class="print-page-frame" aria-hidden="true"></div>
  ${AUTO_PRINT_SCRIPT}
</body>
</html>`;

  // ה-HTML כבר כולל סקריפט window.print() משלו
  if (!(await printWindow.whenReady())) {
    printWindow.fail(PRINT_WINDOW_NOT_READY_MESSAGE);
    window.alert(POPUP_BLOCKED_MESSAGE);
    return false;
  }
  printWindow.deliver(html, { autoPrint: false });
  printWindow.dispose();
  return true;
  } finally {
    clearPrintBytes();
  }
}

export async function printDocumentsInFolders(
  studentId: string,
  folderNames: string[],
  title?: string
): Promise<{ ok: boolean; count: number }> {
  if (typeof window === "undefined") return { ok: false, count: 0 };
  if (isFreeAccessMode()) return { ok: false, count: 0 };

  const foldersPreview = folderNames.map((name) => name.trim()).filter(Boolean);
  if (foldersPreview.length === 0) return { ok: false, count: 0 };

  const label =
    title ||
    (foldersPreview.length === 1
      ? `הדפסת תיקייה — ${foldersPreview[0]}`
      : `הדפסת ${foldersPreview.length} תיקיות`);

  // פתיחה מיידית בלחיצה — לפני טעינת מסמכים / לוגואים / המרת PDF
  const printWindow = openDetachedPrintWindow(label);
  if (!printWindow) {
    window.alert(POPUP_BLOCKED_MESSAGE);
    return { ok: false, count: 0 };
  }

  // מודיעים מיד לחלון — אחרת אחרי 20 שניות (ORPHAN_HINT_MS, TZ-88) הוא מציג «לא התקבל מסמך»
  printWindow.setProgress(0, 0, "טוען מסמכים להדפסה…");

  try {
    // מטא-דאטה בלבד. תוכן קבצים נטען קובץ-קובץ למטה (הבקשה המרוכזת
    // עם includeData חורגת ממגבלת גודל של פונקציית Vercel בתיק עם העלאות).
    try {
      if (canUseSupabase()) {
        await reloadStudentDocuments(studentId);
      }
    } catch {
      // ממשיכים עם מה שיש במטמון / מקומי
    }

    // כל תיקייה שנבחרה מודפסת — גם ריקה (מקבלת עמוד "אין מסמכים")
    let groups = collectFolderPrintGroups(studentId, folderNames);
    if (groups.length === 0) {
      printWindow.fail(PRINT_NO_CONTENT_MESSAGE);
      return { ok: false, count: 0 };
    }

    const folders = groups.map((group) => group.folder);

    printWindow.setProgress(0, 0, "מכין טפסים…");
    const student = getStudents().find((s) => s.id === studentId) ?? null;
    const logos = await resolvePortfolioPrintLogosAsync(student);
    groups = await augmentPrintGroupsWithFilledForms(studentId, groups, logos);
    groups = await augmentPrintGroupsWithWaiver(studentId, groups, logos);
    const docs = groups.flatMap((group) => group.docs);
    const classCurriculum = isClassCurriculumStudent(student);
    const includeCover = shouldIncludePortfolioCover(
      folders.length,
      classCurriculum
    );
    const coverFields = resolvePortfolioCoverFields(student);
    const coverHtml = includeCover
      ? buildPortfolioCoverHtml({
          studentName: coverFields.displayName,
          yearLabel: resolvePortfolioCoverYear(student),
          kindLabel: coverFields.kindLabel,
          className: coverFields.className,
          recipientLabel: coverFields.recipientLabel,
          logos,
        })
      : null;

    const skipFolderCovers = shouldSkipFolderCovers(includeCover, folders.length);
    const ok = await printStudentDocuments(docs, label, {
      coverHtml,
      printWindow,
      groups,
      folderCoverFields: skipFolderCovers
        ? null
        : {
            studentName: coverFields.displayName,
            yearLabel: resolvePortfolioCoverYear(student),
            className: coverFields.className,
            recipientLabel: coverFields.recipientLabel,
            logos,
          },
      footerLogoUrl: logos.protocolLogoUrl,
      headerLogos: logos,
      loadDoc: (doc) => {
        const kind = detectPrintEmbedKind(doc.name, doc.mime_type);
        return withAbortTimeout(
          (signal) =>
            ensureStudentDocumentData(doc, { signal, purpose: "print" }),
          printPayloadTimeoutMs(doc.size, kind)
        );
      },
    });
    if (ok) {
      const { reportClientAudit } = await import("@/lib/client-audit");
      reportClientAudit({
        action: "print.folder",
        entityType: "student",
        entityId: studentId,
        summary:
          folders.length === 1
            ? `הודפסה תיקייה: ${folders[0]}`
            : `הודפסו ${folders.length} תיקיות`,
        metadata: {
          folders,
          document_count: docs.length,
        },
      });
    }
    return {
      ok,
      count: docs.length,
    };
  } catch (err) {
    console.error("[print-folders]", err);
    printWindow.fail(PRINT_FOLDERS_FAILED_MESSAGE);
    return { ok: false, count: 0 };
  } finally {
    clearPrintBytes();
  }
}
