"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Download,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableText } from "@/components/editable/EditableText";
import { ConfidentialityWaiverRequiredDialog } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import {
  getStudentDocuments,
  getStudentFormFills,
  getStudents,
} from "@/lib/mock-store";
import {
  addFolderActionButton,
  canRenameFolderActionButtons,
  getDocumentSlot,
  getFolderActionButtons,
  maybeExpandFolderSlot,
  removeFolderActionButton,
  renameFolderActionButton,
  setDocumentSlot,
} from "@/lib/folder-actions";
import {
  getFolderButtonTemplateHref,
  getPortfolioFolderButtonDefs,
  isCustomDocumentFolder,
  isExpandableFolderButton,
  isGroupFolderButton,
  isMultiAddFolderButton,
  isReferralProtocolGroupFolder,
  nextExpandableSlotLabel,
} from "@/lib/portfolio-folder-templates";
import type { StudentStatus } from "@/lib/supabase/types";
import {
  EXTRA_DOCUMENTS_FOLDER,
  isExtraDocumentsTarget,
  loadCanAccessPortfolioForm,
  officialStaffDetailsFormIdForAccess,
} from "@/lib/confidentiality-waiver-gate";
import type { WaiverRequiredReason } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import {
  getFormSchemaByFolder,
  studentPortfolioFillHref,
} from "@/lib/form-schemas";
import { getNextSiblingPortfolioNav } from "@/lib/portfolio-form-nav";
import { portfolioStructuredFillHref } from "@/lib/portfolio-form-fills";
import {
  isSpecialEdPortfolioStatus,
  studentPortfolioFolderHref,
  studentPortfolioFormsHref,
} from "@/lib/student-portfolio";
import {
  hrefWithSearch,
  isClassCurriculumHref,
  nestedNavFrom,
  parseSafeFromParam,
  rememberNavBackHref,
} from "@/lib/navigation-back";
import { printDocumentsInFolders } from "@/lib/student-document-print";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { FolderDocumentUploadPanel } from "@/components/students/FolderDocumentUploadPanel";
import { StudentFolderFilledFormsList } from "@/components/students/StudentFolderFilledFormsList";

interface StudentFolderWorkspaceProps {
  studentId: string;
  folderName: string;
}

