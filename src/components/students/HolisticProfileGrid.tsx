"use client";

import { Label } from "@/components/ui/label";
import type { FormFieldDef } from "@/lib/form-fields";
import { leftoverHolisticStudentProfile } from "@/lib/holistic-rubric";
import { cn } from "@/lib/utils";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";

const PROFILE_KEYS = [
  "environmental_data",
  "disability_background",
  "student_profile",
  "strengths",
  "areas_to_strengthen",
] as const;

export type HolisticProfileKey = (typeof PROFILE_KEYS)[number];

export function isHolisticProfileFieldKey(key: string): boolean {
  return (PROFILE_KEYS as readonly string[]).includes(key);
}

interface HolisticProfileGridProps {
  fields: FormFieldDef[];
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  fieldLabel: (field: FormFieldDef) => string;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}

function ProfileCell({
  field,
  value,
  onChange,
  label,
  className,
  emphasize,
  allowVoice,
  voiceRefineContext,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  emphasize?: boolean;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}) {
  const idAttr = `form-field-${field.key}`;
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-1.5 rounded-xl border-2 bg-white p-3 shadow-sm",
        emphasize
          ? "border-brand-500 bg-brand-50/40"
          : "border-brand-200",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Label
          htmlFor={idAttr}
          className={cn(
            "pt-0.5 text-center sm:text-right",
            emphasize && "text-base font-extrabold text-brand-800"
          )}
        >
          {label}
          {field.required ? " *" : ""}
        </Label>
        {allowVoice ? (
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <TypedTextRefineButton
              value={value}
              fieldLabel={label}
              refineContext={voiceRefineContext}
              onInsert={(t) => onChange(t)}
            />
            <VoiceRecordButton
              value={value}
              fieldLabel={label}
              refineContext={voiceRefineContext}
              onInsert={(t) => onChange(t)}
              size="sm"
            />
          </div>
        ) : null}
      </div>
      {field.hint ? (
        <p className="text-right text-[11px] leading-5 text-pink/90">
          {field.hint}
        </p>
      ) : null}
      <textarea
        id={idAttr}
        value={value}
        rows={field.rows ?? 4}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-[88px] w-full flex-1 rounded-md border-2 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none",
          emphasize ? "border-brand-300" : "border-brand-200"
        )}
      />
    </div>
  );
}

/**
 * פריסת מחוון הוליסטי:
 *        נתונים סביבתיים
 * רקע מוגבלות ← התלמיד → מוקדי כוח
 *         מוקדים לחיזוק
 *
 * «התלמיד» הוא כותרת המרכז בתרשים, לא שדה למילוי.
 * טקסט ישן ב-student_profile מוצג לקריאה בלבד כדי לא לאבד טיוטות.
 */
export function HolisticProfileGrid({
  fields,
  data,
  onChange,
  fieldLabel,
  allowVoice = false,
  voiceRefineContext,
}: HolisticProfileGridProps) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const env = byKey.get("environmental_data");
  const disability = byKey.get("disability_background");
  const student = byKey.get("student_profile");
  const strengths = byKey.get("strengths");
  const areas = byKey.get("areas_to_strengthen");
  const leftoverCenter = leftoverHolisticStudentProfile(data);

  if (!env || !disability || !strengths || !areas) {
    return null;
  }

  const centerLabel = student ? fieldLabel(student) : "התלמיד";

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      <p className="text-center text-xs font-medium text-pink">
        פרופיל תלמיד בראייה הוליסטית — לפי המחוון
      </p>

      <div className="mx-auto grid w-full max-w-4xl gap-2 sm:grid-cols-[1fr_minmax(0,1.15fr)_1fr] sm:grid-rows-[auto_auto_auto]">
        <ProfileCell
          field={env}
          value={data[env.key] ?? ""}
          onChange={(v) => onChange(env.key, v)}
          label={fieldLabel(env)}
          className="sm:col-start-2 sm:row-start-1"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

        <ProfileCell
          field={disability}
          value={data[disability.key] ?? ""}
          onChange={(v) => onChange(disability.key, v)}
          label={fieldLabel(disability)}
          className="sm:col-start-1 sm:row-start-2"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

        <div
          className={cn(
            "flex min-h-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-brand-500 bg-brand-50/40 p-3 shadow-sm",
            leftoverCenter ? "sm:min-h-[120px]" : "min-h-[88px]",
            "sm:col-start-2 sm:row-start-2"
          )}
        >
          <p className="text-center text-base font-extrabold text-brand-800">
            {centerLabel}
          </p>
          {leftoverCenter ? (
            <p
              className="w-full whitespace-pre-wrap text-right text-sm text-ink/90"
              data-legacy-student-profile=""
              aria-label="טקסט שמור מטיוטה קודמת"
            >
              {leftoverCenter}
            </p>
          ) : null}
        </div>

        <ProfileCell
          field={strengths}
          value={data[strengths.key] ?? ""}
          onChange={(v) => onChange(strengths.key, v)}
          label={fieldLabel(strengths)}
          className="sm:col-start-3 sm:row-start-2"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

        <ProfileCell
          field={areas}
          value={data[areas.key] ?? ""}
          onChange={(v) => onChange(areas.key, v)}
          label={fieldLabel(areas)}
          className="sm:col-start-2 sm:row-start-3"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />
      </div>
    </div>
  );
}
