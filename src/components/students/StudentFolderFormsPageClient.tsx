"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Download,
  FileText,
  FolderInput,
  Mail,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { PageShell } from "@/components/layout/PageShell";
import { ConfidentialityWaiverRequiredDialog } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import type { WaiverRequiredReason } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import { WaiverSignerLockedStatus } from "@/components/students/WaiverSignerLockedStatus";
import { PaperWaiverScanPanel } from "@/components/students/PaperWaiverScanPanel";
import { ExternalDocumentSignaturePanel } from "@/components/students/ExternalDocumentSignaturePanel";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { TextScope } from "@/components/providers/TextScope";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { ensureStudentDocuments } from "@/lib/data-cache";
import { isFreeAccessMode } from "@/lib/free-access";
import {
  addStudentDocument,
  archivePaperWaiverScan,
  archiveStudentDocument,
  deleteStudentDocument,
  deleteStudentFormFill,
  getStudentDocuments,
  getStudents,
  loadStudentFormFills,
  removePaperWaiverScan,
  renameStudentDocumentFolder,
  restoreStudentDocument,
} from "@/lib/mock-store";
import {
  fileExceedsUploadLimits,
  messageForUploadError,
} from "@/lib/upload-guard";
import { canUseSupabase } from "@/lib/supabase-db";
import { isPersonalSector } from "@/lib/personal-sector";
import {
  getKnownDocumentFolders,
  rememberDocumentFolder,
} from "@/lib/student-card";
import {
  getDocumentRole,
  getDocumentSlot,
  getFolderActionButtons,
  getNormalizedFolderActionLabels,
  maybeExpandFolderSlot,
  setDocumentRole,
  setDocumentSlot,
  type DocumentSlotRole,
} from "@/lib/folder-actions";
import {
  downloadStudentDocument,
  openStudentDocument,
} from "@/lib/student-document-open";
import {
  getFormSchemaByFolder,
  studentPortfolioFillHref,
} from "@/lib/form-schemas";
import { FormParentSendStatusLine } from "@/components/students/FormParentSendStatusLine";
import { fetchStudentParentFormSendStatuses } from "@/lib/form-parent-send-status-client";
import type { StudentParentFormSendStatus } from "@/lib/form-parent-send-status";
import { isParentQuestionnaireForm, parentQuestionnaireLooksReturned } from "@/lib/parent-questionnaire-email";
import { getNextSiblingPortfolioNav } from "@/lib/portfolio-form-nav";
import {
  isConfidentialityWaiverCompleted,
  isConfidentialityWaiverExempt,
  isExtraDocumentsTarget,
  isSingleResponsiblePartyStudent,
  canAccessPortfolioDocuments,
  loadCanAccessPortfolioForm,
  officialStaffDetailsFormIdForAccess,
} from "@/lib/confidentiality-waiver-gate";
import {
  documentsAfterRefresh,
  documentsAllowedFromAccess,
  resolveFolderDocumentsAccess,
  shouldShowFolderUploadBlock,
  shouldShowWaiverDocumentsNote,
  type FolderDocumentsAccess,
} from "@/lib/folder-documents-access";
import { shouldShowPersonalBasketWaiverUploadNote } from "@/lib/waiver-signer-status";
import {
  applyPaperWaiverListAction,
  applyPaperWaiverListArchiveAction,
  paperWaiverErrorTextPath,
} from "@/lib/paper-waiver-scan";
import { nestedNavFrom, readNavBackHref } from "@/lib/navigation-back";
import { resolveStudentsListBackHref } from "@/lib/student-list-back";
import { StudentsListBackLink } from "@/components/students/StudentsListBackLink";
import {
  getPortfolioCategoriesForStatus,
  studentPortfolioHref,
} from "@/lib/student-portfolio";
import {
  isCustomDocumentFolder,
  documentBelongsToReferralProtocolFolder,
  getFormsFolderTemplateHref,
  isReferralProtocolFolder,
  isReferralProtocolGroupFolder,
  normalizeDocumentFolderLabel,
  REFERRAL_PROTOCOL_FOLDER,
  sameNormalizedFolderName,
} from "@/lib/portfolio-folder-templates";
import { formatStudentDisplayName } from "@/lib/person-name";
import { formatHebrewYear, resolveDocumentCalendarYear } from "@/lib/calendar-year";
import type { FormFillStatus, Student, StudentDocument, StudentFormFill } from "@/lib/supabase/types";
import { formFillStatusLabel } from "@/lib/form-fill-status";
import {
  formFillDeleteErrorMessage,
  formFillDeletionBlocked,
  isDeletablePortfolioFormId,
  portfolioFormFillListLabel,
} from "@/lib/form-fill-delete";
import { portfolioFormsAllowsAnotherFill } from "@/lib/portfolio-form-fills";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,application/pdf,image/*";

type FormsView = "upload" | "archive";

interface StudentFolderFormsPageClientProps {
  id: string;
  folderName: string;
  backHref: string;
  parentFolder?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isArchived(doc: StudentDocument): boolean {
  return Boolean(doc.archived_at);
}

export function StudentFolderFormsPageClient({
  id,
  folderName,
  backHref,
  parentFolder,
}: StudentFolderFormsPageClientProps) {
  const { ready, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const structuredForm = useMemo(
    () => getFormSchemaByFolder(folderName, student?.status, student?.category),
    [folderName, student?.status]
  );
  const [notFound, setNotFound] = useState(false);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [view, setView] = useState<FormsView>("upload");
  const [uploadRole, setUploadRole] = useState<DocumentSlotRole>("upload");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paperWaiverTick, setPaperWaiverTick] = useState(0);
  const [fillStatus, setFillStatus] = useState<FormFillStatus | null>(
    null
  );
  const [formFills, setFormFills] = useState<StudentFormFill[]>([]);
  /** מונע הבהוב «שליחה למייל» לפני שנטען מילוי שההורים כבר החזירו */
  const [fillsReady, setFillsReady] = useState(false);
  const allowsMultipleFills = Boolean(
    structuredForm && portfolioFormsAllowsAnotherFill(structuredForm.id)
  );
  const deletablePortfolioForm = Boolean(
    structuredForm && isDeletablePortfolioFormId(structuredForm.id)
  );
  const [fillDeleteTarget, setFillDeleteTarget] =
    useState<StudentFormFill | null>(null);
  const [fillDeleteDialogError, setFillDeleteDialogError] = useState<
    string | null
  >(null);
  const [fillBusyId, setFillBusyId] = useState<string | null>(null);

  function linkedDocumentForFill(fill: StudentFormFill) {
    return fill.document_id
      ? documents.find((doc) => doc.id === fill.document_id) ?? null
      : null;
  }

  function portfolioFillBlocked(fill: StudentFormFill): boolean {
    const doc = linkedDocumentForFill(fill);
    return formFillDeletionBlocked(fill, {
      linkedDocumentName: doc?.name,
      linkedDocumentIsPaperWaiver: doc?.is_paper_waiver,
    });
  }

  function portfolioFillListLabel(fill: StudentFormFill, index: number): string {
    if (!structuredForm) return "";
    return portfolioFormFillListLabel(structuredForm.id, {
      ordinal: formFills.length - index,
      domain: fill.data.domain,
    });
  }
  const parentQuestionnaireReturned = useMemo(
    () =>
      Boolean(
        structuredForm &&
          isParentQuestionnaireForm(structuredForm) &&
          parentQuestionnaireLooksReturned(formFills)
      ),
    [structuredForm, formFills]
  );
  const [parentSendStatus, setParentSendStatus] =
    useState<StudentParentFormSendStatus | null>(null);
  const [parentSendStatusLoading, setParentSendStatusLoading] = useState(false);

  useEffect(() => {
    if (
      !structuredForm ||
      !isParentQuestionnaireForm(structuredForm) ||
      !fillsReady
    ) {
      return;
    }
    let cancelled = false;
    setParentSendStatusLoading(true);
    void fetchStudentParentFormSendStatuses(structuredForm.id, [id]).then(
      (result) => {
        if (cancelled) return;
        setParentSendStatusLoading(false);
        if (result.ok && result.statuses?.[0]) {
          setParentSendStatus(result.statuses[0]);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [id, structuredForm, fillsReady, formFills]);
  const [folderDialog, setFolderDialog] = useState<{
    mode: "move" | "restore";
    doc: StudentDocument;
  } | null>(null);
  const [targetFolder, setTargetFolder] = useState(folderName);
  const [folderBusy, setFolderBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const [waiverReason, setWaiverReason] =
    useState<WaiverRequiredReason>("waiver");
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [documentsAccess, setDocumentsAccess] =
    useState<FolderDocumentsAccess>("checking");
  const documentsAccessRef = useRef<FolderDocumentsAccess>("checking");
  const documentsAllowed = documentsAllowedFromAccess(documentsAccess);

  function setDocumentsAccessState(next: FolderDocumentsAccess) {
    documentsAccessRef.current = next;
    setDocumentsAccess(next);
  }

  const destinationFolders = useMemo(() => {
    const set = new Set<string>();
    for (const category of getPortfolioCategoriesForStatus(student?.status)) {
      set.add(category.folder);
      for (const label of getNormalizedFolderActionLabels(
        category.folder,
        student?.status
      )) {
        set.add(label);
      }
    }
    for (const known of getKnownDocumentFolders(id, student?.status)) {
      set.add(known);
    }
    for (const doc of documents) {
      if (doc.folder?.trim()) {
        set.add(normalizeDocumentFolderLabel(doc.folder.trim(), student?.status));
      }
    }
    set.add(normalizeDocumentFolderLabel(folderName, student?.status));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [id, documents, folderName, student?.status]);

  const fillFrom = nestedNavFrom(pathname, backHref);

  const formsTemplateHref = useMemo(
    () =>
      getFormsFolderTemplateHref(
        folderName,
        student?.status,
        student?.category
      ),
    [folderName, student?.status, student?.category]
  );

  const nextSibling = useMemo(() => {
    if (!student) return null;
    return getNextSiblingPortfolioNav({
      studentId: id,
      currentLabel: folderName,
      status: student.status,
      category: student.category,
      preferredParent: structuredForm?.categoryFolder,
      backHref: fillFrom,
      preferFill: true,
    });
  }, [
    id,
    folderName,
    student,
    structuredForm?.categoryFolder,
    fillFrom,
  ]);

  const isWaiverFolder = isConfidentialityWaiverExempt({
    targetLabel: folderName,
  });
  const canGoToNextAfterWaiver =
    isFreeAccessMode() ||
    !isWaiverFolder ||
    isConfidentialityWaiverCompleted(id);
  /**
   * TZ-30: הודעת חסימה דינמית — אחראי יחיד דורש חתימה אחת, אחרת שתיים.
   */
  const waiverNextFormBlockedMessage = useMemo(() => {
    const isSingleParty = isSingleResponsiblePartyStudent(id);
    const defaultMsg = isSingleParty
      ? "לא ניתן לעבור לטופס הבא — עדיין לא התקבלה חתימה על ויתור הסודיות."
      : "לא ניתן לעבור לטופס הבא — שני ההורים עדיין לא חתמו על ויתור הסודיות.";
    return getTextByPath(texts, "studentPortfolio.waiverNextFormBlocked") || defaultMsg;
  }, [id, texts]);

  function showWaiverNextFormBlocked() {
    setMessage(null);
    setError(waiverNextFormBlockedMessage);
    setWaiverReason("both-parents");
    setWaiverDialogOpen(true);
  }

  async function unlockAfterPaperWaiver() {
    setWaiverDialogOpen(false);
    setAccessBlocked(false);
    setPaperWaiverTick((tick) => tick + 1);
    const staffDetailsFormId = officialStaffDetailsFormIdForAccess({
      targetLabel: folderName,
    });
    const docsAccess = resolveFolderDocumentsAccess(
      canAccessPortfolioDocuments(id, {
        targetLabel: folderName,
        formId: staffDetailsFormId,
        parentFolder,
      })
    );
    setDocumentsAccessState(docsAccess);
    await refresh({ documentsAccess: docsAccess });
  }

  async function syncFolderAccessAfterPaperWaiverChange() {
    setPaperWaiverTick((tick) => tick + 1);
    const staffDetailsFormId = officialStaffDetailsFormIdForAccess({
      targetLabel: folderName,
    });
    const allowed = await loadCanAccessPortfolioForm(id, {
      targetLabel: folderName,
      formId: staffDetailsFormId,
      parentFolder,
    });
    if (!allowed) {
      setAccessBlocked(true);
      setDocumentsAccessState("denied");
      setDocuments([]);
      setWaiverReason(
        isExtraDocumentsTarget({
          targetLabel: folderName,
          formId: structuredForm?.id,
        })
          ? "both-parents"
          : "waiver"
      );
      setWaiverDialogOpen(true);
      return;
    }
    setAccessBlocked(false);
    const docsAccess = resolveFolderDocumentsAccess(
      canAccessPortfolioDocuments(id, {
        targetLabel: folderName,
        formId: staffDetailsFormId,
        parentFolder,
      })
    );
    setDocumentsAccessState(docsAccess);
    await refresh({ documentsAccess: docsAccess });
  }

  async function refresh(opts?: { documentsAccess?: FolderDocumentsAccess }) {
    const access = opts?.documentsAccess ?? documentsAccessRef.current;
    if (access === "allowed" && canUseSupabase()) {
      await ensureStudentDocuments(id);
    }
    setDocuments((current) =>
      documentsAfterRefresh(
        access,
        current,
        access === "allowed" ? getStudentDocuments(id) : current
      )
    );
    if (structuredForm) {
      // תמיד מהשרת — כדי שמילוי מקישור (צוות/הורים) יופיע בלי ריענון ידני
      const allFills = await loadStudentFormFills(id);
      const fills = allFills
        .filter((fill) => fill.form_id === structuredForm.id)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      setFormFills(fills);
      setFillStatus(fills[0]?.status ?? null);
    } else {
      setFormFills([]);
      setFillStatus(null);
    }
    setFillsReady(true);
  }

  useEffect(() => {
    setFillsReady(false);
    setDocumentsAccessState("checking");
  }, [id, folderName, structuredForm?.id]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const found = getStudents().find((s) => s.id === id);
    if (!found) {
      setNotFound(true);
      return;
    }
    setStudent(found);
    rememberDocumentFolder(id, folderName);

    void (async () => {
      const staffDetailsFormId = officialStaffDetailsFormIdForAccess({
        targetLabel: folderName,
      });
      const allowed = await loadCanAccessPortfolioForm(id, {
        targetLabel: folderName,
        formId: staffDetailsFormId,
        parentFolder,
      });
      if (cancelled) return;
      if (!allowed) {
        setAccessBlocked(true);
        setDocumentsAccessState("denied");
        setDocuments([]);
        setWaiverReason(
          isExtraDocumentsTarget({
            targetLabel: folderName,
            formId: structuredForm?.id,
          })
            ? "both-parents"
            : "waiver"
        );
        setWaiverDialogOpen(true);
        setFillsReady(true);
        return;
      }

      setAccessBlocked(false);
      const docsAccess = resolveFolderDocumentsAccess(
        canAccessPortfolioDocuments(id, {
          targetLabel: folderName,
          formId: staffDetailsFormId,
          parentFolder,
        })
      );
      setDocumentsAccessState(docsAccess);
      await refresh({ documentsAccess: docsAccess });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready, folderName, structuredForm?.id]);

  useEffect(() => {
    if (!ready || accessBlocked || !structuredForm) return;

    function onFocus() {
      void refresh();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessBlocked, structuredForm?.id, id]);

  function belongsToFolder(doc: StudentDocument): boolean {
    const docFolder = doc.folder || "כללי";
    const slot = getDocumentSlot(doc.id);
    if (isReferralProtocolFolder(folderName)) {
      return documentBelongsToReferralProtocolFolder({
        docFolder,
        docSlot: slot,
        folderName,
        status: student?.status,
      });
    }
    if (sameNormalizedFolderName(docFolder, folderName, student?.status)) {
      return true;
    }
    return Boolean(
      slot && sameNormalizedFolderName(slot, folderName, student?.status)
    );
  }

  const folderDocs = useMemo(
    () => documents.filter(belongsToFolder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, folderName, student?.status]
  );

  const listDocs = useMemo(() => {
    if (documentsAccess === "denied") return [];
    if (view === "archive") {
      return folderDocs.filter((doc) => isArchived(doc));
    }
    // במצבי העלאה — מציגים את כל הטפסים הפעילים בתיקייה
    return folderDocs.filter((doc) => !isArchived(doc));
  }, [folderDocs, view, documentsAccess]);

  function docYear(doc: StudentDocument): number {
    return resolveDocumentCalendarYear({
      calendar_year: doc.calendar_year,
      uploaded_at: doc.uploaded_at,
      archived_at: doc.archived_at,
      fallbackYear: student?.calendar_year ?? null,
    });
  }

  /** מסמכי הארכיון מקובצים לפי שנה קלנדרית (מהחדשה לישנה) */
  const archiveByYear = useMemo(() => {
    const groups = new Map<number, StudentDocument[]>();
    for (const doc of listDocs) {
      const year = docYear(doc);
      const bucket = groups.get(year) ?? [];
      bucket.push(doc);
      groups.set(year, bucket);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listDocs, student?.calendar_year]);

  const [archiveYearFilter, setArchiveYearFilter] = useState<number | "all">(
    "all"
  );

  const visibleArchiveGroups = useMemo(() => {
    if (archiveYearFilter === "all") return archiveByYear;
    return archiveByYear.filter(([year]) => year === archiveYearFilter);
  }, [archiveByYear, archiveYearFilter]);

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      let added = 0;
      for (const file of Array.from(files)) {
        if (fileExceedsUploadLimits(file)) {
          setError(getTextByPath(texts, "studentDocuments.fileTooLarge"));
          continue;
        }
        const saveFolder = isReferralProtocolGroupFolder(folderName)
          ? REFERRAL_PROTOCOL_FOLDER
          : normalizeDocumentFolderLabel(folderName, student?.status);
        const doc = await addStudentDocument(id, file, saveFolder);
        rememberDocumentFolder(id, saveFolder);
        setDocumentRole(doc.id, uploadRole);
        setDocumentSlot(doc.id, saveFolder);
        added += 1;
      }
      if (added > 0) {
        const extraParent = "מסמכים נוספים";
        const extraSlots = getFolderActionButtons(
          id,
          extraParent,
          student?.status
        );
        if (
          isCustomDocumentFolder(folderName) ||
          extraSlots.includes(folderName)
        ) {
          maybeExpandFolderSlot(
            id,
            extraParent,
            folderName,
            student?.status
          );
        }
        await refresh();
        setView("upload");

        const next = getNextSiblingPortfolioNav({
          studentId: id,
          currentLabel: folderName,
          status: student?.status,
          category: student?.category,
          preferredParent: structuredForm?.categoryFolder,
          backHref: fillFrom,
          preferFill: false,
        });
        const canAdvance =
          !isConfidentialityWaiverExempt({ targetLabel: folderName }) ||
          isConfidentialityWaiverCompleted(id);
        if (next && canAdvance) {
          setMessage(
            next.kind === "folder"
              ? `הקובץ הועלה — מעביר לתיקייה הבאה: ${next.label}`
              : `הקובץ הועלה — מעביר לטופס הבא: ${next.label}`
          );
          window.setTimeout(() => {
            router.push(next.href);
          }, 500);
        } else if (next && !canAdvance) {
          setMessage(
            "הקובץ הועלה — לא ניתן לעבור לטופס הבא כי שני ההורים עדיין לא חתמו"
          );
        }
      }
    } catch (error) {
      setError(
        messageForUploadError(
          error,
          getTextByPath(texts, "studentDocuments.fileTooLarge")
        )
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleArchive(documentId: string) {
    const doc = documents.find((item) => item.id === documentId);
    setBusyId(documentId);
    setError(null);
    setMessage(null);
    try {
      const result = await applyPaperWaiverListArchiveAction({
        doc,
        documentId,
        archiveActive: archivePaperWaiverScan,
        regular: archiveStudentDocument,
      });
      if (result === "blocked") {
        setError(
          getTextByPath(texts, "studentPortfolio.paperWaiverArchiveDeleteBlocked")
        );
        return;
      }
      if (result === "archived-paper") {
        await syncFolderAccessAfterPaperWaiverChange();
      } else {
        await refresh();
      }
      setView("archive");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const paperPath = paperWaiverErrorTextPath(code);
      setError(
        paperPath
          ? getTextByPath(texts, paperPath)
          : "העברה לארכיון נכשלה — נסו שוב"
      );
    } finally {
      setBusyId(null);
    }
  }

  function openRestoreDialog(doc: StudentDocument) {
    setTargetFolder(doc.folder?.trim() || folderName);
    setFolderDialog({ mode: "restore", doc });
  }

  function openMoveDialog(doc: StudentDocument) {
    setTargetFolder(doc.folder?.trim() || folderName);
    setFolderDialog({ mode: "move", doc });
  }

  async function confirmFolderDialog() {
    if (!folderDialog) return;
    const nextFolder = targetFolder.trim() || folderName;
    setFolderBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (folderDialog.mode === "restore") {
        await restoreStudentDocument(folderDialog.doc.id);
      }
      if (nextFolder !== (folderDialog.doc.folder || "כללי")) {
        await renameStudentDocumentFolder(folderDialog.doc.id, nextFolder);
        setDocumentSlot(folderDialog.doc.id, nextFolder);
        rememberDocumentFolder(id, nextFolder);
      }
      await refresh();
      setFolderDialog(null);
      setView("upload");
      setMessage(
        getTextByPath(texts, "studentDocuments.moveSuccess") ||
          "המסמך הועבר לתיקייה שנבחרה"
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const paperPath = paperWaiverErrorTextPath(code);
      setError(
        paperPath
          ? getTextByPath(texts, paperPath)
          : folderDialog.mode === "restore"
            ? "שחזור מהארכיון נכשל — נסו שוב"
            : "העברת המסמך נכשלה — נסו שוב"
      );
    } finally {
      setFolderBusy(false);
    }
  }

  async function confirmDeleteFormFill() {
    if (!fillDeleteTarget) return;
    const fillId = fillDeleteTarget.id;
    setFillBusyId(fillId);
    setFillDeleteDialogError(null);
    try {
      await deleteStudentFormFill(fillId);
      setFillDeleteTarget(null);
      await refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setFillDeleteDialogError(formFillDeleteErrorMessage(code));
    } finally {
      setFillBusyId(null);
    }
  }

  async function handleDelete(documentId: string) {
    const doc = documents.find((item) => item.id === documentId);
    setBusyId(documentId);
    setError(null);
    try {
      const result = await applyPaperWaiverListAction({
        doc,
        documentId,
        removeActive: removePaperWaiverScan,
        regular: deleteStudentDocument,
      });
      if (result === "blocked") {
        setError(
          getTextByPath(texts, "studentPortfolio.paperWaiverArchiveDeleteBlocked")
        );
        return;
      }
      if (result === "removed-paper") {
        await syncFolderAccessAfterPaperWaiverChange();
      } else {
        await refresh();
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const paperPath = paperWaiverErrorTextPath(code);
      setError(
        paperPath
          ? getTextByPath(texts, paperPath)
          : "מחיקת המסמך נכשלה — נסו שוב"
      );
    } finally {
      setBusyId(null);
    }
  }

  function selectIndependentUpload() {
    if (!documentsAllowed) {
      setWaiverReason("waiver");
      setWaiverDialogOpen(true);
      return;
    }
    setUploadRole("upload");
    setView("upload");
    requestAnimationFrame(() => inputRef.current?.click());
  }

  function renderDocRow(doc: StudentDocument) {
    return (
      <li
        key={doc.id}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-start transition hover:opacity-80"
          onClick={() => void openStudentDocument(doc)}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-ink">
              {doc.name}
            </div>
            <div className="text-xs text-pink/80">
              {formatFileSize(doc.size)}
              {doc.folder ? ` · ${doc.folder}` : ""}
              {` · ${
                getDocumentRole(doc.id) === "fill"
                  ? getTextByPath(texts, "studentPortfolio.fillDocument") ||
                    "מסמך למילוי"
                  : getTextByPath(
                      texts,
                      "studentPortfolio.independentUpload"
                    ) || "העלאה עצמאית"
              }`}
            </div>
          </div>
        </button>

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void openStudentDocument(doc);
            }}
          >
            <FileText className="h-4 w-4" />
            {getTextByPath(texts, "studentDocuments.openButton") || "פתיחה"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void downloadStudentDocument(doc);
            }}
          >
            <Download className="h-4 w-4" />
            {getTextByPath(texts, "studentDocuments.downloadButton") || "הורדה"}
          </Button>
          {view === "archive" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={guestDemo || busyId === doc.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openRestoreDialog(doc);
              }}
            >
              <ArchiveRestore className="h-4 w-4" />
              {getTextByPath(texts, "studentDocuments.restoreButton") ||
                "שחזור"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={guestDemo || busyId === doc.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMoveDialog(doc);
                }}
              >
                <FolderInput className="h-4 w-4" />
                {getTextByPath(texts, "studentDocuments.moveToFolderButton") ||
                  "העברה לתיקייה"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={guestDemo || busyId === doc.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleArchive(doc.id);
                }}
              >
                <Archive className="h-4 w-4" />
                {getTextByPath(texts, "studentDocuments.archiveButton") ||
                  "לארכיון"}
              </Button>
            </>
          )}
          {view === "archive" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={guestDemo || busyId === doc.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openMoveDialog(doc);
              }}
            >
              <FolderInput className="h-4 w-4" />
              {getTextByPath(texts, "studentDocuments.moveToFolderButton") ||
                "העברה לתיקייה"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={guestDemo || busyId === doc.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleDelete(doc.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
            {getTextByPath(texts, "studentDocuments.deleteButton") ||
              "מחיקת מסמך"}
          </Button>
        </div>
      </li>
    );
  }

  if (notFound) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center">
          <EditableText
            path="common.notFound"
            as="p"
            block
            className="mb-4 text-pink"
          />
          <Button asChild>
            <Link href={studentPortfolioHref(id)}>
              <EditableText path="studentPortfolio.backToPortfolio" />
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!student) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="common.loading" />
        </div>
      </PageShell>
    );
  }

  if (accessBlocked) {
    return (
      <PageShell>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <ArrowRight className="h-4 w-4" />
              <EditableText path="studentPortfolio.backToFolder" />
            </Link>
          </Button>
          <StudentsListBackLink
            href={resolveStudentsListBackHref({
              from: backHref,
              stored: readNavBackHref(),
              student,
            })}
            hideIf={backHref}
            student={student}
          />
        </div>
        <div className="menu-box p-8 text-center">
          <EditableText
            path={
              waiverReason === "both-parents"
                ? "studentPortfolio.waiverBothParentsRequiredTitle"
                : "studentPortfolio.waiverRequiredTitle"
            }
            as="p"
            block
            className="mb-2 text-xl font-bold text-ink"
          />
          <EditableText
            path={
              waiverReason === "both-parents"
                ? "studentPortfolio.waiverBothParentsRequiredDescription"
                : "studentPortfolio.waiverRequiredDescription"
            }
            as="p"
            block
            className="mb-4 text-sm text-pink"
          />
          <WaiverSignerLockedStatus studentId={id} />
        </div>
        <ConfidentialityWaiverRequiredDialog
          open={waiverDialogOpen}
          onOpenChange={setWaiverDialogOpen}
          studentId={id}
          reason={waiverReason}
          onUnlocked={() => {
            void unlockAfterPaperWaiver();
          }}
        />
      </PageShell>
    );
  }

  const content = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path="studentPortfolio.backToFolder" />
          </Link>
        </Button>
        <StudentsListBackLink
          href={resolveStudentsListBackHref({
            from: backHref,
            stored: readNavBackHref(),
            student,
          })}
          hideIf={backHref}
          student={student}
        />
      </div>

      <h1 className="mb-1 text-center text-2xl font-bold text-ink sm:text-3xl">
        {folderName}
      </h1>
      <p className="mb-4 text-center text-sm font-bold text-pink">
        {formatStudentDisplayName(student.full_name)}
      </p>

      <div className="menu-box flex flex-col gap-4 p-4">
        {guestDemo ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
            כניסה חופשית: אפשר לפתוח את הטופס לדוגמה, בלי העלאת קבצים או שינויים
            בארכיון.
          </div>
        ) : null}
        <EditableText
          path="studentPortfolio.formsPageSubtitle"
          as="p"
          block
          className="text-center text-sm text-pink"
        />

        {shouldShowPersonalBasketWaiverUploadNote({
          folderName,
          studentStatus: student?.status,
        }) ? (
          <p className="text-center text-sm font-medium text-pink">
            <EditableText path="studentPortfolio.waiverUploadDoesNotUnlock" />
          </p>
        ) : null}

        {isWaiverFolder && !guestDemo ? (
          <PaperWaiverScanPanel
            studentId={id}
            folderName={folderName}
            refreshKey={paperWaiverTick}
            onChanged={() => {
              void refresh();
            }}
          />
        ) : null}

        {structuredForm && (
          <div className="flex flex-col items-center gap-3">
            {isParentQuestionnaireForm(structuredForm) && !fillsReady ? (
              <Button size="lg" disabled>
                <ClipboardList className="h-5 w-5" />
                טוען...
              </Button>
            ) : (
            <Button asChild size="lg">
              <Link
                href={studentPortfolioFillHref(
                  id,
                  structuredForm.id,
                  fillFrom,
                  formFills[0]
                    ? { fillId: formFills[0].id, parentFolder }
                    : { parentFolder }
                )}
              >
                {isParentQuestionnaireForm(structuredForm) &&
                !parentQuestionnaireReturned ? (
                  <Mail className="h-5 w-5" />
                ) : (
                  <ClipboardList className="h-5 w-5" />
                )}
                {isParentQuestionnaireForm(structuredForm) ? (
                  parentQuestionnaireReturned ? (
                    <EditableText
                      path={
                        structuredForm.id === "parent-questionnaire-tla"
                          ? "studentPortfolio.openParentQuestionnaireTlaReturned"
                          : structuredForm.id === "parent-questionnaire"
                            ? "studentPortfolio.openParentQuestionnaireReturned"
                            : "studentPortfolio.openFillForm"
                      }
                    />
                  ) : (
                    <EditableText path="studentPortfolio.sendParentQuestionnaire" />
                  )
                ) : allowsMultipleFills && formFills.length > 0 ? (
                  "פתיחת תח״י אחרונה"
                ) : (
                  <EditableText path="studentPortfolio.openFillForm" />
                )}
              </Link>
            </Button>
            )}

            {allowsMultipleFills ? (
              <Button asChild size="lg" variant="outline">
                <Link
                  href={studentPortfolioFillHref(
                    id,
                    structuredForm.id,
                    fillFrom,
                    { createNew: true, parentFolder }
                  )}
                >
                  <Plus className="h-5 w-5" />
                  הוספת תח״י נוספת
                </Link>
              </Button>
            ) : null}

            {deletablePortfolioForm && formFills.length > 0 ? (
              <div className="w-full max-w-xl space-y-2">
                {formFills.map((fill, index) => {
                  const domain = (fill.data.domain ?? "").trim();
                  const updated = new Date(fill.updated_at).toLocaleDateString(
                    "he-IL"
                  );
                  const fillLabel = portfolioFillListLabel(fill, index);
                  const deleteBlocked = portfolioFillBlocked(fill);
                  return (
                    <div
                      key={fill.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm"
                    >
                      <Link
                        href={studentPortfolioFillHref(
                          id,
                          structuredForm.id,
                          fillFrom,
                          { fillId: fill.id, parentFolder }
                        )}
                        className="flex min-w-0 flex-1 flex-col gap-0.5 hover:opacity-80"
                      >
                        <span className="font-bold text-ink">
                          {fillLabel}
                          {domain ? ` · ${domain}` : ""}
                        </span>
                        <span className="text-xs text-pink">
                          {formFillStatusLabel(fill.status)} · {updated}
                        </span>
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={
                          guestDemo || fillBusyId === fill.id || deleteBlocked
                        }
                        aria-label="מחיקת תוכנית"
                        onClick={() => {
                          setFillDeleteDialogError(null);
                          setFillDeleteTarget(fill);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : isParentQuestionnaireForm(structuredForm) ? (
              <FormParentSendStatusLine
                status={parentSendStatus}
                loading={parentSendStatusLoading}
              />
            ) : fillStatus ? (
              <p className="text-xs font-medium text-pink">
                {fillStatus === "completed"
                  ? "יש מילוי שמור (הושלם)"
                  : fillStatus === "saved"
                    ? "יש מילוי שמור (נשמר)"
                    : "יש טיוטה שמורה"}
              </p>
            ) : null}
          </div>
        )}

        {shouldShowWaiverDocumentsNote(documentsAccess) ? (
          <p className="text-center text-sm font-medium text-pink">
            מסמכים שהועלו בתיקייה זו דורשים ויתור סודיות חתום
          </p>
        ) : null}

        {shouldShowFolderUploadBlock(documentsAccess) ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="lg"
              variant={view === "upload" ? "default" : "outline"}
              className="w-full"
              disabled={guestDemo || uploading}
              onClick={selectIndependentUpload}
            >
              <Upload className="h-5 w-5" />
              {uploading && uploadRole === "upload"
                ? getTextByPath(texts, "studentDocuments.uploading") || "מעלה..."
                : getTextByPath(texts, "studentPortfolio.independentUpload") ||
                  "העלאה עצמאית"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className={cn("w-full", view === "archive" && "ring-2 ring-red-300")}
              disabled={guestDemo}
              onClick={() => {
                setError(null);
                setView("archive");
              }}
            >
              <Archive className="h-5 w-5" />
              {getTextByPath(texts, "studentDocuments.archiveTitle") || "ארכיון"}
            </Button>
          </div>
        ) : null}

        {formsTemplateHref ? (
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={formsTemplateHref} download>
              <Download className="h-5 w-5" />
              הורדת תבנית ריקה
            </a>
          </Button>
        ) : null}

        {(folderName.includes('תל"א') ||
          folderName.toLowerCase().includes("tla")) &&
        !guestDemo &&
        documentsAllowed ? (
          <ExternalDocumentSignaturePanel
            studentId={id}
            studentEmail={student?.email}
            documents={documents}
            folderName={folderName}
            className="mt-2"
          />
        ) : null}

        {nextSibling && canGoToNextAfterWaiver ? (
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href={nextSibling.href}>
              <EditableText
                path={
                  nextSibling.kind === "folder"
                    ? "studentPortfolio.goToNextFolder"
                    : "studentPortfolio.goToNextForm"
                }
              />
              <span className="font-bold">: {nextSibling.label}</span>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        ) : nextSibling && isWaiverFolder ? (
          <div className="flex w-full flex-col gap-2">
            <p className="text-center text-sm font-medium text-destructive">
              {waiverNextFormBlockedMessage}
            </p>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full"
              onClick={showWaiverNextFormBlocked}
            >
              <EditableText
                path={
                  nextSibling.kind === "folder"
                    ? "studentPortfolio.goToNextFolder"
                    : "studentPortfolio.goToNextForm"
                }
              />
              <span className="font-bold">: {nextSibling.label}</span>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />

        {view !== "archive" &&
        shouldShowFolderUploadBlock(documentsAccess) ? (
          <EditableText
            path="studentDocuments.uploadHint"
            as="p"
            block
            className="text-center text-xs text-pink"
          />
        ) : null}

        {error && (
          <p className="text-center text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="text-center text-sm font-medium text-brand-700">
            {message}
          </p>
        )}

        <div className="border-t border-border pt-3">
          <h2 className="mb-3 text-center text-base font-bold text-ink">
            {view === "archive"
              ? getTextByPath(texts, "studentDocuments.archiveByYearTitle") ||
                "ארכיון לפי שנים"
              : getTextByPath(texts, "studentPortfolio.allFormsTitle") ||
                "כל הטפסים"}
          </h2>

          {view === "archive" && archiveByYear.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setArchiveYearFilter("all")}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-bold transition-colors",
                  archiveYearFilter === "all"
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
                )}
              >
                הכל
              </button>
              {archiveByYear.map(([year, docs]) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setArchiveYearFilter(year)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-bold transition-colors",
                    archiveYearFilter === year
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
                  )}
                >
                  {formatHebrewYear(year)} ({docs.length})
                </button>
              ))}
            </div>
          )}

          {listDocs.length === 0 ? (
            <EditableText
              path={
                view === "archive"
                  ? "studentDocuments.archiveEmpty"
                  : "studentPortfolio.formsEmpty"
              }
              as="p"
              block
              className="py-6 text-center text-sm text-pink"
            />
          ) : view === "archive" ? (
            <div className="flex flex-col gap-5">
              {visibleArchiveGroups.map(([year, docs]) => (
                <div key={year}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-700">
                      {getTextByPath(
                        texts,
                        "studentDocuments.archiveYearLabel"
                      ) || "שנה"}{" "}
                      {formatHebrewYear(year)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-pink/70">
                      {docs.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {docs.map((doc) => renderDocRow(doc))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {listDocs.map((doc) => renderDocRow(doc))}
            </ul>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(folderDialog)}
        onOpenChange={(open) => {
          if (!open) setFolderDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === "restore"
                ? getTextByPath(texts, "studentDocuments.restoreToFolderTitle") ||
                  "שחזור לתיקייה"
                : getTextByPath(texts, "studentDocuments.moveToFolderTitle") ||
                  "העברת מסמך לתיקייה אחרת"}
            </DialogTitle>
            <DialogDescription>
              {folderDialog?.doc.name}
              {folderDialog?.doc.folder
                ? ` · ${getTextByPath(texts, "studentDocuments.currentFolderLabel") || "תיקייה נוכחית"}: ${folderDialog.doc.folder}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-2 text-sm font-bold text-ink">
            בחרו תיקייה יעד
            <select
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="h-10 w-full rounded-md border-2 border-brand-200 bg-white px-3 text-sm font-medium focus-visible:border-brand-500 focus-visible:outline-none"
            >
              {destinationFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={folderBusy}
              onClick={() => setFolderDialog(null)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              disabled={folderBusy || !targetFolder.trim()}
              onClick={() => void confirmFolderDialog()}
            >
              <FolderInput className="h-4 w-4" />
              {folderDialog?.mode === "restore"
                ? getTextByPath(
                    texts,
                    "studentDocuments.restoreToFolderConfirm"
                  ) || "שחזור לתיקייה"
                : getTextByPath(texts, "studentDocuments.moveToFolderConfirm") ||
                  "העברה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(fillDeleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setFillDeleteTarget(null);
            setFillDeleteDialogError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת תוכנית חינוכית</DialogTitle>
            <DialogDescription>
              {fillDeleteTarget && structuredForm
                ? `למחוק את ${portfolioFillListLabel(
                    fillDeleteTarget,
                    formFills.findIndex((row) => row.id === fillDeleteTarget.id)
                  )}? פעולה זו אינה ניתנת לביטול. מסמך חתום שנשמר בארכיון לא
                  יימחק.`
                : "למחוק את המילוי מהמערכת? פעולה זו אינה ניתנת לביטול."}
            </DialogDescription>
          </DialogHeader>
          {fillDeleteDialogError ? (
            <p className="text-center text-sm font-medium text-destructive">
              {fillDeleteDialogError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(fillBusyId)}
              onClick={() => setFillDeleteTarget(null)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(fillBusyId)}
              onClick={() => void confirmDeleteFormFill()}
            >
              <Trash2 className="h-4 w-4" />
              מחיקה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfidentialityWaiverRequiredDialog
        open={waiverDialogOpen}
        onOpenChange={setWaiverDialogOpen}
        studentId={id}
        reason={waiverReason}
        onUnlocked={() => {
          void unlockAfterPaperWaiver();
        }}
      />
    </>
  );

  return (
    <PageShell>
      {isPersonalSector(student.category) ? (
        <TextScope sector={student.category}>{content}</TextScope>
      ) : (
        content
      )}
    </PageShell>
  );
}