export function StudentFolderWorkspace({
  studentId,
  folderName,
}: StudentFolderWorkspaceProps) {
  const { texts } = useSiteText();
  const { guestDemo } = useDataStore();
  const router = useRouter();
  const pathname = usePathname();
  const locationHref =
    typeof window !== "undefined"
      ? hrefWithSearch(pathname, window.location.search)
      : pathname;
  // בתל"כ — תמיד לחזור למסך תל"כ (כולל ?name=), גם אם ב-URL יש ?from= לדף הכיתה
  const navFrom = isClassCurriculumHref(pathname)
    ? locationHref
    : (typeof window !== "undefined"
        ? parseSafeFromParam(
            new URLSearchParams(window.location.search).get("from")
          )
        : null) ?? pathname;

  useEffect(() => {
    if (isClassCurriculumHref(pathname)) {
      rememberNavBackHref(
        hrefWithSearch(pathname, window.location.search)
      );
    }
  }, [pathname]);
  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(
    () => getStudents().find((s) => s.id === studentId)?.status ?? null
  );
  const [studentCategory, setStudentCategory] = useState<string | null>(
    () => getStudents().find((s) => s.id === studentId)?.category ?? null
  );
  const [actions, setActions] = useState<string[]>(() =>
    getFolderActionButtons(studentId, folderName, studentStatus)
  );
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const [waiverReason, setWaiverReason] =
    useState<WaiverRequiredReason>("waiver");
  const [printError, setPrintError] = useState<string | null>(null);
  const isCustomFolder = isCustomDocumentFolder(folderName);
  const lockStructure = isSpecialEdPortfolioStatus(studentStatus);
  const lockTitles = !canRenameFolderActionButtons(folderName);
  const hasExpandableSlot = actions.some((label) =>
    isExpandableFolderButton(folderName, label, studentStatus)
  );
  const fillFrom = nestedNavFrom(pathname, navFrom);
  const nextSibling = useMemo(
    () =>
      getNextSiblingPortfolioNav({
        studentId,
        currentLabel: folderName,
        status: studentStatus,
        category: studentCategory,
        backHref: fillFrom,
        preferFill: true,
      }),
    [studentId, folderName, studentStatus, studentCategory, fillFrom]
  );

  function refresh() {
    setActions(getFolderActionButtons(studentId, folderName, studentStatus));
  }

  function loadFromStore() {
    const found = getStudents().find((s) => s.id === studentId);
    const nextStatus = found?.status ?? null;
    setStudentStatus(nextStatus);
    setStudentCategory(found?.category ?? null);
    setActions(getFolderActionButtons(studentId, folderName, nextStatus));
  }

  useEffect(() => {
    loadFromStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, folderName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (folderName.trim() !== EXTRA_DOCUMENTS_FOLDER) return;
      const allowed = await loadCanAccessPortfolioForm(studentId, {
        targetLabel: EXTRA_DOCUMENTS_FOLDER,
      });
      if (cancelled || allowed) return;
      setWaiverReason("both-parents");
      setWaiverDialogOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, folderName]);

  async function tryOpenTarget(
    label: string,
    formId?: string
  ): Promise<boolean> {
    const staffDetailsFormId = officialStaffDetailsFormIdForAccess({
      targetLabel: label,
      formId,
    });
    const allowed = await loadCanAccessPortfolioForm(studentId, {
      targetLabel: label,
      formId: staffDetailsFormId ?? formId,
      parentFolder: folderName,
    });
    if (allowed) {
      return true;
    }
    setWaiverReason(
      isExtraDocumentsTarget({ targetLabel: label })
        ? "both-parents"
        : "waiver"
    );
    setWaiverDialogOpen(true);
    return false;
  }

  async function openFormsPage(label: string) {
    if (!(await tryOpenTarget(label))) return;
    if (isGroupFolderButton(folderName, label, studentStatus)) {
      router.push(
        studentPortfolioFolderHref(studentId, label, studentStatus, navFrom)
      );
      return;
    }
    router.push(studentPortfolioFormsHref(studentId, label, navFrom, folderName));
  }

  function hrefForAction(label: string): string {
    if (isGroupFolderButton(folderName, label, studentStatus)) {
      return studentPortfolioFolderHref(
        studentId,
        label,
        studentStatus,
        navFrom
      );
    }
    return studentPortfolioFormsHref(studentId, label, navFrom, folderName);
  }

  function handleAddButton() {
    let label: string | undefined;
    const current = getFolderActionButtons(studentId, folderName, studentStatus);
    if (lockStructure && hasExpandableSlot) {
      const expandableBase = getPortfolioFolderButtonDefs(
        folderName,
        studentStatus
      ).find((d) => d.kind === "expandable")?.label;
      if (expandableBase) {
        label = nextExpandableSlotLabel(expandableBase, current);
      }
    } else if (
      current.some((item) =>
        isMultiAddFolderButton(folderName, item, studentStatus)
      )
    ) {
      label = nextExpandableSlotLabel('תח"י', current);
    }
    const next = addFolderActionButton(
      studentId,
      folderName,
      label,
      studentStatus
    );
    refresh();
    void openFormsPage(next);
  }

  function handleAddNamedDocument() {
    const name = newDocName.trim();
    if (!name) return;
    const next = addFolderActionButton(
      studentId,
      folderName,
      name,
      studentStatus
    );
    if (isCustomDocumentFolder(folderName)) {
      maybeExpandFolderSlot(studentId, folderName, next, studentStatus);
    }
    setNewDocName("");
    refresh();
    void openFormsPage(next);
  }

  function handleRemoveButton(label: string) {
    const hasDocs = getStudentDocuments(studentId).some(
      (doc) => (doc.folder || "כללי") === label
    );
    if (hasDocs) {
      setError(
        getTextByPath(texts, "studentPortfolio.removeFolderBlocked") ||
          "לא ניתן להסיר תיקייה שמכילה מסמכים"
      );
      return;
    }
    removeFolderActionButton(studentId, folderName, label, studentStatus);
    refresh();
    setError(null);
  }

  function startEdit(label: string) {
    if (lockTitles) return;
    setEditingSlot(label);
    setEditDraft(label);
  }

  function saveEdit() {
    if (lockTitles || !editingSlot) return;
    const nextLabel = editDraft.trim();
    if (!nextLabel) return;
    renameFolderActionButton(
      studentId,
      folderName,
      editingSlot,
      nextLabel,
      studentStatus
    );
    // עדכון slot של מסמכים — לא משנים את תיקיית האב (כדי שלא תיווצר תיקייה חדשה ברמת התיק)
    for (const doc of getStudentDocuments(studentId)) {
      if (
        getDocumentSlot(doc.id) === editingSlot ||
        (doc.folder || "כללי") === editingSlot
      ) {
        setDocumentSlot(doc.id, nextLabel);
      }
    }
    setEditingSlot(null);
    setEditDraft("");
    refresh();
  }

  function handlePrintSlot(label: string) {
    setPrintError(null);
    if (guestDemo) {
      setPrintError(
        getTextByPath(texts, "studentPortfolio.printBlockedFreeAccess") ||
          "בכניסה חופשית אין אפשרות להדפסת טפסים"
      );
      return;
    }
    void (async () => {
      const result = await printDocumentsInFolders(studentId, [label]);
      if (!result.ok) {
        setPrintError(
          getTextByPath(texts, "studentPortfolio.printFolderEmpty") ||
            "אין מסמכים להדפסה בתיקייה זו"
        );
      }
    })();
  }

  function handlePrintFolder() {
    setPrintError(null);
    if (guestDemo) {
      setPrintError(
        getTextByPath(texts, "studentPortfolio.printBlockedFreeAccess") ||
          "בכניסה חופשית אין אפשרות להדפסת טפסים"
      );
      return;
    }
    void (async () => {
      const result = await printDocumentsInFolders(studentId, [folderName]);
      if (!result.ok) {
        setPrintError(
          getTextByPath(texts, "studentPortfolio.printFolderEmpty") ||
            "אין מסמכים להדפסה בתיקייה זו"
        );
      }
    })();
  }

  return (
    <div className="menu-box flex flex-col gap-4 p-4">
      {!guestDemo ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrintFolder}
          >
            <Printer className="h-4 w-4" />
            <EditableText path="studentPortfolio.printFolder" />
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((label) => {
          const editing = editingSlot === label;
          const templateHref = getFolderButtonTemplateHref(
            folderName,
            label,
            studentStatus,
            studentCategory
          );
          const fillSchema = isGroupFolderButton(
            folderName,
            label,
            studentStatus
          )
            ? undefined
            : getFormSchemaByFolder(label, studentStatus, studentCategory);
          return (
            <div
              key={label}
              className={cn(
                "relative rounded-2xl border-2 border-border bg-white p-3 shadow-sm transition hover:border-brand-300"
              )}
            >
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="h-9 text-center font-bold"
                    autoFocus
                  />
                  <div className="flex justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      className="h-8 w-8"
                      onClick={saveEdit}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingSlot(null);
                        setEditDraft("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    href={hrefForAction(label)}
                    className="block w-full py-4 text-center text-base font-bold text-ink"
                    onClick={(e) => {
                      e.preventDefault();
                      void tryOpenTarget(label).then((ok) => {
                        if (ok) router.push(hrefForAction(label));
                      });
                    }}
                  >
                    {label}
                  </Link>
                  <div className="mt-1 flex justify-center gap-1">
                    {!guestDemo ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-brand-700"
                      onClick={() => handlePrintSlot(label)}
                      aria-label={`הדפסת ${label}`}
                      title={
                        getTextByPath(texts, "studentPortfolio.printFolder") ||
                        "הדפסת כל המסמכים בתיקייה"
                      }
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    ) : null}
                    {fillSchema && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-brand-700"
                        aria-label="מילוי הטופס"
                        title={
                          getTextByPath(texts, "studentPortfolio.openFillForm") ||
                          "מעבר למילוי הטופס"
                        }
                        onClick={() => {
                          const href = portfolioStructuredFillHref({
                            studentId,
                            schema: fillSchema,
                            navFrom,
                            parentFolder: folderName,
                            existingFills: getStudentFormFills(studentId),
                          });
                          void tryOpenTarget(label, fillSchema.id).then((ok) => {
                            if (ok) router.push(href);
                          });
                        }}
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {templateHref && (
                      <Button
                        asChild
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-brand-700"
                        aria-label="הורדת תבנית ריקה"
                        title="הורדת תבנית ריקה"
                      >
                        <a
                          href={templateHref}
                          download
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {!lockStructure && !lockTitles ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEdit(label)}
                      aria-label="עריכה"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    ) : null}
                    {!lockStructure && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemoveButton(label)}
                      aria-label="הסרה"
                      disabled={actions.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {isCustomFolder && !lockStructure ? (
        <div className="flex w-full max-w-md flex-col gap-2 self-center sm:flex-row">
          <Input
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder=""
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddNamedDocument();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!newDocName.trim()}
            onClick={handleAddNamedDocument}
          >
            <Plus className="h-4 w-4" />
            <EditableText path="studentPortfolio.addNamedDocument" />
          </Button>
        </div>
      ) : (!lockStructure || hasExpandableSlot) ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={handleAddButton}>
            <Plus className="h-4 w-4" />
            <EditableText path="studentPortfolio.addActionButton" />
          </Button>
        </div>
      ) : null}

      {isReferralProtocolGroupFolder(folderName) ? (
        <FolderDocumentUploadPanel
          studentId={studentId}
          folderName={folderName}
          status={studentStatus}
          category={studentCategory}
          disabled={guestDemo}
          nextHref={nextSibling?.href}
          nextLabel={nextSibling?.label}
          nextKind={nextSibling?.kind}
        />
      ) : null}

      {nextSibling ? (
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
      ) : null}

      {error && (
        <p className="text-center text-sm font-medium text-destructive">{error}</p>
      )}
      {printError && (
        <p className="text-center text-sm font-medium text-destructive">
          {printError}
        </p>
      )}

      <StudentFolderFilledFormsList
        studentId={studentId}
        folderName={folderName}
        studentStatus={studentStatus}
        fillFrom={fillFrom}
      />

      <ConfidentialityWaiverRequiredDialog
        open={waiverDialogOpen}
        onOpenChange={setWaiverDialogOpen}
        studentId={studentId}
        reason={waiverReason}
      />
    </div>
  );
}
