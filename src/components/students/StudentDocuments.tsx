"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  FolderPlus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addStudentDocument,
  archivePaperWaiverScan,
  archiveStudentDocument,
  deleteStudentDocument,
  getStudentDocuments,
  removePaperWaiverScan,
  restoreStudentDocument,
} from "@/lib/mock-store";
import type { StudentDocument } from "@/lib/supabase/types";
import { downloadStudentDocument } from "@/lib/student-document-open";
import {
  fileExceedsUploadLimits,
  messageForUploadError,
} from "@/lib/upload-guard";
import { EditableText } from "@/components/editable/EditableText";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import {
  getKnownDocumentFolders,
  rememberDocumentFolder,
} from "@/lib/student-card";
import {
  applyPaperWaiverListAction,
  applyPaperWaiverListArchiveAction,
  paperWaiverErrorTextPath,
} from "@/lib/paper-waiver-scan";

const ACCEPTED_TYPES =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,application/pdf,image/*";
const NEW_FOLDER_VALUE = "__new_folder__";

interface StudentDocumentsProps {
  studentId: string;
  /** כשמוגדר — מציגים רק את התיקייה הזו בלי בחירת תיקייה */
  lockedFolder?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isArchived(doc: StudentDocument): boolean {
  return Boolean(doc.archived_at);
}

