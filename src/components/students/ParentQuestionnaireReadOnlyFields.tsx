"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GreenSignatureField } from "@/components/students/GreenSignatureField";
import { HomeroomReportGrid } from "@/components/students/HomeroomReportGrid";
import type { FormFieldDef } from "@/lib/form-fields";
import { interpolateFormStaticLabel } from "@/lib/form-fields";
import type { FormSchema } from "@/lib/form-schemas";

import { type ReactNode } from "react";

interface ParentQuestionnaireReadOnlyFieldsProps {
  schema: FormSchema;
  data: Record<string, string>;
  hiddenKeys?: Set<string>;
  footer?: ReactNode;
}

export function ParentQuestionnaireReadOnlyFields({
  schema,
  data,
  hiddenKeys,
  footer,
}: ParentQuestionnaireReadOnlyFieldsProps) {
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
              <ParentQuestionnaireReadOnlyField
                key={field.key}
                field={field}
                data={data}
              />
            ))}
          </section>
        );
      })}
      {footer}
    </>
  );
}

function ParentQuestionnaireReadOnlyField({
  field,
  data,
}: {
  field: FormFieldDef;
  data: Record<string, string>;
}) {
  const value = data[field.key] ?? "";
  const idAttr = `public-field-${field.key}`;
  const label = field.label;
  const type = field.type ?? "text";
  const required = field.required;

  if (type === "static") {
    return (
      <p className="py-2 text-right text-base leading-7 text-ink">
        {interpolateFormStaticLabel(field.label, data)}
      </p>
    );
  }

  if (type === "rating-grid") {
    // אין UI ייעודי לקריאה בלבד פה — אבל טכנית אפשר עדיין להציג את הכרטיס.
    // HomeroomReportGrid תומך ב־onChange, ולכן נרנדר רק לקריאה.
    return (
      <HomeroomReportGrid data={data} onChange={() => {}} />
    );
  }

  if (type === "signature") {
    return (
      <GreenSignatureField
        id={idAttr}
        label={label}
        required={required}
        value={value}
        onChange={() => {}}
        readOnly
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
          readOnly
          disabled
        />
        <span className="text-sm font-bold text-ink">
          {label}
          {required ? " *" : ""}
        </span>
      </label>
    );
  }

  if (type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idAttr}>
          {label}
          {required ? " *" : ""}
        </Label>
        <select
          id={idAttr}
          value={value}
          disabled
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
        <Label htmlFor={idAttr}>
          {label}
          {required ? " *" : ""}
        </Label>
        <textarea
          id={idAttr}
          value={value}
          rows={field.rows ?? 3}
          readOnly
          disabled
          className="min-h-[80px] w-full rounded-md border-2 border-brand-200 bg-white px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
        />
      </div>
    );
  }

  if (type === "row-table" || type === "schedule-grid") {
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
        {required ? " *" : ""}
      </Label>
      <Input
        id={idAttr}
        type={type === "date" ? "date" : "text"}
        value={value}
        readOnly
        disabled
      />
    </div>
  );
}

