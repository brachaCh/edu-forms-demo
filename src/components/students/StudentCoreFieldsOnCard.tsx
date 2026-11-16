"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateStudent } from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import {
  CORE_FIELD_DEFS,
  coreFieldLabelPath,
  coreFieldOrderId,
  coreFieldValue,
  coreFieldsForStatus,
  coreNameSavePatch,
  DEDICATED_CORE_FIELDS,
  getHiddenCoreFields,
  isNamePartField,
  rememberStudentForForms,
  type CoreFieldKey,
} from "@/lib/student-card";
import { buildMisfiledContactRepairPatch, routeCoreFieldSavePatch } from "@/lib/form-fields";
import { TeamRoleField } from "@/components/students/TeamRoleField";
import {
  formatStudentDisplayName,
  joinPersonName,
  splitPersonName,
} from "@/lib/person-name";
import { useCardFieldOrder } from "@/components/students/CardFieldOrderContext";
import {
  FieldDragHandle,
  useFieldDropHandlers,
} from "@/components/students/FieldMoveControls";
import { cn } from "@/lib/utils";
import { studentNeedsIntegrationRenewalAlert } from "@/lib/integration-renewal";

/** תצוגת תאריך: 2010-05-14 → 14/05/2010 */
function formatBirthDateForDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

interface StudentCoreFieldsOnCardProps {
  student: Student;
  onStudentChange: (student: Student) => void;
}

