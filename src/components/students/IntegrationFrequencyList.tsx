"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStudentsByStatusAndFrequency } from "@/lib/mock-store";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { FrequencyExcelImportDialog } from "@/components/students/FrequencyExcelImportDialog";
import {
  sectorFrameworkHref,
  sectorFrequencyHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import { INTEGRATION_FREQUENCIES } from "@/lib/integration-frequency";
import type { IntegrationFrequency, StudentStatus } from "@/lib/supabase/types";

const FREQUENCY_TEXT: Record<
  IntegrationFrequency,
  { title: string; countPath?: never }
> = {
  high: { title: "status.frequencyHigh" },
  low: { title: "status.frequencyLow" },
};

interface IntegrationFrequencyListProps {
  status?: StudentStatus;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

export function IntegrationFrequencyList({
  status = "personal-basket",
  sector,
  framework = "special",
  area = "personal-area",
}: IntegrationFrequencyListProps) {
  const { ready: dataReady, refresh } = useDataStore();
  const [ready, setReady] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!dataReady) return;
    setReady(true);
  }, [dataReady]);

  const counts = useMemo(() => {
    if (!ready) return { high: 0, low: 0 };
    return {
      high: getStudentsByStatusAndFrequency(status, "high", sector).length,
      low: getStudentsByStatusAndFrequency(status, "low", sector).length,
    };
  }, [ready, sector, status]);

  function handleImported() {
    refresh?.();
  }

  if (!ready) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  return (
    <div className="menu-box">
      <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
        <EditableText path="status.frequencyListTitle" />
      </h2>

      <nav className="flex flex-col gap-3">
        {INTEGRATION_FREQUENCIES.map((frequency) => (
          <Link
            key={frequency}
            href={
              sector
                ? sectorFrequencyHref(
                    sector,
                    status,
                    frequency,
                    framework,
                    area
                  )
                : `/personal-area/category/${status}/frequency/${frequency}`
            }
            className="menu-item justify-between"
          >
            <EditableText
              path={FREQUENCY_TEXT[frequency].title}
              as="span"
              className="text-lg font-bold text-pink"
            />
            <span className="flex items-center gap-2 text-sm text-pink">
              {counts[frequency]}{" "}
              <EditableText path="personalArea.recordsLabel" />
              <ArrowLeft className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link
            href={
              sector
                ? sectorFrameworkHref(sector, framework, area)
                : "/personal-area"
            }
          >
            <ArrowRight className="h-4 w-4" />
            <EditableText path="personalArea.backToTable" />
          </Link>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="h-4 w-4" />
          <EditableText path="personalArea.importExcel" />
        </Button>
      </div>

      <FrequencyExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        sector={sector}
        onImported={handleImported}
      />
    </div>
  );
}
