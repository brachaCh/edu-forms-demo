"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { ensureStudentDocuments } from "@/lib/data-cache";
import {
  addPaperWaiverScan,
  getStudentDocuments,
  removePaperWaiverScan,
} from "@/lib/mock-store";
import {
  hasAllRequiredWaiverSignatures,
} from "@/lib/confidentiality-waiver-gate";
import {
  PAPER_WAIVER_SCAN_ACCEPT,
  findPaperWaiverScan,
  paperWaiverErrorTextPath,
  waiverSatisfactionSource,
} from "@/lib/paper-waiver-scan";
import { messageForUploadError } from "@/lib/upload-guard";
import { openStudentDocument } from "@/lib/student-document-open";
import type { StudentDocument } from "@/lib/supabase/types";

function formatUploadedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL");
}

interface PaperWaiverScanPanelProps {
  studentId: string;
  folderName?: string;
  disabled?: boolean;
  onChanged?: () => void;
  refreshKey?: number;
}

export function PaperWaiverScanPanel({
  studentId,
  folderName = "ויתור סודיות",
  disabled = false,
  onChanged,
  refreshKey = 0,
}: PaperWaiverScanPanelProps) {
  const { texts } = useSiteText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<StudentDocument | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const digitalComplete = hasAllRequiredWaiverSignatures(studentId);
  const source = waiverSatisfactionSource({
    digitalComplete,
    paperScanComplete: scan != null,
  });

  const statusPath = useMemo(() => {
    if (source === "both") return "studentPortfolio.paperWaiverBothSatisfied";
    if (source === "paper-scan") return "studentPortfolio.paperWaiverSatisfied";
    if (source === "digital") return "studentPortfolio.paperWaiverDigitalSatisfied";
    return null;
  }, [source]);

  async function refreshScan() {
    await ensureStudentDocuments(studentId);
    setScan(findPaperWaiverScan(getStudentDocuments(studentId)));
  }

  useEffect(() => {
    void refreshScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, refreshKey]);

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setError(null);
    setMessage(null);
    setBusy("upload");
    try {
      await addPaperWaiverScan(studentId, file, folderName);
      await refreshScan();
      onChanged?.();
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err ?? "");
      const paperPath = paperWaiverErrorTextPath(code);
      setError(
        paperPath
          ? getTextByPath(texts, paperPath)
          : messageForUploadError(
              err,
              getTextByPath(texts, "studentDocuments.fileTooLarge")
            )
      );
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (disabled) return;
    setError(null);
    setMessage(null);
    setBusy("remove");
    try {
      await removePaperWaiverScan(studentId);
      await refreshScan();
      setMessage(getTextByPath(texts, "studentPortfolio.paperWaiverRemoved"));
      onChanged?.();
    } catch {
      setError(getTextByPath(texts, "studentPortfolio.paperWaiverRemoveFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      dir="rtl"
      className="rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-4 text-center"
    >
      <p className="text-sm font-bold text-ink">
        <EditableText path="studentPortfolio.paperWaiverTitle" as="span" />
      </p>
      <p className="mt-1 text-xs text-pink">
        <EditableText path="studentPortfolio.paperWaiverDescription" as="span" />
      </p>

      {statusPath ? (
        <p role="status" className="mt-3 text-sm font-medium text-brand-800">
          <EditableText path={statusPath} as="span" />
        </p>
      ) : null}

      {scan ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex max-w-full items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-brand-700" />
            <div className="min-w-0 text-start">
              <div className="truncate text-sm font-bold text-ink">{scan.name}</div>
              {scan.uploaded_at ? (
                <div className="text-xs text-pink">
                  <EditableText
                    path="studentPortfolio.paperWaiverUploadedAt"
                    as="span"
                  />{" "}
                  {formatUploadedAt(scan.uploaded_at)}
                </div>
              ) : null}
            </div>
          </div>
          {source === "paper-scan" && !digitalComplete ? (
            <p className="text-xs text-pink">
              <EditableText
                path="studentPortfolio.paperWaiverPendingDigitalNote"
                as="span"
              />
            </p>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={PAPER_WAIVER_SCAN_ACCEPT}
        className="hidden"
        aria-label="העלאת סריקה חתומה של ויתור סודיות"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {scan ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy != null}
            onClick={() => void openStudentDocument(scan)}
          >
            <Eye className="h-4 w-4" />
            <EditableText path="studentPortfolio.paperWaiverView" as="span" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={disabled || busy != null}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {busy === "upload" ? (
            <EditableText path="studentPortfolio.paperWaiverUploading" as="span" />
          ) : scan ? (
            <EditableText path="studentPortfolio.paperWaiverReplace" as="span" />
          ) : (
            <EditableText path="studentPortfolio.paperWaiverUpload" as="span" />
          )}
        </Button>
        {scan ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={disabled || busy != null}
            onClick={() => void handleRemove()}
          >
            <Trash2 className="h-4 w-4" />
            {busy === "remove" ? (
              <EditableText path="studentPortfolio.paperWaiverRemoving" as="span" />
            ) : (
              <EditableText path="studentPortfolio.paperWaiverRemove" as="span" />
            )}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm font-medium text-destructive">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm font-medium text-brand-700">{message}</p>
      ) : null}
    </div>
  );
}
