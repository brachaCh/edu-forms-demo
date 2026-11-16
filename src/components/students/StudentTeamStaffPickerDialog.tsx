"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getStaffTeachers } from "@/lib/mock-store";
import type { PersonalSector } from "@/lib/personal-sector";
import { canUseSupabase, fetchInstitutionStaffForPicker } from "@/lib/supabase-db";
import {
  applyStaffPicksToStudentTeam,
  existingStudentTeamNames,
  toInstitutionStaffPickerRow,
  type InstitutionStaffPickerRow,
} from "@/lib/student-team-staff";
import { cn } from "@/lib/utils";

interface StudentTeamStaffPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: PersonalSector;
  data: Record<string, string>;
  onApply: (next: Record<string, string>) => void;
}

export function StudentTeamStaffPickerDialog({
  open,
  onOpenChange,
  category,
  data,
  onApply,
}: StudentTeamStaffPickerDialogProps) {
  const [teachers, setTeachers] = useState<InstitutionStaffPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    async function load() {
      try {
        const rows = canUseSupabase()
          ? await fetchInstitutionStaffForPicker(category)
          : getStaffTeachers(category).map(toInstitutionStaffPickerRow);
        if (cancelled) return;
        setTeachers(
          [...rows].sort((a, b) =>
            a.full_name.localeCompare(b.full_name, "he")
          )
        );
      } catch {
        if (!cancelled) {
          setTeachers([]);
          setLoadError("לא ניתן לטעון את רשימת הצוות כרגע.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, category]);

  const alreadyInTable = useMemo(
    () => (open ? existingStudentTeamNames(data) : new Set<string>()),
    [open, data]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const initial = new Set<string>();
    for (const teacher of teachers) {
      const name = teacher.full_name.trim().toLowerCase().replace(/\s+/g, " ");
      if (name && alreadyInTable.has(name)) {
        initial.add(teacher.id);
      }
    }
    setSelectedIds(initial);
  }, [open, teachers, alreadyInTable]);

  const selectable = useMemo(
    () =>
      teachers.filter((teacher) => {
        const name = teacher.full_name.trim().toLowerCase().replace(/\s+/g, " ");
        return name && !alreadyInTable.has(name);
      }),
    [teachers, alreadyInTable]
  );

  function toggle(teacher: InstitutionStaffPickerRow, checked: boolean) {
    const name = teacher.full_name.trim().toLowerCase().replace(/\s+/g, " ");
    if (alreadyInTable.has(name)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(teacher.id);
      else next.delete(teacher.id);
      return next;
    });
  }

  function selectAllSelectable() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const teacher of selectable) next.add(teacher.id);
      return next;
    });
  }

  function clearSelectable() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const teacher of selectable) next.delete(teacher.id);
      return next;
    });
  }

  function confirm() {
    const picks = teachers
      .filter((teacher) => selectedIds.has(teacher.id))
      .map((teacher) => ({
        name: teacher.full_name,
        role: teacher.role,
        phone: teacher.phone,
      }));
    onApply(applyStaffPicksToStudentTeam(data, picks));
    onOpenChange(false);
  }

  const newSelectionCount = selectable.filter((t) =>
    selectedIds.has(t.id)
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>בחירה מצוות המוסד</DialogTitle>
          <DialogDescription>
            בחרו אנשי צוות חינוך מיוחד שיתווספו לטבלת צוות התלמיד. אפשר לערוך
            תפקיד וטלפון אחרי הבחירה.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-center text-sm text-pink">
            טוען את צוות המוסד…
          </p>
        ) : loadError ? (
          <p className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-center text-sm text-pink">
            {loadError}
          </p>
        ) : teachers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-center text-sm text-pink">
            עדיין אין צוות חינוך מיוחד במוסד. הוסיפו אנשי צוות באזור האישי ואז
            חזרו לכאן.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {selectable.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={selectAllSelectable}
                >
                  בחירת כולם
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelectable}
                >
                  ניקוי בחירה
                </Button>
              </div>
            ) : null}

            <ul className="max-h-[min(50vh,22rem)] space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {teachers.map((teacher) => {
                const nameKey = teacher.full_name
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, " ");
                const already = alreadyInTable.has(nameKey);
                const checked = selectedIds.has(teacher.id);
                const role = teacher.role?.trim() ?? "";
                const phone = teacher.phone?.trim() ?? "";

                return (
                  <li key={teacher.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm transition",
                        already
                          ? "cursor-default bg-slate-50 text-pink"
                          : checked
                            ? "bg-brand-50 text-ink"
                            : "text-ink hover:bg-slate-50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={already}
                        onCheckedChange={(value) =>
                          toggle(teacher, value === true)
                        }
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-right">
                        <span className="font-medium">{teacher.full_name}</span>
                        {(role || phone || already) && (
                          <span className="text-xs text-pink">
                            {[role, phone, already ? "כבר בטבלה" : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            disabled={
              loading || teachers.length === 0 || newSelectionCount === 0
            }
            onClick={confirm}
          >
            <Users className="h-4 w-4" />
            הוספה לטבלה
            {newSelectionCount > 0 ? ` (${newSelectionCount})` : ""}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
