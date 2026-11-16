"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getLegalDocument,
  LEGAL_DOCUMENT_ROUTES,
  type LegalDocumentId,
} from "@/lib/legal-documents";

interface LegalDocumentPageClientProps {
  documentId: LegalDocumentId;
}

export function LegalDocumentPageClient({
  documentId,
}: LegalDocumentPageClientProps) {
  const document = getLegalDocument(documentId);
  const route = LEGAL_DOCUMENT_ROUTES[documentId];

  return (
    <PageShell>
      <div className="mb-3 flex shrink-0 flex-col items-center gap-1 text-center">
        <h1 className="text-2xl text-ink sm:text-3xl">{document.title}</h1>
        <span className="h-1 w-14 rounded-full bg-gradient-to-l from-[#2F3B67] via-[#10B7C6] to-[#6B2DBD]" />
        <p className="text-sm text-muted-foreground">{document.subtitle}</p>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              נוסח הדגמה. כל הזכויות שמורות לאופיסנס (OfficeSense).
            </p>
            {route.downloadHref ? (
              <Button asChild variant="outline" size="sm">
                <a href={route.downloadHref} download>
                  <Download className="h-4 w-4" />
                  הורדת Word
                </a>
              </Button>
            ) : null}
          </div>

          <article
            className="legal-document-body"
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: document.html }}
          />
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
        {documentId !== "accessibility" && (
          <Link href="/accessibility" className="text-teal hover:underline">
            הצהרת נגישות
          </Link>
        )}
        {documentId !== "terms-of-use" && (
          <Link href="/terms" className="text-teal hover:underline">
            תקנון שימוש
          </Link>
        )}
        {documentId !== "privacy" && (
          <Link href="/privacy" className="text-teal hover:underline">
            מדיניות פרטיות
          </Link>
        )}
      </div>
    </PageShell>
  );
}
