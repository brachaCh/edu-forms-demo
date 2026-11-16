"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadPublicFormView,
  type PublicFormViewRequest,
} from "@/lib/form-view-request";
import { snapshotHtmlWithoutBlockedImages, stripScriptsForView } from "@/lib/green-signature";

function absolutizeBrandAssetUrls(html: string): string {
  if (typeof window === "undefined") return html;
  const origin = window.location.origin.replace(/\/$/, "");
  return html.replace(
    /(\bsrc=["'])(\/brand\/[^"']+)(["'])/gi,
    `$1${origin}$2$3`
  );
}

function printSnapshotHtml(html: string): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const runPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore
    }
  };
  if (printWindow.document.readyState === "complete") {
    window.setTimeout(runPrint, 250);
  } else {
    printWindow.addEventListener("load", () => window.setTimeout(runPrint, 250));
  }
}

export function PublicFormViewPage({ token }: { token: string }) {
  const [request, setRequest] = useState<PublicFormViewRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPublicFormView(token)
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) {
          setRequest(result.data);
          setError(null);
        } else {
          setError(result.error || "הקישור אינו תקין או שפג תוקפו");
        }
      })
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינת המסמך");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const viewHtml = useMemo(() => {
    if (!request) return "";
    return stripScriptsForView(
      absolutizeBrandAssetUrls(
        snapshotHtmlWithoutBlockedImages(request.snapshotHtml)
      )
    );
  }, [request]);

  const expiresLabel = useMemo(() => {
    if (!request?.expiresAt) return null;
    const d = new Date(request.expiresAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("he-IL");
  }, [request?.expiresAt]);

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-slate-100 p-4"
      >
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-lg text-center">
          <p className="text-ink">טוען את המסמך...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-slate-100 p-4"
      >
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-lg text-center">
          <h1 className="mb-4 text-xl font-bold text-ink">
            לא ניתן להציג את המסמך
          </h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col bg-slate-100"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-brand-600" />
          <div>
            <h1 className="text-lg font-bold text-ink">
              {request.formTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {request.studentName} • לצפייה בלבד
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expiresLabel && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              בתוקף עד: {expiresLabel}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSnapshotHtml(viewHtml)}
          >
            <Printer className="h-4 w-4" />
            הדפסה
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <iframe
              srcDoc={viewHtml}
              sandbox=""
              title="תצוגת מסמך"
              className="w-full border-0"
              style={{ minHeight: "80vh" }}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-sm text-muted-foreground">
        <p>מסמך זה נשלח לצפייה בלבד דרך פרוטוקל.</p>
      </footer>
    </div>
  );
}