function CoreFieldCard({
  field,
  student,
  isStaff,
  editingKey,
  draftValue,
  draftFirst,
  draftLast,
  busyKey,
  setDraftValue,
  setDraftFirst,
  setDraftLast,
  startEdit,
  saveEdit,
  setEditingKey,
  renderNameDisplay,
  renewalToday,
}: {
  field: (typeof CORE_FIELD_DEFS)[number];
  student: Student;
  isStaff: boolean;
  editingKey: CoreFieldKey | null;
  draftValue: string;
  draftFirst: string;
  draftLast: string;
  busyKey: CoreFieldKey | null;
  setDraftValue: (v: string) => void;
  setDraftFirst: (v: string) => void;
  setDraftLast: (v: string) => void;
  startEdit: (key: CoreFieldKey) => void;
  saveEdit: (key: CoreFieldKey, explicitValue?: string) => Promise<void>;
  setEditingKey: (key: CoreFieldKey | null) => void;
  renderNameDisplay: () => string;
  renewalToday: Date | null;
}) {
  const fieldOrderId = coreFieldOrderId(field.key);
  const { orderIndex } = useCardFieldOrder();
  const index = orderIndex(fieldOrderId);
  const { isDragging, dropProps } = useFieldDropHandlers(fieldOrderId);

  return (
    <div
      style={{ order: index < 0 ? 0 : index }}
      className={cn(
        "rounded-lg border border-border bg-white px-3 py-2 shadow-sm",
        isDragging && "opacity-50"
      )}
      {...dropProps}
    >
      {editingKey === field.key ? (
        <div className="flex flex-col gap-2">
          {field.key === "full_name" && !isStaff ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <EditableText
                  path="studentFields.firstName"
                  as="div"
                  block
                  className="mb-1 text-xs font-bold text-pink"
                />
                <Input
                  value={draftFirst}
                  onChange={(e) => setDraftFirst(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <EditableText
                  path="studentFields.lastName"
                  as="div"
                  block
                  className="mb-1 text-xs font-bold text-pink"
                />
                <Input
                  value={draftLast}
                  onChange={(e) => setDraftLast(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <EditableText
                path={coreFieldLabelPath(field.key, student.status)}
                as="div"
                block
                className="mb-1 text-xs font-bold text-pink"
              />
              {field.inputType === "team-role" ? (
                <TeamRoleField
                  value={draftValue}
                  onChange={setDraftValue}
                  onBlur={(committed) => void saveEdit(field.key, committed)}
                />
              ) : field.inputType === "select" && field.options ? (
                <select
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onBlur={() => void saveEdit(field.key)}
                  className="flex h-8 w-full rounded-md border border-input bg-white px-2 text-sm"
                  autoFocus
                >
                  <option value="">—</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={
                    field.inputType === "date"
                      ? "date"
                      : field.inputType === "tel"
                        ? "tel"
                        : field.inputType === "email"
                          ? "email"
                          : "text"
                  }
                  dir={
                    field.inputType === "tel" || field.inputType === "email"
                      ? "ltr"
                      : undefined
                  }
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onBlur={() => void saveEdit(field.key)}
                  className="h-8 text-sm"
                  autoFocus
                />
              )}
            </div>
          )}
          <div className="flex justify-end gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={busyKey === field.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void saveEdit(field.key)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditingKey(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FieldDragHandle fieldId={fieldOrderId} />
          <div className="min-w-0 flex-1 text-start">
            <EditableText
              path={coreFieldLabelPath(field.key, student.status)}
              as="div"
              block
              className="text-xs font-semibold text-pink/80"
            />
            <div
              className="break-words text-sm font-bold text-pink"
              dir={
                field.inputType === "tel" || field.inputType === "email"
                  ? "ltr"
                  : undefined
              }
            >
              {field.key === "full_name"
                ? renderNameDisplay()
                : field.inputType === "date"
                  ? formatBirthDateForDisplay(coreFieldValue(student, field.key))
                  : coreFieldValue(student, field.key) || "—"}
            </div>
            {field.key === "integration_start_date" &&
            renewalToday &&
            studentNeedsIntegrationRenewalAlert(student, renewalToday) ? (
              <p className="mt-1 text-xs font-semibold text-amber-800">
                <EditableText path="personalArea.integrationRenewalAlertTitle" />
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={busyKey === field.key}
              onClick={() => startEdit(field.key)}
              aria-label="עריכה"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentCoreFieldsOnCard({
  student,
  onStudentChange,
}: StudentCoreFieldsOnCardProps) {
  const isStaff = student.status === "integration-teacher";
  const { registerIds } = useCardFieldOrder();
  const [hidden, setHidden] = useState<CoreFieldKey[]>(() =>
    getHiddenCoreFields(student.id, student.status, student.category)
  );
  const [editingKey, setEditingKey] = useState<CoreFieldKey | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [draftFirst, setDraftFirst] = useState("");
  const [draftLast, setDraftLast] = useState("");
  const [busyKey, setBusyKey] = useState<CoreFieldKey | null>(null);
  const [renewalToday, setRenewalToday] = useState<Date | null>(null);

  useEffect(() => {
    setRenewalToday(new Date());
  }, []);

  const draftRef = useRef({
    editingKey,
    draftValue,
    draftFirst,
    draftLast,
    student,
  });
  draftRef.current = {
    editingKey,
    draftValue,
    draftFirst,
    draftLast,
    student,
  };

  useEffect(() => {
    setHidden(
      getHiddenCoreFields(student.id, student.status, student.category)
    );
    rememberStudentForForms(student);
  }, [student.id, student.status, student.category]);

  useEffect(() => {
    const patch = buildMisfiledContactRepairPatch(student);
    if (!patch) return;
    let cancelled = false;
    void updateStudent(student.id, patch).then((updated) => {
      if (cancelled || !updated) return;
      onStudentChange(updated);
      rememberStudentForForms(updated);
    });
    return () => {
      cancelled = true;
    };
    // רק כשנפתח כרטיס / מתחלף תלמיד — לא בלופ על כל עדכון
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  useEffect(() => {
    rememberStudentForForms(student);
  }, [student]);

  useEffect(() => {
    return () => {
      const draft = draftRef.current;
      if (!draft.editingKey) return;
      const key = draft.editingKey;
      let patch: Partial<Student>;
      if (key === "full_name") {
        if (draft.student.status === "integration-teacher") {
          patch = { full_name: draft.draftValue.trim() };
        } else {
          patch = {
            full_name: joinPersonName(draft.draftFirst, draft.draftLast),
          };
        }
      } else if (isNamePartField(key)) {
        patch = coreNameSavePatch(draft.student, key, draft.draftValue);
      } else {
        patch = routeCoreFieldSavePatch(key, draft.draftValue);
      }
      void updateStudent(draft.student.id, patch).then((updated) => {
        if (updated) rememberStudentForForms(updated);
      });
    };
  }, [student.id]);

  const orderedKeys = useMemo(
    () =>
      coreFieldsForStatus(student.status).filter(
        (key) => !hidden.includes(key)
      ),
    [hidden, student.status]
  );

  // שדות עם רכיב ייעודי (שכיחות) שומרים על מקומם בסדר אך מרונדרים בנפרד
  const visibleFields = useMemo(
    () =>
      orderedKeys
        .filter((key) => !DEDICATED_CORE_FIELDS.includes(key))
        .map((key) => CORE_FIELD_DEFS.find((field) => field.key === key))
        .filter((field): field is (typeof CORE_FIELD_DEFS)[number] =>
          Boolean(field)
        ),
    [orderedKeys]
  );

  const orderIds = useMemo(
    () => orderedKeys.map((key) => coreFieldOrderId(key)),
    [orderedKeys]
  );

  useEffect(() => {
    registerIds("core", orderIds);
  }, [orderIds, registerIds]);

  function startEdit(key: CoreFieldKey) {
    // שומרים את השדה הקודם לפני מעבר לעריכה אחרת — מונע ערבוב ערכים
    const prev = draftRef.current;
    if (prev.editingKey && prev.editingKey !== key) {
      void flushEdit(prev.editingKey, {
        draftValue: prev.draftValue,
        draftFirst: prev.draftFirst,
        draftLast: prev.draftLast,
      });
    }

    setEditingKey(key);
    if (key === "full_name" && !isStaff) {
      const parts = splitPersonName(student.full_name ?? "");
      setDraftFirst(parts.first_name);
      setDraftLast(parts.last_name);
      setDraftValue("");
      return;
    }
    setDraftValue(coreFieldValue(student, key));
  }

  async function flushEdit(
    key: CoreFieldKey,
    draft: { draftValue: string; draftFirst: string; draftLast: string }
  ) {
    setBusyKey(key);
    try {
      let patch: Partial<Student>;
      if (key === "full_name") {
        if (isStaff) {
          patch = { full_name: draft.draftValue.trim() };
        } else {
          patch = {
            full_name: joinPersonName(draft.draftFirst, draft.draftLast),
          };
        }
      } else if (isNamePartField(key)) {
        patch = coreNameSavePatch(student, key, draft.draftValue);
      } else {
        patch = routeCoreFieldSavePatch(key, draft.draftValue);
      }
      const updated = await updateStudent(student.id, patch);
      if (updated) {
        onStudentChange(updated);
        rememberStudentForForms(updated);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function saveEdit(key: CoreFieldKey, explicitValue?: string) {
    const draft = draftRef.current;
    const draftValueToSave =
      explicitValue !== undefined ? explicitValue : draft.draftValue;
    if (explicitValue !== undefined) {
      setDraftValue(explicitValue);
    }
    await flushEdit(key, {
      draftValue: draftValueToSave,
      draftFirst: draft.draftFirst,
      draftLast: draft.draftLast,
    });
    setEditingKey(null);
  }

  function renderNameDisplay() {
    const display = formatStudentDisplayName(student.full_name);
    if (isStaff) {
      return display || "—";
    }
    const { first_name, last_name } = splitPersonName(display);
    if (!last_name) return display || "—";
    return `${first_name} ${last_name}`;
  }

  return (
    <>
      {visibleFields.map((field) => (
        <CoreFieldCard
          key={field.key}
          field={field}
          student={student}
          isStaff={isStaff}
          editingKey={editingKey}
          draftValue={draftValue}
          draftFirst={draftFirst}
          draftLast={draftLast}
          busyKey={busyKey}
          setDraftValue={setDraftValue}
          setDraftFirst={setDraftFirst}
          setDraftLast={setDraftLast}
          startEdit={startEdit}
          saveEdit={saveEdit}
          setEditingKey={setEditingKey}
          renderNameDisplay={renderNameDisplay}
          renewalToday={renewalToday}
        />
      ))}
    </>
  );
}
