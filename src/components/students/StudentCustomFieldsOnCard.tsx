"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Check, X } from "lucide-react";
import {
  addStatusSharedCustomField,
  ensureStatusSharedCustomFields,
  getStudentCustomFields,
  getStudents,
  renameStatusSharedCustomField,
  updateStudentCustomField,
} from "@/lib/mock-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableText } from "@/components/editable/EditableText";
import { EditableFieldLabel } from "@/components/editable/EditableFieldLabel";
import { useCardFieldOrder } from "@/components/students/CardFieldOrderContext";
import {
  FieldDragHandle,
  useFieldDropHandlers,
} from "@/components/students/FieldMoveControls";
import { customLabelOrderId } from "@/lib/student-card";
import { cn } from "@/lib/utils";
import type { StudentCustomField, StudentStatus } from "@/lib/supabase/types";

interface StudentCustomFieldsOnCardProps {
  studentId: string;
}

function CustomFieldCard({
  field,
  fieldOrderId,
  editingId,
  draftValue,
  busyId,
  allowManage,
  setDraftValue,
  startEditValue,
  saveValue,
  cancelEdit,
  saveLabel,
}: {
  field: StudentCustomField;
  fieldOrderId: string;
  editingId: string | null;
  draftValue: string;
  busyId: string | null;
  allowManage: boolean;
  setDraftValue: (v: string) => void;
  startEditValue: (id: string, value: string) => void;
  saveValue: (id: string) => Promise<void>;
  cancelEdit: () => void;
  saveLabel: (id: string, label: string) => Promise<void>;
}) {
  const { orderIndex } = useCardFieldOrder();
  const index = orderIndex(fieldOrderId);
  const { isDragging, dropProps } = useFieldDropHandlers(fieldOrderId);

  const labelNode = allowManage ? (
    <EditableFieldLabel
      value={field.label}
      onSave={(next) => saveLabel(field.id, next)}
      className="text-xs font-semibold text-pink/80"
    />
  ) : (
    <div className="text-xs font-semibold text-pink/80">{field.label}</div>
  );

  return (
    <div
      style={{ order: index < 0 ? 0 : index }}
      className={cn(
        "rounded-lg border border-border bg-white px-3 py-2 shadow-sm",
        isDragging && "opacity-50"
      )}
      {...dropProps}
    >
      {editingId === field.id ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1">
              {allowManage ? (
                <EditableFieldLabel
                  value={field.label}
                  onSave={(next) => saveLabel(field.id, next)}
                  className="text-xs font-bold text-pink"
                />
              ) : (
                <div className="text-xs font-bold text-pink">{field.label}</div>
              )}
            </div>
            <Input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={() => void saveValue(field.id)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={busyId === field.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void saveValue(field.id)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancelEdit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {allowManage ? <FieldDragHandle fieldId={fieldOrderId} /> : null}
          <div className="min-w-0 flex-1 text-start">
            {labelNode}
            <div className="truncate text-sm font-bold text-pink">
              {field.value || "—"}
            </div>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={busyId === field.id}
              onClick={() => startEditValue(field.id, field.value)}
              aria-label="עריכת ערך"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentCustomFieldsOnCard({
  studentId,
}: StudentCustomFieldsOnCardProps) {
  const { registerIds } = useCardFieldOrder();
  const [status, setStatus] = useState<StudentStatus | null>(
    () => getStudents().find((s) => s.id === studentId)?.status ?? null
  );
  const [category, setCategory] = useState<string | null>(
    () => getStudents().find((s) => s.id === studentId)?.category ?? null
  );
  const [fields, setFields] = useState(() =>
    getStudentCustomFields(studentId)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const allowManage = status !== "integration-teacher";

  const draftRef = useRef({ editingId, draftValue, studentId });
  draftRef.current = { editingId, draftValue, studentId };

  useEffect(() => {
    let cancelled = false;
    const found = getStudents().find((s) => s.id === studentId);
    setStatus(found?.status ?? null);
    setCategory(found?.category ?? null);
    void (async () => {
      const next = await ensureStatusSharedCustomFields(studentId);
      if (!cancelled) setFields(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    return () => {
      const draft = draftRef.current;
      if (!draft.editingId) return;
      void updateStudentCustomField(draft.editingId, {
        value: draft.draftValue.trim(),
      });
    };
  }, [studentId]);

  const orderIds = useMemo(
    () => fields.map((field) => customLabelOrderId(field.label)),
    [fields]
  );

  useEffect(() => {
    registerIds("custom", orderIds);
  }, [orderIds, registerIds]);

  async function refresh() {
    setFields(await ensureStatusSharedCustomFields(studentId));
  }

  function startEditValue(fieldId: string, value: string) {
    setEditingId(fieldId);
    setDraftValue(value);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftValue("");
  }

  async function saveValue(fieldId: string) {
    setBusyId(fieldId);
    try {
      await updateStudentCustomField(fieldId, {
        value: draftValue.trim(),
      });
      await refresh();
      cancelEdit();
    } finally {
      setBusyId(null);
    }
  }

  async function saveLabel(fieldId: string, label: string) {
    setBusyId(fieldId);
    try {
      const current = fields.find((field) => field.id === fieldId);
      if (current) {
        await renameStatusSharedCustomField(
          fieldId,
          current.label,
          label,
          status,
          category
        );
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd() {
    if (adding) return;
    const label =
      newFieldName.trim() || `שדה נוסף ${fields.length + 1}`;
    setAdding(true);
    try {
      await addStatusSharedCustomField(studentId, label, "");
      setNewFieldName("");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      {fields.map((field) => {
        const fieldOrderId = customLabelOrderId(field.label);
        return (
          <CustomFieldCard
            key={field.id}
            field={field}
            fieldOrderId={fieldOrderId}
            editingId={editingId}
            draftValue={draftValue}
            busyId={busyId}
            allowManage={allowManage}
            setDraftValue={setDraftValue}
            startEditValue={startEditValue}
            saveValue={saveValue}
            cancelEdit={cancelEdit}
            saveLabel={saveLabel}
          />
        );
      })}

      {allowManage ? (
        <div
          style={{ order: 9999 }}
          className="rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2"
        >
          <EditableText
            path="studentCustomFields.addTitle"
            as="div"
            block
            className="mb-1.5 text-center text-xs font-bold text-pink"
          />
          <div className="flex gap-2">
            <Input
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder=""
              className="h-9 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={adding}
              onClick={() => void handleAdd()}
            >
              <Plus className="h-4 w-4" />
              <EditableText path="studentCustomFields.addButton" />
            </Button>
          </div>
        </div>
      ) : null}

    </>
  );
}