export function StudentDocuments({
  studentId,
  lockedFolder,
}: StudentDocumentsProps) {
  const { texts } = useSiteText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [folders, setFolders] = useState(() =>
    getKnownDocumentFolders(studentId)
  );
  const [selectedFolder, setSelectedFolder] = useState(
    lockedFolder || "כללי"
  );
  const [folderSelect, setFolderSelect] = useState(lockedFolder || "כללי");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshDocuments() {
    setDocuments(getStudentDocuments(studentId));
  }

  useEffect(() => {
    refreshDocuments();
    const known = getKnownDocumentFolders(studentId);
    for (const doc of getStudentDocuments(studentId)) {
      if (doc.folder && !known.includes(doc.folder)) {
        rememberDocumentFolder(studentId, doc.folder);
      }
    }
    setFolders(getKnownDocumentFolders(studentId));
    if (lockedFolder) {
      rememberDocumentFolder(studentId, lockedFolder);
      setSelectedFolder(lockedFolder);
      setFolderSelect(lockedFolder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on id/folder only
  }, [studentId, lockedFolder]);

  const activeFolder = lockedFolder || selectedFolder;

  const folderDocuments = useMemo(
    () =>
      documents.filter((doc) => (doc.folder || "כללי") === activeFolder),
    [documents, activeFolder]
  );

  const activeDocuments = useMemo(
    () => folderDocuments.filter((doc) => !isArchived(doc)),
    [folderDocuments]
  );

  const archivedDocuments = useMemo(
    () => folderDocuments.filter((doc) => isArchived(doc)),
    [folderDocuments]
  );

  function refreshFolders() {
    setFolders(getKnownDocumentFolders(studentId));
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    rememberDocumentFolder(studentId, name);
    refreshFolders();
    setSelectedFolder(name);
    setFolderSelect(name);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;

    setError(null);
    setUploading(true);
    const targetFolder = lockedFolder || folderSelect.trim() || "כללי";
    rememberDocumentFolder(studentId, targetFolder);

    try {
      let added = 0;
      for (const file of Array.from(files)) {
        if (fileExceedsUploadLimits(file)) {
          setError(getTextByPath(texts, "studentDocuments.fileTooLarge"));
          continue;
        }
        await addStudentDocument(studentId, file, targetFolder);
        added += 1;
      }
      if (added > 0) {
        refreshDocuments();
        refreshFolders();
        setSelectedFolder(targetFolder);
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
      refreshDocuments();
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

  async function handleRestore(documentId: string) {
    setBusyId(documentId);
    setError(null);
    try {
      await restoreStudentDocument(documentId);
      refreshDocuments();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const paperPath = paperWaiverErrorTextPath(code);
      setError(
        paperPath
          ? getTextByPath(texts, paperPath)
          : "שחזור המסמך נכשל — נסו שוב"
      );
    } finally {
      setBusyId(null);
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
      refreshDocuments();
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

  function renderDocRow(
    doc: StudentDocument,
    mode: "active" | "archived"
  ) {
    return (
      <li
        key={doc.id}
        className="flex flex-col gap-2 rounded-xl border border-border bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-pink" />
          <div className="min-w-0">
            <div className="truncate font-bold text-pink">{doc.name}</div>
            <div className="text-xs text-pink/80">
              {formatFileSize(doc.size)}
              {doc.archived_at
                ? ` · ${new Date(doc.archived_at).toLocaleDateString("he-IL")}`
                : ""}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="הורדה"
            title="הורדה"
            onClick={() => void downloadStudentDocument(doc)}
          >
            <Download className="h-4 w-4" />
          </Button>
          {mode === "active" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === doc.id}
              onClick={() => void handleArchive(doc.id)}
              aria-label={getTextByPath(
                texts,
                "studentDocuments.archiveButton"
              )}
            >
              <Archive className="h-4 w-4" />
              <EditableText path="studentDocuments.archiveButton" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === doc.id}
              onClick={() => void handleRestore(doc.id)}
              aria-label={getTextByPath(
                texts,
                "studentDocuments.restoreButton"
              )}
            >
              <ArchiveRestore className="h-4 w-4" />
              <EditableText path="studentDocuments.restoreButton" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busyId === doc.id}
            onClick={() => void handleDelete(doc.id)}
            aria-label={getTextByPath(texts, "studentDocuments.deleteButton")}
          >
            <Trash2 className="h-4 w-4" />
            <EditableText path="studentDocuments.deleteButton" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <div
      className={
        lockedFolder
          ? "menu-box p-3"
          : "mt-3 rounded-xl border border-border bg-brand-50/60 p-3"
      }
    >
      {!lockedFolder && (
        <div className="mb-2 border-b border-brand-200 pb-1.5 text-center">
          <EditableText
            path="studentDocuments.title"
            as="h3"
            className="text-base font-bold text-pink"
          />
        </div>
      )}

      {!lockedFolder && (
        <div className="mb-2 flex flex-col gap-2 rounded-lg border border-brand-200 bg-white p-2.5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-folder-filter">
              <EditableText path="studentDocuments.folderLabel" />
            </Label>
            <select
              id="doc-folder-filter"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>

          {!creatingFolder ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreatingFolder(true)}
            >
              <FolderPlus className="h-4 w-4" />
              <EditableText path="studentDocuments.addFolderButton" />
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
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
                <EditableText path="studentDocuments.saveFolderButton" />
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
          )}
        </div>
      )}

      <div className="mb-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-brand-300 bg-white/70 p-3">
        {!lockedFolder && (
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="doc-upload-folder">
              <EditableText path="studentDocuments.uploadFolderLabel" />
            </Label>
            <select
              id="doc-upload-folder"
              value={
                creatingFolder && newFolderName.trim()
                  ? NEW_FOLDER_VALUE
                  : folderSelect
              }
              onChange={(e) => {
                if (e.target.value === NEW_FOLDER_VALUE) {
                  setCreatingFolder(true);
                  return;
                }
                setFolderSelect(e.target.value);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
              <option value={NEW_FOLDER_VALUE}>
                +{" "}
                {getTextByPath(texts, "studentDocuments.addFolderButton") ||
                  "תיקייה חדשה"}
              </option>
            </select>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        <Button
          type="button"
          size="lg"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-5 w-5" />
          {uploading ? (
            <EditableText path="studentDocuments.uploading" />
          ) : (
            <EditableText path="studentDocuments.uploadButton" />
          )}
        </Button>
        <EditableText
          path="studentDocuments.uploadHint"
          as="span"
          className="text-xs text-pink"
        />
      </div>

      {error && (
        <p className="mb-3 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="mb-2 text-center text-sm font-bold text-ink">
        <EditableText path="studentDocuments.activeTitle" />
      </div>

      {activeDocuments.length === 0 ? (
        <EditableText
          path="studentDocuments.emptyList"
          as="p"
          block
          className="py-4 text-center text-sm text-pink"
        />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {activeDocuments.map((doc) => renderDocRow(doc, "active"))}
        </ul>
      )}

      <div className="mt-4 border-t-2 border-dashed border-brand-200 pt-4">
        <div className="mb-3 flex items-center justify-center gap-2 text-center">
          <Archive className="h-5 w-5 text-brand-600" aria-hidden />
          <EditableText
            path="studentDocuments.archiveTitle"
            as="h3"
            className="text-base font-bold text-ink"
          />
        </div>
        <EditableText
          path="studentDocuments.archiveHint"
          as="p"
          block
          className="mb-3 text-center text-xs text-pink"
        />

        {archivedDocuments.length === 0 ? (
          <EditableText
            path="studentDocuments.archiveEmpty"
            as="p"
            block
            className="py-3 text-center text-sm text-pink/80"
          />
        ) : (
          <ul className="flex flex-col gap-2 opacity-90">
            {archivedDocuments.map((doc) => renderDocRow(doc, "archived"))}
          </ul>
        )}
      </div>
    </div>
  );
}
