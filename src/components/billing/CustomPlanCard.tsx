"use client";

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { PlanFeaturesList } from "@/components/billing/PlanCard";
import {
  calculateCustomPlanPriceAg,
  buildCustomPlanFeatures,
  classFolderLabel,
  portfolioQuotaLabel,
  CUSTOM_PLAN_ID,
  CUSTOM_PLAN_TITLE,
  type BillingUnitPrices,
} from "@/lib/billing/custom-plan";
import { formatPlanPrice } from "@/lib/purchase-plans";
import type { BillingInstitutionType } from "@/lib/billing/custom-plan";
import { cn } from "@/lib/utils";

interface CustomPlanCardProps {
  selected: boolean;
  disabled?: boolean;
  institutionType: BillingInstitutionType | null;
  classes: number;
  students: number;
  unitPrices: BillingUnitPrices;
  onSelect: () => void;
  onClassesChange: (value: number) => void;
  onStudentsChange: (value: number) => void;
}

export function CustomPlanCard({
  selected,
  disabled = false,
  institutionType,
  classes,
  students,
  unitPrices,
  onSelect,
  onClassesChange,
  onStudentsChange,
}: CustomPlanCardProps) {
  const priceAg = calculateCustomPlanPriceAg({ classes, students }, unitPrices);
  const features = buildCustomPlanFeatures({ classes, students }, institutionType);
  const folderLabel = classFolderLabel(institutionType);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-3xl border-2 bg-white p-5 text-right shadow-[0_12px_32px_-16px_rgba(47,59,103,0.35)] transition",
        selected
          ? "border-[#10B7C6] ring-2 ring-[#10B7C6]/30"
          : "border-transparent hover:border-brand-200",
        disabled && "opacity-60"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-start justify-between gap-3 text-right"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-brand-600">{CUSTOM_PLAN_TITLE}</div>
          <p className="mt-1 text-xs text-pink">
            <EditableText path="billing.customPlanHint" as="span" />
          </p>
        </div>
        {selected ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#10B7C6]/15 px-2.5 py-1 text-xs font-bold text-[#0d8f9b]">
            <Check className="h-3.5 w-3.5" />
            <EditableText path="billing.selectedBadge" as="span" />
          </span>
        ) : null}
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${CUSTOM_PLAN_ID}-students`} className="text-xs text-pink">
            {portfolioQuotaLabel()}
          </Label>
          <Input
            id={`${CUSTOM_PLAN_ID}-students`}
            type="number"
            min={0}
            max={10000}
            disabled={disabled}
            value={students}
            onChange={(e) => onStudentsChange(Number(e.target.value) || 0)}
            onFocus={() => onSelect()}
            className="text-end"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${CUSTOM_PLAN_ID}-classes`} className="text-xs text-pink">
            {folderLabel}
          </Label>
          <Input
            id={`${CUSTOM_PLAN_ID}-classes`}
            type="number"
            min={0}
            max={500}
            disabled={disabled}
            value={classes}
            onChange={(e) => onClassesChange(Number(e.target.value) || 0)}
            onFocus={() => onSelect()}
            className="text-end"
          />
        </div>
      </div>

      {features.length > 0 ? (
        <PlanFeaturesList
          plan={{
            id: CUSTOM_PLAN_ID,
            number: 0,
            category: "special",
            title: CUSTOM_PLAN_TITLE,
            features,
            priceAg,
            limits: {},
          }}
          compact
        />
      ) : null}

      <div className="flex items-end justify-between gap-3 border-t border-brand-100 pt-3">
        <span className="text-2xl font-extrabold text-[#2F3B67]">
          {formatPlanPrice(priceAg)}
        </span>
        <span className="text-xs text-pink">
          <EditableText path="billing.priceNote" as="span" />
        </span>
      </div>
    </div>
  );
}
