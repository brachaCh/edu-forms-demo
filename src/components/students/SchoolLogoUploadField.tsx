"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import {
  fileToSchoolLogoDataUrl,
  persistSchoolLogoDataUrl,
  resolveSchoolLogoDataUrl,
  type SchoolLogoScopeInput,
} from "@/lib/document-branding";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { useDataStore } from "@/components/providers/DataStoreProvider";

interface SchoolLogoUploadFieldProps {
  scope: SchoolLogoScopeInput;
  logoUrl: string | null;
  onLogoChange: (dataUrl: string | null) => void;
}

export function SchoolLogoUploadField({
  scope,
  logoUrl,
  onLogoChange,
}: SchoolLogoUploadFieldProps) {
  const { texts } = useSiteText();
  const { guestDemo } = useDataStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await fileToSchoolLogoDataUrl(file);
      persistSchoolLogoDataUrl(scope, dataUrl);
      onLogoChange(dataUrl);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "FILE_TOO_LARGE") {
        setError(
          getTextByPath(texts, "studentPortfolio.schoolLogoTooLarge") ||
            "הלוגו גדול מדי (עד כ־800KB)"
        );
      } else if (code === "FILE_NOT_IMAGE") {
        setError(
          getTextByPath(texts, "studentPortfolio.schoolLogoNotImage") ||
            "יש להעלות קובץ תמונה"
        );
      } else {
        setError(
          getTextByPath(texts, "studentPortfolio.schoolLogoError") ||
            "העלאת הלוגו נכשלה"
        );
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clearLogo() {
    if (guestDemo) return;
    persistSchoolLogoDataUrl(scope, null);
    onLogoChange(null);
    setError(null);
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-white px-3 py-3">
      <p className="mb-2 text-center text-sm font-bold text-pink">
        <EditableText path="studentPortfolio.schoolLogoLabel" />
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex h-32 w-44 items-center justify-center rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-2 sm:h-36 sm:w-52">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={
                getTextByPath(texts, "studentPortfolio.schoolLogoAlt") ||
                "לוגו בית הספר"
              }
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-2 text-center text-xs text-pink/70">
              {getTextByPath(texts, "studentPortfolio.schoolLogoEmpty") ||
                "אין לוגו"}
            </span>
          )}
        </div>
        {!guestDemo ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {busy
                ? getTextByPath(texts, "studentDocuments.uploading") || "מעלה..."
                : getTextByPath(texts, "studentPortfolio.schoolLogoUpload") ||
                  "העלאת לוגו בי״ס"}
            </Button>
            {logoUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={clearLogo}
              >
                <Trash2 className="h-4 w-4" />
                {getTextByPath(texts, "studentPortfolio.schoolLogoRemove") ||
                  "הסרה"}
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onFile(e.target.files)}
            />
          </div>
        ) : null}
      </div>
      {error && (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      )}
      <p className="mt-2 text-center text-xs text-pink/70">
        <EditableText path="studentPortfolio.schoolLogoHint" />
      </p>
    </div>
  );
}

export function readInitialSchoolLogo(
  scope: SchoolLogoScopeInput
): string | null {
  return resolveSchoolLogoDataUrl(scope);
}
