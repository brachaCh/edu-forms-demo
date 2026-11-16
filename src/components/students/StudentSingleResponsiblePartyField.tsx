"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCanManageStudents, getUser, updateStudent } from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { useCardFieldOrder } from "@/components/students/CardFieldOrderContext";
import {
  FieldDragHandle,
  useFieldDropHandlers,
} from "@/components/students/FieldMoveControls";
import { coreFieldOrderId } from "@/lib/student-card";
import { cn } from "@/lib/utils";

const SINGLE_RESPONSIBLE_PARTY_ORDER_ID = coreFieldOrderId(
  "single_responsible_party"
);

interface StudentSingleResponsiblePartyFieldProps {
  student: Student;
  onStudentChange: (student: Student) => void;
}

function isUserInstitutionAdmin(): boolean {
  // Server isAdminOfActiveInstitution allows owner, membership admin, and is_admin.
  // getCanManageStudents() is the same set (session /api/auth/session).
  if (getCanManageStudents()) return true;
  const user = getUser();
  if (!user) return false;
  return user.is_institution_owner === true || user.is_admin === true;
}

export function StudentSingleResponsiblePartyField({
  student,
  onStudentChange,
}: StudentSingleResponsiblePartyFieldProps) {
  const { orderIndex, registerIds } = useCardFieldOrder();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<"true" | "false" | "">(
    student.single_responsible_party === true
      ? "true"
      : student.single_responsible_party === false
        ? "false"
        : ""
  );
  const [busy, setBusy] = useState(false);
  const isAdmin = isUserInstitutionAdmin();

  const isStaff = student.status === "integration-teacher";
  const { isDragging, dropProps } = useFieldDropHandlers(
    SINGLE_RESPONSIBLE_PARTY_ORDER_ID
  );

  useEffect(() => {
    registerIds("single-responsible-party", []);
  }, [registerIds]);

  useEffect(() => {
    setDraft(
      student.single_responsible_party === true
        ? "true"
        : student.single_responsible_party === false
          ? "false"
          : ""
    );
  }, [student.single_responsible_party]);

  if (isStaff || !isAdmin) return null;

  const current = student.single_responsible_party;
  const index = orderIndex(SINGLE_RESPONSIBLE_PARTY_ORDER_ID);

  async function save() {
    setBusy(true);
    try {
      const value =
        draft === "true" ? true : draft === "false" ? false : null;
      const updated = await updateStudent(student.id, {
        single_responsible_party: value,
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
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2",
        isDragging && "opacity-50"
      )}
      {...dropProps}
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <EditableText
              path="studentFields.singleResponsibleParty"
              as="div"
              block
              className="text-xs font-bold text-amber-700"
            />
          </div>
          <select
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value as "true" | "false" | "")
            }
            className="h-9 rounded-md border border-amber-300 bg-white px-3 text-sm"
          >
            <option value="">לא מוגדר</option>
            <option value="true">כן — אחראי יחיד (חד הורי / יתום / אפוטרופוס)</option>
            <option value="false">לא — שני הורים</option>
          </select>
          <p className="text-xs text-amber-600">
            כשמסומן «כן», ויתור הסודיות ידרוש חתימה אחת בלבד.
          </p>
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
                setDraft(
                  current === true
                    ? "true"
                    : current === false
                      ? "false"
                      : ""
                );
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FieldDragHandle fieldId={SINGLE_RESPONSIBLE_PARTY_ORDER_ID} />
          <div className="min-w-0 flex-1 text-start">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              <EditableText
                path="studentFields.singleResponsibleParty"
                as="div"
                block
                className="text-xs font-bold text-amber-700"
              />
            </div>
            <p className="text-sm text-amber-900">
              {current === true ? (
                <EditableText path="studentFields.singleResponsiblePartyYes" />
              ) : current === false ? (
                <EditableText path="studentFields.singleResponsiblePartyNo" />
              ) : (
                <span className="text-amber-600">לא מוגדר</span>
              )}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 border-amber-300"
            onClick={() => {
              setDraft(
                current === true
                  ? "true"
                  : current === false
                    ? "false"
                    : ""
              );
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
