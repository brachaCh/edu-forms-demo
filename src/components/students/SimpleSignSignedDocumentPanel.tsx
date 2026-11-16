"use client";

import { useState } from "react";
import { Download, ExternalLink, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { simpleSignSignedPdfUrl } from "@/lib/simplesign-signature-request";

interface SimpleSignSignedDocumentPanelProps {
  formFillId: string;
  /** מזהה DOM כדי שכפתור "צפייה בחתימה" יוכל לגלול לכאן */
  id?: string;
  /** כמה חותמים חתמו מתוך כמה — לכותרת */
  signedCount: number;
  totalCount: number;
}

/**
 * מציג את המסמך החתום שחזר מ-SimpleSign בתוך הדף — כאן רואים את החתימה
 * עצמה כפי שההורה צייר אותה, יחד עם חותמת הזמן של SimpleSign.
 */
export function SimpleSignSignedDocumentPanel({
  formFillId,
  id,
  signedCount,
  totalCount,
}: SimpleSignSignedDocumentPanelProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const viewUrl = simpleSignSignedPdfUrl(formFillId);
  const downloadUrl = simpleSignSignedPdfUrl(formFillId, { download: true });
  const partial = signedCount < totalCount;

  return (
    <section
      id={id}
      dir="rtl"
      className="mx-auto w-full max-w-3xl scroll-mt-24 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm print:hidden"
      aria-label="המסמך החתום"
    >
      <div className="flex flex-wrap items-center gap-3">
        <FileCheck2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-emerald-900">
            המסמך החתום (SimpleSign)
          </h3>
          <p className="text-sm text-emerald-800">
            {partial
              ? `נחתם על ידי ${signedCount} מתוך ${totalCount} חותמים — החתימות שכבר נתקבלו מופיעות במסמך.`
              : "כאן מופיעות החתימות עצמן כפי שנחתמו, עם חותמת הזמן של SimpleSign. זה המסמך המחייב."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild type="button" size="sm" variant="outline">
            <a href={viewUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              פתיחה בחלון חדש
            </a>
          </Button>
          <Button asChild type="button" size="sm" variant="outline">
            <a href={downloadUrl}>
              <Download className="h-4 w-4" />
              הורדה
            </a>
          </Button>
        </div>
      </div>

      {loadFailed ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          הדפדפן לא הציג את המסמך בתוך הדף. אפשר לפתוח אותו בחלון חדש או להוריד.
        </p>
      ) : (
        <iframe
          title="המסמך החתום"
          src={`${viewUrl}#toolbar=0&view=FitH`}
          className="mt-3 h-[70vh] min-h-[420px] w-full rounded-xl border border-emerald-200 bg-white"
          onError={() => setLoadFailed(true)}
        />
      )}
    </section>
  );
}
