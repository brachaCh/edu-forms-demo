"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { updateStudent } from "@/lib/mock-store";
import {
  calendarYearOptions,
  currentCalendarYear,
  formatHebrewYear,
  parseCalendarYear,
} from "@/lib/calendar-year";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import type { Student } from "@/lib/supabase/types";
import { rememberStudentForForms } from "@/lib/student-card";

interface StudentCalendarYearFieldProps {
  student: Student;
  onStudentChange: (student: Student) => void;
}

export function StudentCalendarYearField({
  student,
  onStudentChange,
}: StudentCalendarYearFieldProps) {
  const { texts } = useSiteText();
  const years = calendarYearOptions();
  const [draftYear, setDraftYear] = useState<number>(
    parseCalendarYear(student.calendar_year) ?? currentCalendarYear()
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraftYear(
      parseCalendarYear(student.calendar_year) ?? currentCalendarYear()
    );
  }, [student.id, student.calendar_year]);

  const dirty =
    draftYear !==
    (parseCalendarYear(student.calendar_year) ?? currentCalendarYear());

  async function handleSave() {
    setSaving(true);
    setSavedFlash(false);
    try {
      const updated = await updateStudent(student.id, {
        calendar_year: draftYear,
      });
      if (updated) {
        onStudentChange(updated);
        rememberStudentForForms(updated);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 px-3 py-3">
      <label
        htmlFor={`calendar-year-${student.id}`}
        className="mb-2 block text-center text-sm font-bold text-pink"
      >
        <EditableText path="studentFields.calendarYear" />
      </label>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
        <select
          id={`calendar-year-${student.id}`}
          value={draftYear}
          onChange={(e) =>
            setDraftYear(parseCalendarYear(e.target.value) ?? currentCalendarYear())
          }
          className="h-10 w-full rounded-md border-2 border-brand-200 bg-white px-3 text-sm font-bold text-ink focus-visible:border-brand-500 focus-visible:outline-none sm:max-w-[12rem]"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {formatHebrewYear(year)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
        >
          {saving ? (
            "שומר..."
          ) : (
            <>
              <Save className="h-4 w-4" />
              {getTextByPath(texts, "studentCard.calendarYearSave") ||
                "שמירת שנה"}
            </>
          )}
        </Button>
      </div>
      {savedFlash && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-brand-700">
          <Check className="h-3.5 w-3.5" />
          {getTextByPath(texts, "studentCard.calendarYearSaved") ||
            "השנה נשמרה"}
        </p>
      )}
    </div>
  );
}
