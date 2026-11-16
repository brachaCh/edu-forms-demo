"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateStudent } from "@/lib/mock-store";
import type { IntegrationFrequency, Student } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { normalizeIntegrationFrequency } from "@/lib/integration-frequency";
import { useCardFieldOrder } from "@/components/students/CardFieldOrderContext";
import {
  FieldDragHandle,
  useFieldDropHandlers,
} from "@/components/students/FieldMoveControls";
import { INTEGRATION_FREQUENCY_ORDER_ID } from "@/lib/student-card";
import { cn } from "@/lib/utils";

interface StudentIntegrationFrequencyFieldProps {
  student: Student;
  onStudentChange: (student: Student) => void;
}

export function StudentIntegrationFrequencyField({
  student,
  onStudentChange,
}: StudentIntegrationFrequencyFieldProps) {
  const { orderIndex, registerIds } = useCardFieldOrder();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IntegrationFrequency>(
    normalizeIntegrationFrequency(student.integration_frequency) ?? "high"
  );
  const [busy, setBusy] = useState(false);

  const usesFrequency = student.status === "personal-basket";
  const { isDragging, dropProps } = useFieldDropHandlers(
    INTEGRATION_FREQUENCY_ORDER_ID
  );

  // המיקום בסדר מגיע מרשימת שדות הליבה של הסטטוס, לא מכאן
  useEffect(() => {
    registerIds("frequency", []);
  }, [registerIds]);

  if (!usesFrequency) return null;

  const current =
    normalizeIntegrationFrequency(student.integration_frequency) ?? "high";
  const index = orderIndex(INTEGRATION_FREQUENCY_ORDER_ID);

  async function save() {
    setBusy(true);
    try {
      const updated = await updateStudent(student.id, {
        integration_frequency: draft,
      });
      if (updated) onStudentChange(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ order: index < 0 ? 0 : index }}
      className={cn(
        "rounded-lg border border-brand-100 bg-white px-3 py-2",
        isDragging && "opacity-50"
      )}
      {...dropProps}
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <EditableText
            path="studentFields.integrationFrequency"
            as="div"
            block
            className="text-xs font-bold text-pink"
          />
          <select
            value={draft}
            onChange={(e) =>
              setDraft(
                normalizeIntegrationFrequency(e.target.value) ?? "high"
              )
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="high">שכיחות גבוהה</option>
            <option value="low">שכיחות נמוכה</option>
          </select>
          <div className="flex justify-end gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={busy}
              onClick={() => void save()}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setDraft(current);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FieldDragHandle fieldId={INTEGRATION_FREQUENCY_ORDER_ID} />
          <div className="min-w-0 flex-1 text-start">
            <EditableText
              path="studentFields.integrationFrequency"
              as="div"
              block
              className="text-xs font-bold text-pink"
            />
            <p className="text-sm text-ink">
              {current === "low" ? (
                <EditableText path="studentFields.frequencyLow" />
              ) : (
                <EditableText path="studentFields.frequencyHigh" />
              )}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => {
              setDraft(current);
              setEditing(true);
            }}
            aria-label="עריכה"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
