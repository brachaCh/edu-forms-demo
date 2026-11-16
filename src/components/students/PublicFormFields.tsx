"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormRowTable } from "@/components/students/FormRowTable";
import { GreenSignatureField } from "@/components/students/GreenSignatureField";
import { HomeroomReportGrid } from "@/components/students/HomeroomReportGrid";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import type { FormFieldDef } from "@/lib/form-fields";
import {
  interpolateFormStaticLabel,
  isParentSignatureField,
} from "@/lib/form-fields";
import type { FormSchema } from "@/lib/form-schemas";
import { formSupportsVoiceRecording } from "@/lib/form-schemas";
import { getTableIdFromFieldKey } from "@/lib/form-table-grids";
import { isParentQuestionnaireForm } from "@/lib/parent-questionnaire-email";

interface PublicFormFieldsProps {
  schema: FormSchema;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  hiddenKeys?: Set<string>;
}

export function PublicFormFields({
  schema,
  data,
  onChange,
  hiddenKeys,
}: PublicFormFieldsProps) {
  const allowVoice = formSupportsVoiceRecording(schema);
  const refineTranscript = !isParentQuestionnaireForm(schema);
  return (
    <>
      {schema.sections.map((section, sectionIdx) => {
        const visibleFields = hiddenKeys
          ? section.fields.filter((f) => !hiddenKeys.has(f.key))
          : section.fields;
        if (visibleFields.length === 0) return null;
        return (
          <section
            key={section.title ?? sectionIdx}
            className="flex flex-col gap-3"
          >
            <h2 className="border-b border-brand-200 pb-1 text-lg font-bold text-ink">
              {section.title}
            </h2>
            {visibleFields.map((field) => (
              <PublicFormField
                key={field.key}
                field={field}
                data={data}
                onChange={onChange}
                allowVoice={allowVoice}
                refineTranscript={refineTranscript}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}

function PublicFormField({
  field,
  data,
  onChange,
  allowVoice,
  refineTranscript,
}: {
  field: FormFieldDef;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  allowVoice: boolean;
  refineTranscript: boolean;
}) {
  const value = data[field.key] ?? "";
  const idAttr = `public-field-${field.key}`;
  const label = field.label;
  const type = field.type ?? "text";

  if (type === "rating-grid") {
    return <HomeroomReportGrid data={data} onChange={onChange} />;
  }

  if (type === "static") {
    return (
      <p className="py-2 text-right text-base leading-7 text-ink">
        {interpolateFormStaticLabel(field.label, data)}
      </p>
    );
  }

  if (type === "signature") {
    return (
      <GreenSignatureField
        id={idAttr}
        label={label}
        required={field.required}
        value={value}
        onChange={(next) => onChange(field.key, next)}
        readOnly
        lockedHint={isParentSignatureField(field.key) ? "parent" : "third-party"}
      />
    );
  }

  if (type === "checkbox") {
    const checked = value === "true" || value === "1" || value === "on";
    return (
      <label className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <input
          id={idAttr}
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(event) =>
            onChange(field.key, event.target.checked ? "true" : "false")
          }
        />
        <span className="text-sm font-bold text-ink">
          {label}
          {field.required ? " *" : ""}
        </span>
      </label>
    );
  }

  if (type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idAttr}>
          {label}
          {field.required ? " *" : ""}
        </Label>
        <select
          id={idAttr}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="h-10 w-full rounded-md border-2 border-brand-200 bg-white px-3 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
        >
          <option value="">— בחרו —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Label htmlFor={idAttr} className="pt-1">
            {label}
            {field.required ? " *" : ""}
          </Label>
          {allowVoice ? (
            <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto sm:justify-end">
              {refineTranscript ? (
                <TypedTextRefineButton
                  value={value}
                  fieldLabel={label}
                  onInsert={(t) => onChange(field.key, t)}
                />
              ) : null}
              <VoiceRecordButton
                value={value}
                fieldLabel={label}
                refineTranscript={refineTranscript}
                onInsert={(t) => onChange(field.key, t)}
                size="md"
                className="shrink-0"
              />
            </div>
          ) : null}
        </div>
        <textarea
          id={idAttr}
          value={value}
          rows={field.rows ?? 3}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="min-h-[80px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
        />
      </div>
    );
  }

  if (type === "row-table") {
    const tableId = getTableIdFromFieldKey(field.key);
    if (!tableId) return null;
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-bold text-ink">{label}</Label>
        <FormRowTable
          tableId={tableId}
          data={data}
          onChange={onChange}
          allowVoice={allowVoice}
          allowRefineTyped={refineTranscript}
        />
      </div>
    );
  }

  if (type === "schedule-grid" || type === "accommodations-picker") {
    return (
      <p className="text-sm text-pink">
        את השדה «{label}» יש להשלים בתוך המערכת.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={idAttr}>
        {label}
        {field.required ? " *" : ""}
      </Label>
      <Input
        id={idAttr}
        type={type === "date" ? "date" : "text"}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    </div>
  );
}
