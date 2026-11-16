"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  FolderPlus,
  Printer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableText } from "@/components/editable/EditableText";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { TextScope } from "@/components/providers/TextScope";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { getStudentDocuments, getStudents } from "@/lib/mock-store";
import {
  categoryTeacherHref,
  isPersonalSector,
  sectorTeacherHref,
} from "@/lib/personal-sector";
import {
  forgetDocumentFolder,
  getKnownDocumentFolders,
  rememberDocumentFolder,
} from "@/lib/student-card";
import {
  folderIconForName,
  getPortfolioCategoriesForStatus,
  isSpecialEdPortfolioStatus,
  studentPortfolioFolderHref,
} from "@/lib/student-portfolio";
import { printDocumentsInFolders } from "@/lib/student-document-print";
import { formatStudentDisplayName } from "@/lib/person-name";
import { cn } from "@/lib/utils";
import type { Student } from "@/lib/supabase/types";
import { ConfidentialityWaiverRequiredDialog } from "@/components/students/ConfidentialityWaiverRequiredDialog";
import {
  EXTRA_DOCUMENTS_FOLDER,
  loadCanAccessPortfolioForm,
} from "@/lib/confidentiality-waiver-gate";
import {
  hrefWithFrom,
  readNavBackHref,
  rememberNavBackHref,
} from "@/lib/navigation-back";
import { resolveStudentsListBackHref } from "@/lib/student-list-back";
import { StudentsListBackLink } from "@/components/students/StudentsListBackLink";

interface StudentPortfolioPageClientProps {
  id: string;
  backHref?: string | null;
}

