"use client";

import { Label } from "@/components/ui/label";
import type { FormFieldDef } from "@/lib/form-fields";
import { cn } from "@/lib/utils";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";

const CLASS_PROFILE_KEYS = [
  "class_definition",
  "resources",
  "class_goal",
  "strengths",
  "areas_to_strengthen",
] as const;

export type ClassProfileKey = (typeof CLASS_PROFILE_KEYS)[number];

export function isClassProfileFieldKey(key: string): boolean {
  return (CLASS_PROFILE_KEYS as readonly string[]).includes(key);
}

interface ClassProfileGridProps {
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
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
              size="md"
              className="shrink-0"
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
 * פריסת פרופיל כיתה (תל"כ) — כמו מחוון הוליסטי:
 *        הגדרת הכיתה
 * משאבים ← מטרה כיתתית → מוקדי כוח
 *         מוקדים לחיזוק
 */
export function ClassProfileGrid({
  fields,
  data,
  onChange,
  fieldLabel,
  allowVoice = false,
  voiceRefineContext,
}: ClassProfileGridProps) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const definition = byKey.get("class_definition");
  const resources = byKey.get("resources");
  const goal = byKey.get("class_goal");
  const strengths = byKey.get("strengths");
  const areas = byKey.get("areas_to_strengthen");

  if (!definition || !resources || !goal || !strengths || !areas) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      <p className="text-center text-xs font-medium text-pink">
        פרופיל כיתה — מוקדי כוח, חיזוק ומטרות
      </p>

      <div className="mx-auto grid w-full max-w-4xl gap-2 sm:grid-cols-[1fr_minmax(0,1.15fr)_1fr] sm:grid-rows-[auto_auto_auto]">
        <ProfileCell
          field={definition}
          value={data[definition.key] ?? ""}
          onChange={(v) => onChange(definition.key, v)}
          label={fieldLabel(definition)}
          className="sm:col-start-2 sm:row-start-1"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

        <ProfileCell
          field={resources}
          value={data[resources.key] ?? ""}
          onChange={(v) => onChange(resources.key, v)}
          label={fieldLabel(resources)}
          className="sm:col-start-1 sm:row-start-2"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

        <ProfileCell
          field={goal}
          value={data[goal.key] ?? ""}
          onChange={(v) => onChange(goal.key, v)}
          label={fieldLabel(goal)}
          emphasize
          className="sm:col-start-2 sm:row-start-2"
          allowVoice={allowVoice}
          voiceRefineContext={voiceRefineContext}
        />

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
