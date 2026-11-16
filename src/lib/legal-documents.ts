import accessibility from "@/content/legal/accessibility.json";
import privacy from "@/content/legal/privacy.json";
import termsOfUse from "@/content/legal/terms-of-use.json";

export type LegalDocumentId = "accessibility" | "privacy" | "terms-of-use";

export interface LegalDocument {
  title: string;
  subtitle: string;
  html: string;
}

const DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  accessibility,
  privacy,
  "terms-of-use": termsOfUse,
};

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  return DOCUMENTS[id];
}

export const LEGAL_DOCUMENT_ROUTES: Record<
  LegalDocumentId,
  { href: string; downloadHref: string }
> = {
  accessibility: {
    href: "/accessibility",
    downloadHref: "",
  },
  privacy: {
    href: "/privacy",
    downloadHref: "",
  },
  "terms-of-use": {
    href: "/terms",
    downloadHref: "",
  },
};