export function StudentPortfolioPageClient({
  id,
  backHref,
}: StudentPortfolioPageClientProps) {
  const router = useRouter();
  const { ready, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const [student, setStudent] = useState<Student | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);

  const cardHref = `/personal-area/students/view/${id}`;

  function refreshFolders(status?: Student["status"] | null) {
    // לא מוסיפים כפתורי טפסים כתיקיות ברמת התיק — רק קטגוריות + תיקיות מותאמות
    setFolders(getKnownDocumentFolders(id, status));
  }

  useEffect(() => {
    if (!ready) return;
    const found = getStudents().find((s) => s.id === id);
    if (!found) {
      setNotFound(true);
      return;
    }
    // מורה / איש צוות — אין תיק תלמיד; מעבירים לרשימת התלמידים המקושרים
    if (found.status === "integration-teacher") {
      const name = found.full_name.trim();
      const sector = isPersonalSector(found.category) ? found.category : null;
      router.replace(
        sector
          ? sectorTeacherHref(sector, "integration-teacher", name)
          : categoryTeacherHref("integration-teacher", name)
      );
      return;
    }
    setStudent(found);
    refreshFolders(found.status);
    const listHref = resolveStudentsListBackHref({
      from: backHref,
      stored: readNavBackHref(),
      student: found,
    });
    // שומרים את רשימת התלמידים לחזרה — לא את הכרטיס/תיק ולא רוסטר צוות
    if (listHref) rememberNavBackHref(listHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per id
  }, [id, ready]);

  const isSpecialEd = isSpecialEdPortfolioStatus(student?.status);

  const orderedFolders = useMemo(() => {
    const defaults = getPortfolioCategoriesForStatus(student?.status).map(
      (c) => c.folder
    );
    // כיתות חינוך מיוחד — בדיוק תיקיות התרשים, ללא תוספות
    if (isSpecialEdPortfolioStatus(student?.status)) {
      return [...defaults];
    }
    const defaultSet = new Set(defaults);
    const presentDefaults = defaults.filter((folder) =>
      folders.includes(folder)
    );
    const extra = folders
      .filter(
        (folder) =>
          !defaultSet.has(folder) && !/^מסמך \d+$/.test(folder.trim())
      )
      .sort((a, b) => a.localeCompare(b, "he"));
    return [...presentDefaults, ...extra];
  }, [folders, student?.status]);

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    rememberDocumentFolder(id, name);
    refreshFolders(student?.status);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  function handleRemoveFolder() {
    if (!removeTarget) return;
    const hasDocs = getStudentDocuments(id).some(
      (doc) => (doc.folder || "כללי") === removeTarget
    );
    if (hasDocs) {
      setRemoveError(
        getTextByPath(texts, "studentPortfolio.removeFolderBlocked") ||
          "לא ניתן להסיר תיקייה שמכילה מסמכים"
      );
      return;
    }
    forgetDocumentFolder(id, removeTarget);
    setSelectedFolders((prev) => prev.filter((folder) => folder !== removeTarget));
    refreshFolders(student?.status);
    setRemoveTarget(null);
    setRemoveError(null);
  }

  function toggleFolderSelection(folder: string) {
    setPrintMessage(null);
    setSelectedFolders((prev) =>
      prev.includes(folder)
        ? prev.filter((name) => name !== folder)
        : [...prev, folder]
    );
  }

  function handlePrintFolder(folder: string) {
    setPrintMessage(null);
    if (guestDemo) {
      setPrintMessage(
        getTextByPath(texts, "studentPortfolio.printBlockedFreeAccess") ||
          "בכניסה חופשית אין אפשרות להדפסת טפסים"
      );
      return;
    }
    void (async () => {
      const result = await printDocumentsInFolders(id, [folder]);
      if (!result.ok) {
        setPrintMessage(
          getTextByPath(texts, "studentPortfolio.printFolderEmpty") ||
            "אין מסמכים להדפסה בתיקייה זו"
        );
      }
    })();
  }

  function handlePrintSelected() {
    setPrintMessage(null);
    if (guestDemo) {
      setPrintMessage(
        getTextByPath(texts, "studentPortfolio.printBlockedFreeAccess") ||
          "בכניסה חופשית אין אפשרות להדפסת טפסים"
      );
      return;
    }
    if (selectedFolders.length === 0) {
      setPrintMessage(
        getTextByPath(texts, "studentPortfolio.printSelectedEmpty") ||
          "בחרו לפחות תיקייה אחת עם מסמכים"
      );
      return;
    }
    // סדר התיקיות כמו בתיק (לא לפי סדר הסימון) — מההתחלה לסוף
    const foldersInPortfolioOrder = orderedFolders.filter((folder) =>
      selectedFolders.includes(folder)
    );
    void (async () => {
      const result = await printDocumentsInFolders(id, foldersInPortfolioOrder);
      if (!result.ok) {
        setPrintMessage(
          getTextByPath(texts, "studentPortfolio.printSelectedEmpty") ||
            "בחרו לפחות תיקייה אחת עם מסמכים"
        );
      }
    })();
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
            <Link href="/personal-area">
              <EditableText path="common.back" />
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

  const listBackHref = resolveStudentsListBackHref({
    from: backHref,
    stored: readNavBackHref(),
    student,
  });

  const content = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={hrefWithFrom(cardHref, listBackHref)}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path="studentPortfolio.backToCard" />
          </Link>
        </Button>
        <StudentsListBackLink
          href={listBackHref}
          hideIf={cardHref}
          student={student}
        />
      </div>

      <PageHeader titlePath="studentPortfolio.title" />

      <div className="menu-box mb-4 flex items-center justify-center gap-3 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md">
          <Briefcase className="h-5 w-5" aria-hidden />
        </div>
        <div className="text-center">
          <EditableText
            path="studentPortfolio.subtitle"
            as="p"
            block
            className="text-sm text-pink"
          />
          <p className="text-lg font-bold text-ink">
            {formatStudentDisplayName(student.full_name)}
          </p>
        </div>
      </div>

      {guestDemo ? (
        <div className="menu-box mb-4 text-center text-sm text-brand-800">
          כניסה חופשית: אפשר לייבא מאקסל ולנסות למלא רק את התלמיד הראשון שיובא.
          אין אפשרות להדפסה.
        </div>
      ) : null}

      {student.archived_at ? (
        <div className="menu-box mb-4 text-center text-sm text-brand-800">
          <EditableText path="studentCard.archivedBanner" as="span" />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col items-center gap-2">
        {!guestDemo &&
          !student.archived_at &&
          !isSpecialEd &&
          (!creatingFolder ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCreatingFolder(true)}
          >
            <FolderPlus className="h-4 w-4" />
            <EditableText path="studentPortfolio.addFolderButton" />
          </Button>
        ) : (
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder=""
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateFolder();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={!newFolderName.trim()}
              onClick={handleCreateFolder}
            >
              <EditableText path="studentPortfolio.saveFolderButton" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-col items-center gap-2">
        {!guestDemo ? (
          <>
            <p className="text-center text-xs text-pink/80">
              <EditableText path="studentPortfolio.selectFoldersHint" />
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={selectedFolders.length === 0}
                onClick={handlePrintSelected}
              >
                <Printer className="h-4 w-4" />
                <EditableText path="studentPortfolio.printSelected" />
                {selectedFolders.length > 0
                  ? ` (${selectedFolders.length})`
                  : ""}
              </Button>
              {selectedFolders.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedFolders([])}
                >
                  <EditableText path="studentPortfolio.clearFolderSelection" />
                </Button>
              )}
            </div>
          </>
        ) : null}
        {printMessage && (
          <p className="text-center text-sm font-medium text-destructive">
            {printMessage}
          </p>
        )}
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orderedFolders.map((folder) => {
          const Icon = folderIconForName(folder, student.status);
          const selected = selectedFolders.includes(folder);
          return (
            <div key={folder} className="relative">
              <Link
                href={studentPortfolioFolderHref(
                  student.id,
                  folder,
                  student.status
                )}
                className={cn(
                  "action-card min-h-[120px] sm:min-h-[130px]",
                  selected && "ring-2 ring-brand-400"
                )}
                onClick={(e) => {
                  if (folder.trim() !== EXTRA_DOCUMENTS_FOLDER) return;
                  e.preventDefault();
                  void (async () => {
                    const allowed = await loadCanAccessPortfolioForm(student.id, {
                      targetLabel: EXTRA_DOCUMENTS_FOLDER,
                    });
                    if (!allowed) {
                      setWaiverDialogOpen(true);
                      return;
                    }
                    router.push(
                      studentPortfolioFolderHref(
                        student.id,
                        folder,
                        student.status
                      )
                    );
                  })();
                }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-[0_14px_28px_-12px_rgba(47,59,103,0.65)] sm:h-14 sm:w-14">
                  <Icon
                    className="h-6 w-6 text-white sm:h-7 sm:w-7"
                    strokeWidth={1.8}
                  />
                </div>
                <span className="text-lg font-bold text-ink sm:text-xl">
                  {folder}
                </span>
              </Link>

              {!guestDemo ? (
                <label
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/95 shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                  title="בחירה להדפסה"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={selected}
                    onChange={() => toggleFolderSelection(folder)}
                    aria-label={`בחירת התיקייה ${folder} להדפסה`}
                  />
                </label>
              ) : null}

              {!guestDemo ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute left-12 top-3 z-10 h-8 w-8 rounded-full border border-slate-200 bg-white/90 text-brand-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePrintFolder(folder);
                  }}
                  aria-label={`הדפסת כל המסמכים בתיקייה ${folder}`}
                  title={
                    getTextByPath(texts, "studentPortfolio.printFolder") ||
                    "הדפסת כל המסמכים בתיקייה"
                  }
                >
                  <Printer className="h-4 w-4" />
                </Button>
              ) : null}

              {!guestDemo && !isSpecialEd && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute left-3 top-3 z-10 h-8 w-8 rounded-full border border-slate-200 bg-white/90 text-slate-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRemoveError(null);
                  setRemoveTarget(folder);
                }}
                aria-label={`הסרת התיקייה ${folder}`}
                title="הסרת תיקייה"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              )}
            </div>
          );
        })}
      </div>

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="menu-box w-full max-w-md p-5 text-center">
            <p className="mb-2 text-lg font-bold text-ink">
              <EditableText path="studentPortfolio.removeFolderButton" />
            </p>
            <p className="mb-1 text-pink">{removeTarget}</p>
            <EditableText
              path="studentPortfolio.removeFolderConfirm"
              as="p"
              block
              className="mb-3 text-sm text-pink"
            />
            {removeError && (
              <p className="mb-3 text-sm font-medium text-destructive">
                {removeError}
              </p>
            )}
            <div className="flex justify-center gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemoveFolder}
              >
                <Trash2 className="h-4 w-4" />
                <EditableText path="common.delete" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRemoveTarget(null);
                  setRemoveError(null);
                }}
              >
                <EditableText path="wizard.cancelButton" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfidentialityWaiverRequiredDialog
        open={waiverDialogOpen}
        onOpenChange={setWaiverDialogOpen}
        studentId={id}
        reason="both-parents"
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
