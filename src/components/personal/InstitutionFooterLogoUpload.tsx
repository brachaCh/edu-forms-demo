"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import {
  fileToSchoolLogoDataUrl,
  persistInstitutionFooterLogoDataUrl,
  resolveInstitutionFooterLogoDataUrl,
  type InstitutionLogoScopeInput,
} from "@/lib/document-branding";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { useDataStore } from "@/components/providers/DataStoreProvider";

interface InstitutionFooterLogoUploadProps {
  scope: InstitutionLogoScopeInput;
}

export function InstitutionFooterLogoUpload({
  scope,
}: InstitutionFooterLogoUploadProps) {
  const { texts } = useSiteText();
  const { guestDemo } = useDataStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLogoUrl(resolveInstitutionFooterLogoDataUrl(scope));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when institution identity changes
  }, [scope.institutionId, scope.institutionCode]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await fileToSchoolLogoDataUrl(file);
      persistInstitutionFooterLogoDataUrl(scope, dataUrl);
      setLogoUrl(dataUrl);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "FILE_TOO_LARGE") {
        setError(
          getTextByPath(texts, "personalArea.institutionLogoTooLarge") ||
            "הלוגו גדול מדי (עד כ־800KB)"
        );
      } else if (code === "FILE_NOT_IMAGE") {
        setError(
          getTextByPath(texts, "personalArea.institutionLogoNotImage") ||
            "יש להעלות קובץ תמונה"
        );
      } else {
        setError(
          getTextByPath(texts, "personalArea.institutionLogoError") ||
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
    persistInstitutionFooterLogoDataUrl(scope, null);
    setLogoUrl(null);
    setError(null);
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-white px-3 py-3">
      <p className="mb-1 text-center text-sm font-bold text-pink">
        <EditableText path="personalArea.institutionLogoLabel" />
      </p>
      <p className="mb-3 text-center text-xs text-pink/70">
        <EditableText path="personalArea.institutionLogoHint" />
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex h-32 w-44 items-center justify-center rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-2 sm:h-36 sm:w-52">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={
                getTextByPath(texts, "personalArea.institutionLogoAlt") ||
                "לוגו בית הספר"
              }
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-2 text-center text-xs text-pink/70">
              {getTextByPath(texts, "personalArea.institutionLogoEmpty") ||
                "אין לוגו עמותה"}
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
                ? getTextByPath(texts, "studentDocuments.uploading") ||
                  "מעלה..."
                : getTextByPath(texts, "personalArea.institutionLogoUpload") ||
                  "העלאת לוגו מוסד"}
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
                {getTextByPath(texts, "personalArea.institutionLogoRemove") ||
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
    </div>
  );
}
