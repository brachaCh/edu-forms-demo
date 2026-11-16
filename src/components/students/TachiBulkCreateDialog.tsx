"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TachiBulkCreateResult } from "@/lib/personal-basket-tachi-bulk";
import {
  extractDomainRows,
  createTachiBulk,
} from "@/lib/personal-basket-tachi-bulk";

interface TachiBulkCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  formData: Record<string, string>;
  onComplete: (result: TachiBulkCreateResult) => void;
}

export function TachiBulkCreateDialog({
  open,
  onOpenChange,
  studentId,
  formData,
  onComplete,
}: TachiBulkCreateDialogProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domainRows = extractDomainRows(formData);

  async function handleCreate() {
    if (domainRows.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const response = await createTachiBulk(studentId, domainRows);
      const hasResults = response.created.length > 0 || response.skipped.length > 0;
      const partialError = !response.ok ? response.error : undefined;
      
      if (hasResults || partialError) {
        onComplete({
          created: response.created,
          skipped: response.skipped,
          error: partialError,
        });
      }
      if (partialError) {
        setError(partialError);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "שגיאה ביצירת התח״י";
      setError(errMsg);
      onComplete({ created: [], skipped: [], error: errMsg });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>פתיחת תח״י לכל תחום</DialogTitle>
          <DialogDescription>
            {domainRows.length > 0
              ? `ייווצר תח״י נפרד לכל אחד מ-${domainRows.length} התחומים המוגדרים בכרטיס.`
              : "לא הוגדרו תחומים בכרטיס."}
          </DialogDescription>
        </DialogHeader>

        {domainRows.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/50 p-3">
            <ul className="space-y-1 text-sm">
              {domainRows.map((row, index) => (
                <li key={index} className="flex items-start gap-2">
                  <FileText
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                    aria-hidden
                  />
                  <span>
                    <strong>{row.domain}</strong>
                    {row.mainGoal ? ` — ${row.mainGoal}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          אם כבר קיים תח״י לתחום מסוים, הוא לא ייווצר פעם נוספת.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            ביטול
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || domainRows.length === 0}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                יוצר…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                יצירת תח״י
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function formatTachiBulkResultMessage(
  result: TachiBulkCreateResult
): string {
  const parts: string[] = [];
  if (result.created.length > 0) {
    parts.push(`נוצרו ${result.created.length} תח״י: ${result.created.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    parts.push(
      `דולגו ${result.skipped.length} תחומים (כבר קיים תח״י): ${result.skipped.join(", ")}`
    );
  }
  if (result.error) {
    parts.push(result.error);
  }
  if (parts.length === 0) {
    return "לא נוצרו תח״י חדשים.";
  }
  return parts.join(". ");
}
