"use client";

import { Label } from "@/components/ui/label";
import type { FormFieldDef } from "@/lib/form-fields";
import { cn } from "@/lib/utils";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";

const CLUSTER_KEYS = [
  "sacred_studies",
  "language",
  "life_skills",
  "emotional_behavioral",
  "math",
  "motor_sensory",
  "sciences",
] as const;

export type LearningClusterKey = (typeof CLUSTER_KEYS)[number];

const CLUSTER_EXAMPLES: Record<LearningClusterKey, string> = {
  sacred_studies: "תורה · נביא · יהדות · דינים · פרשת שבוע · פרקי אבות · ביאורי תפילה",
  language: "הבעה בעל פה · קריאה · כתיבה · כתיב · הבעה בכתב · הבנת הנקרא · לשון · דקדוק · עברית · אנגלית",
  life_skills: "עצמאות · אחריות · ידע עולם · פתרון בעיות · זה״ב · שיעורי קלינאית תקשורת",
  emotional_behavioral: "תקשורת בין־אישית · כללי התנהגות · עיצוב התנהגות · מרפאות רגשיות",
  math: "חשבון · הנדסה",
  motor_sensory: "התעמלות · מלאכה · ציור · שחייה · מרפאה בעיסוק",
  sciences: "גיאוגרפיה · טבע · מולדת · מחשבים · טכנולוגיה",
};

export function isLearningClusterFieldKey(key: string): boolean {
  return (CLUSTER_KEYS as readonly string[]).includes(key);
}

interface LearningClustersGridProps {
  fields: FormFieldDef[];
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  fieldLabel: (field: FormFieldDef) => string;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}

export function LearningClustersGrid({
  fields,
  data,
  onChange,
  fieldLabel,
  allowVoice = false,
  voiceRefineContext,
}: LearningClustersGridProps) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const clusters = CLUSTER_KEYS.map((key) => byKey.get(key)).filter(
    (f): f is FormFieldDef => Boolean(f)
  );

  if (clusters.length === 0) return null;

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <p className="text-center text-xs font-medium text-pink">
        תחומי ההוראה נחלקים לאשכולות עיקריים — מלאו את הרלוונטיים לכיתה
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((field) => {
          const key = field.key as LearningClusterKey;
          const idAttr = `form-field-${field.key}`;
          const value = data[field.key] ?? "";
          const label = fieldLabel(field);
          const examples = CLUSTER_EXAMPLES[key];
          return (
            <div
              key={field.key}
              className={cn(
                "flex min-h-0 flex-col gap-1.5 rounded-xl border-2 border-brand-200 bg-white p-3 shadow-sm",
                key === "sciences" && "sm:col-span-2 lg:col-span-1"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Label
                  htmlFor={idAttr}
                  className="pt-0.5 text-center text-sm font-bold text-brand-800 sm:text-right"
                >
                  {label}
                </Label>
                {allowVoice ? (
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    <TypedTextRefineButton
                      value={value}
                      fieldLabel={label}
                      refineContext={voiceRefineContext}
                      onInsert={(t) => onChange(field.key, t)}
                    />
                    <VoiceRecordButton
                      value={value}
                      fieldLabel={label}
                      refineContext={voiceRefineContext}
                      onInsert={(t) => onChange(field.key, t)}
                      size="sm"
                    />
                  </div>
                ) : null}
              </div>
              {examples ? (
                <p className="text-right text-[11px] leading-5 text-pink/90">
                  {examples}
                </p>
              ) : null}
              <textarea
                id={idAttr}
                value={value}
                rows={field.rows ?? 3}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="min-h-[72px] w-full flex-1 rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
