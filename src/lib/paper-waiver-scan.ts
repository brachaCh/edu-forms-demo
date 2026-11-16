import { extensionOf, resolveUploadStorage } from "@/lib/upload-guard";
import type { StudentDocument } from "@/lib/supabase/types";

/** PDF or raster image — the only types accepted as a paper waiver scan. */
export const PAPER_WAIVER_SCAN_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const PAPER_WAIVER_SCAN_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/jpeg,image/png,image/gif,image/webp";

export type WaiverSatisfactionSource = "digital" | "paper-scan" | "both" | null;

export const PAPER_WAIVER_TYPE_NOT_ALLOWED = "PAPER_WAIVER_TYPE_NOT_ALLOWED";
export const PAPER_WAIVER_ACTIVE_EXISTS = "PAPER_WAIVER_ACTIVE_EXISTS";
export const PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED =
  "PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED";
export const PAPER_WAIVER_USE_ARCHIVE_OP = "PAPER_WAIVER_USE_ARCHIVE_OP";

export type PaperWaiverListDeleteDecision =
  | { action: "remove-active" }
  | { action: "block-archived" }
  | { action: "regular" };

export function isPaperWaiverScanMime(mimeType: string | null | undefined): boolean {
  return PAPER_WAIVER_SCAN_MIMES.has(String(mimeType ?? "").trim().toLowerCase());
}

export function isPaperWaiverScanFileName(name: string | null | undefined): boolean {
  const ext = extensionOf(String(name ?? ""));
  return (
    ext === ".pdf" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".png" ||
    ext === ".gif" ||
    ext === ".webp"
  );
}

export function assertPaperWaiverScanUpload(input: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  dataUrl?: string | null;
}):
  | { ok: true; mimeType: string; dataUrl: string | null }
  | { ok: false; error: string } {
  const resolved = resolveUploadStorage(input);
  if (!resolved.ok) return resolved;
  if (
    !isPaperWaiverScanMime(resolved.mimeType) ||
    !isPaperWaiverScanFileName(input.name)
  ) {
    return { ok: false, error: PAPER_WAIVER_TYPE_NOT_ALLOWED };
  }
  return resolved;
}

export function isActivePaperWaiverScan(
  doc: Pick<StudentDocument, "is_paper_waiver" | "archived_at">
): boolean {
  return doc.is_paper_waiver === true && !doc.archived_at;
}

export function findPaperWaiverScan(
  docs: readonly StudentDocument[]
): StudentDocument | null {
  const active = docs.filter(isActivePaperWaiverScan);
  if (active.length === 0) return null;
  return [...active].sort(
    (a, b) =>
      new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  )[0];
}

export function hasPaperWaiverScanInDocs(
  docs: readonly StudentDocument[]
): boolean {
  return findPaperWaiverScan(docs) != null;
}

export function waiverSatisfactionSource(opts: {
  digitalComplete: boolean;
  paperScanComplete: boolean;
}): WaiverSatisfactionSource {
  if (opts.digitalComplete && opts.paperScanComplete) return "both";
  if (opts.digitalComplete) return "digital";
  if (opts.paperScanComplete) return "paper-scan";
  return null;
}

/** Replace archives the active scan; archived legal copies stay. */
export function documentsAfterReplacingActivePaperWaiver(
  docs: readonly StudentDocument[],
  studentId: string,
  archivedAt: string
): StudentDocument[] {
  return docs.map((doc) =>
    doc.student_id === studentId && isActivePaperWaiverScan(doc)
      ? { ...doc, archived_at: archivedAt }
      : doc
  );
}

/** Remove deletes only the active scan; archived legal copies stay. */
export function documentsAfterRemovingActivePaperWaiver(
  docs: readonly StudentDocument[],
  studentId: string
): StudentDocument[] {
  return docs.filter(
    (doc) => !(doc.student_id === studentId && isActivePaperWaiverScan(doc))
  );
}

export function canRestorePaperWaiverScan(
  docs: readonly StudentDocument[],
  restoring: Pick<StudentDocument, "id" | "student_id" | "is_paper_waiver">
): boolean {
  if (restoring.is_paper_waiver !== true) return true;
  const active = findPaperWaiverScan(
    docs.filter((doc) => doc.student_id === restoring.student_id)
  );
  return !active || active.id === restoring.id;
}

export function paperWaiverListDeleteDecision(
  doc: Pick<StudentDocument, "is_paper_waiver" | "archived_at">
): PaperWaiverListDeleteDecision {
  if (doc.is_paper_waiver !== true) return { action: "regular" };
  if (isActivePaperWaiverScan(doc)) return { action: "remove-active" };
  return { action: "block-archived" };
}

export type PaperWaiverListActionResult =
  | "removed-paper"
  | "archived-paper"
  | "regular"
  | "blocked";

/** Folder-list delete of a paper scan: dedicated remove, or block. */
export async function applyPaperWaiverListAction(opts: {
  doc?: Pick<
    StudentDocument,
    "id" | "student_id" | "is_paper_waiver" | "archived_at"
  > | null;
  documentId: string;
  removeActive: (studentId: string) => Promise<void>;
  regular: (documentId: string) => Promise<void>;
}): Promise<PaperWaiverListActionResult> {
  const decision = opts.doc
    ? paperWaiverListDeleteDecision(opts.doc)
    : { action: "regular" as const };
  if (decision.action === "block-archived") return "blocked";
  if (decision.action === "remove-active" && opts.doc) {
    await opts.removeActive(opts.doc.student_id);
    return "removed-paper";
  }
  await opts.regular(opts.documentId);
  return "regular";
}

/** Folder-list archive of a paper scan: set archived_at, never delete. */
export async function applyPaperWaiverListArchiveAction(opts: {
  doc?: Pick<
    StudentDocument,
    "id" | "student_id" | "is_paper_waiver" | "archived_at"
  > | null;
  documentId: string;
  archiveActive: (studentId: string) => Promise<void>;
  regular: (documentId: string) => Promise<void>;
}): Promise<PaperWaiverListActionResult> {
  const decision = opts.doc
    ? paperWaiverListDeleteDecision(opts.doc)
    : { action: "regular" as const };
  if (decision.action === "block-archived") return "blocked";
  if (decision.action === "remove-active" && opts.doc) {
    await opts.archiveActive(opts.doc.student_id);
    return "archived-paper";
  }
  await opts.regular(opts.documentId);
  return "regular";
}

export function paperWaiverErrorTextPath(code: string): string | null {
  switch (code) {
    case PAPER_WAIVER_TYPE_NOT_ALLOWED:
      return "studentPortfolio.paperWaiverTypeError";
    case PAPER_WAIVER_ACTIVE_EXISTS:
      return "studentPortfolio.paperWaiverRestoreBlocked";
    case PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED:
      return "studentPortfolio.paperWaiverArchiveDeleteBlocked";
    case PAPER_WAIVER_USE_ARCHIVE_OP:
      return "studentPortfolio.paperWaiverUseArchiveOp";
    default:
      return null;
  }
}
