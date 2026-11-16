"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContactButton } from "@/components/contact/ContactButton";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FrameworkSelectCards } from "@/components/personal/FrameworkSelectCards";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { TextScope } from "@/components/providers/TextScope";
import {
  SECTOR_TEXT_PATH,
  sectorSectorsListHref,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import { useSessionHome } from "@/components/layout/useSessionHome";
import {
  isPublicEntryHref,
  sanitizeBackHrefForSession,
} from "@/lib/navigation-back";

/** כותרת מגזר — מפתחות ייעודיים שלא נערכו בטעות לטקסטי מסגרת */
const SECTOR_TITLE_PATH: Record<PersonalSector, string> = {
  kindergartens: "personalArea.sectorKindergartens",
  schools: "personalArea.sectorSchools",
  "high-schools": "personalArea.sectorHighSchools",
};

interface FrameworkSelectPageClientProps {
  sector: PersonalSector;
  area?: SectorArea;
  titlePath?: string;
  backHref?: string;
  backTextPath?: string;
}

export function FrameworkSelectPageClient({
  sector,
  area = "personal-area",
  titlePath = SECTOR_TITLE_PATH[sector] ?? SECTOR_TEXT_PATH[sector],
  backHref = sectorSectorsListHref(area),
  backTextPath =
    area === "dashboard"
      ? "categoryDetail.backToDashboard"
      : "personalArea.backToSectors",
}: FrameworkSelectPageClientProps) {
  // גני ילדים ותיכונים עדיין בהרצה — רק בתי ספר פתוחים לבחירת מסגרת
  const comingSoonSector =
    sector === "kindergartens" || sector === "high-schools";
  const { guestDemo, loggedIn, homeHref } = useSessionHome();
  const treatAsLoggedIn = guestDemo || loggedIn || area === "personal-area";
  const resolvedBackHref = sanitizeBackHrefForSession(
    backHref,
    treatAsLoggedIn,
    loggedIn ? homeHref : undefined
  );
  const resolvedBackTextPath =
    isPublicEntryHref(backHref) && treatAsLoggedIn
      ? "personalArea.backToProfile"
      : backTextPath;

  return (
    <PageShell>
      <TextScope sector={sector}>
        <PageHeader
          titlePath={titlePath}
          subtitlePath={
            comingSoonSector ? undefined : "personalArea.chooseFrameworkSubtitle"
          }
        />
        <div className="flex flex-col gap-6">
          {comingSoonSector ? (
            <div className="menu-box flex flex-col items-center gap-5 p-8 text-center">
              <EditableText
                path="personalArea.comingSoonTitle"
                as="p"
                block
                center
                className="text-2xl font-bold text-ink sm:text-3xl"
              />
              <EditableText
                path="personalArea.comingSoonContactNotice"
                as="p"
                block
                center
                className="max-w-md text-base text-muted-foreground sm:text-lg"
              />
              <ContactButton recipient="coming-soon" />
            </div>
          ) : (
            <FrameworkSelectCards sector={sector} area={area} />
          )}
          <div className="flex justify-center">
            <Button asChild variant="ghost" size="sm">
              <Link href={resolvedBackHref}>
                <ArrowRight className="h-4 w-4" />
                <EditableText path={resolvedBackTextPath} />
              </Link>
            </Button>
          </div>
        </div>
      </TextScope>
    </PageShell>
  );
}
