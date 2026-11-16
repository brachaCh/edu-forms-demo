"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  addSpecialEdClass,
  archiveSpecialEdClass,
  countStudentsInSpecialEdClass,
  deleteSpecialEdClassWithStudents,
  getKnownSpecialEdClassNames,
  removeEmptySpecialEdClass,
} from "@/lib/special-ed-classes";
import { archiveStudentFile } from "@/lib/archive-student-file";
import { deleteStudent } from "@/lib/mock-store";
import { PlanLimitError } from "@/lib/plan-limits";
import {
  canAccessSpecialEdClasses,
  canCreateAnotherSpecialEdClass,
} from "@/lib/plan-limits-client";
import {
  sectorFrameworkHref,
  sectorSpecialEdClassHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

interface SpecialEdClassListProps {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

export function SpecialEdClassList({
  sector,
  framework = "special",
  area = "personal-area",
}: SpecialEdClassListProps) {
  const router = useRouter();
  const { ready: dataReady } = useDataStore();
  const { texts } = useSiteText();
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [askAdd, setAskAdd] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [canAddClass, setCanAddClass] = useState(false);
  const [canCreateClass, setCanCreateClass] = useState(false);

  useEffect(() => {
    if (!dataReady) return;
    const category = sector ?? "schools";
    void (async () => {
      await removeEmptySpecialEdClass("בבברכי", category);
      setReady(true);
      setCanAddClass(canAccessSpecialEdClasses());
      setCanCreateClass(canCreateAnotherSpecialEdClass(category));
      setVersion((v) => v + 1);
    })();
  }, [dataReady, sector]);

  const classes = useMemo(() => {
    if (!ready) return [];
    return getKnownSpecialEdClassNames(sector ?? "schools");
  }, [ready, sector, version]);

  useEffect(() => {
    if (!ready) return;
    setCanCreateClass(canCreateAnotherSpecialEdClass(sector ?? "schools"));
  }, [ready, sector, version]);

  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const name of classes) {
      next[name] = countStudentsInSpecialEdClass(name, sector ?? "schools");
    }
    return next;
  }, [classes, sector]);

  async function handleAdd() {
    const name = draftName.trim();
    if (!name) {
      setError(
        getTextByPath(texts, "status.specialEdClassNameRequired") ||
          "יש להזין שם כיתה"
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const key = await addSpecialEdClass(name, sector ?? "schools");
      setAskAdd(false);
      setDraftName("");
      setVersion((v) => v + 1);
      const href = sector
        ? sectorSpecialEdClassHref(sector, key, framework, area)
        : `/personal-area/category/special-ed-class/class/${encodeURIComponent(key)}`;
      router.push(href);
    } catch (error) {
      if (error instanceof PlanLimitError) {
        setError(error.message);
        return;
      }
      if (error instanceof Error && error.message === "CLASS_NAME_REQUIRED") {
        setError(
          getTextByPath(texts, "status.specialEdClassNameRequired") ||
            "יש להזין שם כיתה"
        );
        return;
      }
      setError("לא הצלחנו להוסיף כיתה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const className = deleteTarget;
    const studentCount = counts[className] ?? 0;
    setBusy(true);
    setDeleteError(null);
    try {
      const category = sector ?? "schools";
      if (studentCount === 0) {
        await removeEmptySpecialEdClass(className, category);
      } else {
        const result = await deleteSpecialEdClassWithStudents(
          className,
          category,
          { deleteStudent }
        );
        if (!result.ok) {
          setDeleteError(
            `לא ניתן היה למחוק חלק מהתלמידים: ${result.failures.slice(0, 3).join(", ")}${result.failures.length > 3 ? "..." : ""}`
          );
          setVersion((v) => v + 1);
          return;
        }
      }
      setDeleteTarget(null);
      setVersion((v) => v + 1);
    } catch {
      setDeleteError(
        getTextByPath(texts, "status.specialEdClassDeleteError") ||
          "לא ניתן למחוק את הכיתה כרגע — נסו שוב"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    const className = archiveTarget;
    setBusy(true);
    setArchiveError(null);
    try {
      const category = sector ?? "schools";
      const result = await archiveSpecialEdClass(className, category, {
        deleteStudent,
        archiveStudentFile,
      });
      if (!result.ok) {
        setArchiveError(
          `לא ניתן היה להעביר חלק מהתלמידים לארכיון: ${result.failures.slice(0, 3).join(", ")}${result.failures.length > 3 ? "..." : ""}`
        );
        setVersion((v) => v + 1);
        return;
      }
      setArchiveTarget(null);
      setVersion((v) => v + 1);
      router.push("/personal-area/archive");
      router.refresh();
    } catch {
      setArchiveError(
        getTextByPath(texts, "status.specialEdClassArchiveError") ||
          "לא ניתן להעביר לארכיון כרגע — נסו שוב"
      );
    } finally {
      setBusy(false);
    }
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
        <EditableText path="status.specialEdClassListTitle" />
      </h2>

      {canAddClass ? (
        <div className="mb-4 flex flex-col items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canCreateClass}
            onClick={() => {
              setError(null);
              setDraftName("");
              setAskAdd(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <EditableText path="status.specialEdClassAdd" />
          </Button>
          {!canCreateClass ? (
            <p className="text-center text-sm text-destructive">
              הגעתם למכסת הכיתות/גנים בחבילה. אפשר לשייך תלמידים לכיתה קיימת או
              לשדרג את החבילה.
            </p>
          ) : null}
        </div>
      ) : null}

      {classes.length === 0 ? (
        <p className="mb-4 text-center text-sm text-pink">
          <EditableText path="status.specialEdClassEmpty" />
        </p>
      ) : (
        <nav className="flex flex-col gap-3">
          {classes.map((className) => (
            <div
              key={className}
              className="menu-item justify-between"
            >
              <Link
                href={
                  sector
                    ? sectorSpecialEdClassHref(
                        sector,
                        className,
                        framework,
                        area
                      )
                    : `/personal-area/category/special-ed-class/class/${encodeURIComponent(className)}`
                }
                className="flex min-w-0 flex-1 items-center justify-between gap-2"
              >
                <span className="text-lg font-bold text-pink">{className}</span>
                <span className="flex items-center gap-2 text-sm text-pink">
                  {counts[className] ?? 0}{" "}
                  <EditableText path="personalArea.recordsLabel" />
                  <ArrowLeft className="h-4 w-4" />
                </span>
              </Link>
              <div className="flex shrink-0 gap-1">
                {(counts[className] ?? 0) > 0 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={busy}
                    aria-label={`העברת כיתה ${className} לארכיון`}
                    onClick={() => {
                      setArchiveError(null);
                      setArchiveTarget(className);
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  disabled={busy}
                  aria-label={`מחיקת כיתה ${className}`}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(className);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </nav>
      )}

      <div className="mt-4">
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
      </div>

      <Dialog
        open={askAdd}
        onOpenChange={(open) => {
          if (busy) return;
          setAskAdd(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="status.specialEdClassAddTitle" as="span" />
            </DialogTitle>
            <DialogDescription>
              <EditableText path="status.specialEdClassNameLabel" as="span" />
            </DialogDescription>
          </DialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            disabled={busy}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleAdd()}
            >
              <EditableText path="status.specialEdClassAdd" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setAskAdd(false)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {getTextByPath(texts, "status.specialEdClassDeleteTitle") ||
                "מחיקת כיתה"}
            </DialogTitle>
            <DialogDescription>
              {(counts[deleteTarget ?? ""] ?? 0) > 0
                ? getTextByPath(
                    texts,
                    "status.specialEdClassDeleteWithStudentsDescription"
                  ) ||
                  `האם למחוק את הכיתה "${deleteTarget}" ואת כל ${counts[deleteTarget ?? ""] ?? 0} התלמידים? פעולה זו אינה הפיכה.`
                : getTextByPath(
                    texts,
                    "status.specialEdClassDeleteEmptyDescription"
                  ) || `האם למחוק את הכיתה "${deleteTarget}"?`}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <p className="text-sm font-medium text-ink">{deleteTarget}</p>
          ) : null}
          {deleteError ? (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDeleteConfirm()}
            >
              <Trash2 className="h-4 w-4" />
              {busy
                ? getTextByPath(texts, "status.specialEdClassDeleteBusy") ||
                  "מוחק…"
                : getTextByPath(texts, "status.specialEdClassDeleteConfirm") ||
                  "מחיקה"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) {
            setArchiveTarget(null);
            setArchiveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {getTextByPath(texts, "status.specialEdClassArchiveTitle") ||
                "העברת כיתה לארכיון"}
            </DialogTitle>
            <DialogDescription>
              {getTextByPath(
                texts,
                "status.specialEdClassArchiveDescription"
              ) ||
                `כל ${counts[archiveTarget ?? ""] ?? 0} התלמידים בכיתה "${archiveTarget}" יועברו לארכיון. ניתן לשחזר תלמידים מהארכיון בנפרד.`}
            </DialogDescription>
          </DialogHeader>
          {archiveTarget ? (
            <p className="text-sm font-medium text-ink">{archiveTarget}</p>
          ) : null}
          {archiveError ? (
            <p className="text-sm font-medium text-destructive">{archiveError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleArchiveConfirm()}
            >
              <Archive className="h-4 w-4" />
              {busy
                ? getTextByPath(texts, "status.specialEdClassArchiveBusy") ||
                  "מעביר לארכיון…"
                : getTextByPath(texts, "status.specialEdClassArchiveConfirm") ||
                  "העברה לארכיון"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setArchiveTarget(null)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
