"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EditableText } from "@/components/editable/EditableText";
import { loadStudentFormFills } from "@/lib/mock-store";
import {
  formFillStatusLabel,
  listPortfolioFolderFormFills,
  type PortfolioFolderFillEntry,
} from "@/lib/portfolio-form-fills";
import { studentPortfolioFillHref } from "@/lib/form-schemas";
import type { StudentStatus } from "@/lib/supabase/types";

interface StudentFolderFilledFormsListProps {
  studentId: string;
  folderName: string;
  studentStatus?: StudentStatus | null;
  fillFrom: string;
}

export function StudentFolderFilledFormsList({
  studentId,
  folderName,
  studentStatus,
  fillFrom,
}: StudentFolderFilledFormsListProps) {
  const [entries, setEntries] = useState<PortfolioFolderFillEntry[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setEntries(
      listPortfolioFolderFormFills(studentId, folderName, studentStatus)
    );
  }, [studentId, folderName, studentStatus]);

  useEffect(() => {
    let cancelled = false;
    void loadStudentFormFills(studentId)
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        refresh();
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, refresh]);

  useEffect(() => {
    if (!ready) return;
    refresh();
    function onFocus() {
      void loadStudentFormFills(studentId)
        .catch(() => undefined)
        .finally(refresh);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ready, studentId, refresh]);

  if (!ready) return null;

  return (
    <div className="mt-2 w-full border-t border-brand-100 pt-4">
      <p className="mb-3 text-center text-sm font-bold text-ink">
        <EditableText path="studentPortfolio.filledFormsListTitle" />
      </p>
      {entries.length === 0 ? (
        <p className="text-center text-xs text-pink/70">
          <EditableText path="studentPortfolio.filledFormsListEmpty" />
        </p>
      ) : (
        <ul className="mx-auto w-full max-w-xl space-y-2">
          {entries.map(({ fill, schema, label }) => {
            const updated = new Date(fill.updated_at).toLocaleDateString(
              "he-IL"
            );
            return (
              <li key={fill.id}>
                <Link
                  href={studentPortfolioFillHref(
                    studentId,
                    schema.id,
                    fillFrom,
                    { fillId: fill.id }
                  )}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm hover:bg-brand-50"
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold text-ink">
                    <ClipboardList className="h-4 w-4 shrink-0 text-brand-600" />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-pink">
                    {formFillStatusLabel(fill.status)} · {updated}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
