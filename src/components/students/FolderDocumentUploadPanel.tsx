"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { ensureStudentDocuments } from "@/lib/data-cache";
import {
  addStudentDocument,
  getStudentDocuments,
} from "@/lib/mock-store";
import {
  fileExceedsUploadLimits,
  messageForUploadError,
} from "@/lib/upload-guard";
import { rememberDocumentFolder } from "@/lib/student-card";
import { getDocumentSlot, setDocumentRole, setDocumentSlot } from "@/lib/folder-actions";
import {
  downloadStudentDocument,
  openStudentDocument,
} from "@/lib/student-document-open";
import {
  documentBelongsToReferralProtocolFolder,
  getFormsFolderTemplateHref,
  isReferralProtocolGroupFolder,
  normalizeDocumentFolderLabel,
  REFERRAL_PROTOCOL_FOLDER,
  sameNormalizedFolderName,
} from "@/lib/portfolio-folder-templates";
import type { StudentDocument, StudentStatus } from "@/lib/supabase/types";

const ACCEPTED_TYPES =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,application/pdf,image/*";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FolderDocumentUploadPanelProps {
  studentId: string;
  folderName: string;
  status?: StudentStatus | null;
  category?: string | null;
  disabled?: boolean;
  /** אחרי העלאה — מעבר אוטומטי לעמוד הבא (כמו בדף טפסים) */
  nextHref?: string | null;
  nextLabel?: string | null;
  nextKind?: "form" | "folder";
}

export function FolderDocumentUploadPanel({
  studentId,
  folderName,
  status,
  category,
  disabled = false,
  nextHref,
  nextLabel,
  nextKind,
}: FolderDocumentUploadPanelProps) {
  const { texts } = useSiteText();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const templateHref = getFormsFolderTemplateHref(
    folderName,
    status,
    category
  );

  async function refresh() {
    await ensureStudentDocuments(studentId);
    setDocuments(getStudentDocuments(studentId));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, folderName]);

  const folderDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (doc.archived_at) return false;
      const docFolder = doc.folder || "כללי";
      const slot = getDocumentSlot(doc.id);
      if (isReferralProtocolGroupFolder(folderName)) {
        return documentBelongsToReferralProtocolFolder({
          docFolder,
          docSlot: slot,
          folderName,
          status,
        });
      }
      if (sameNormalizedFolderName(docFolder, folderName, status)) return true;
      return Boolean(
        slot && sameNormalizedFolderName(slot, folderName, status)
      );
    });
  }, [documents, folderName, status]);

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length || disabled) return;
    setError(null);
    setMessage(null);
    setUploading(true);
    const saveFolder = isReferralProtocolGroupFolder(folderName)
      ? REFERRAL_PROTOCOL_FOLDER
      : normalizeDocumentFolderLabel(folderName, status);
    try {
      let added = 0;
      for (const file of Array.from(files)) {
        if (fileExceedsUploadLimits(file)) {
          setError(getTextByPath(texts, "studentDocuments.fileTooLarge"));
          continue;
        }
        const doc = await addStudentDocument(studentId, file, saveFolder);
        rememberDocumentFolder(studentId, saveFolder);
        setDocumentRole(doc.id, "upload");
        setDocumentSlot(doc.id, saveFolder);
        added += 1;
      }
      if (added > 0) {
        await refresh();
        if (nextHref) {
          setMessage(
            nextKind === "folder"
              ? `הקובץ הועלה — מעביר לתיקייה הבאה: ${nextLabel ?? ""}`
              : `הקובץ הועלה — מעביר לטופס הבא: ${nextLabel ?? ""}`
          );
          window.setTimeout(() => {
            router.push(nextHref);
          }, 500);
        } else {
          setMessage(
            added === 1 ? "המסמך הועלה בהצלחה" : `${added} מסמכים הועלו בהצלחה`
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

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-brand-100 pt-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-5 w-5" />
          {uploading
            ? getTextByPath(texts, "studentDocuments.uploading") || "מעלה..."
            : getTextByPath(texts, "studentPortfolio.independentUpload") ||
              "העלאה עצמאית"}
        </Button>
        {templateHref ? (
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={templateHref} download>
              <Download className="h-5 w-5" />
              הורדת תבנית ריקה
            </a>
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => void handleFilesSelected(e.target.files)}
      />

      <EditableText
        path="studentDocuments.uploadHint"
        as="p"
        block
        className="text-center text-xs text-pink"
      />

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">{error}</p>
      ) : null}
      {message ? (
        <p className="text-center text-sm font-medium text-brand-700">{message}</p>
      ) : null}

      {folderDocs.length === 0 ? (
        <p className="text-center text-sm text-pink">
          {getTextByPath(texts, "studentPortfolio.formsEmpty") ||
            "אין מסמכים בתיקייה עדיין"}
        </p>
      ) : (
        <ul className="space-y-2">
          {folderDocs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-start transition hover:opacity-80"
                onClick={() => void openStudentDocument(doc)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">
                    {doc.name}
                  </div>
                  <div className="text-xs text-pink/80">
                    {formatFileSize(doc.size)}
                  </div>
                </div>
              </button>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void downloadStudentDocument(doc)}
                >
                  <Download className="h-4 w-4" />
                  {getTextByPath(texts, "studentDocuments.downloadButton") ||
                    "הורדה"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
