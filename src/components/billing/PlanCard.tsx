"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPlanPrice, type PurchasePlan } from "@/lib/purchase-plans";
import { EditableText } from "@/components/editable/EditableText";

interface PlanFeaturesListProps {
  plan: PurchasePlan;
  compact?: boolean;
  className?: string;
}

export function PlanFeaturesList({
  plan,
  compact = false,
  className,
}: PlanFeaturesListProps) {
  return (
    <div
      className={cn(
        compact
          ? "space-y-1.5"
          : "rounded-2xl border border-brand-100 bg-brand-50/70 px-3 py-3",
        className
      )}
    >
      {!compact ? (
        <p className="mb-2 text-xs font-bold text-brand-700">
          <EditableText path="billing.planIncludesLabel" as="span" />
        </p>
      ) : null}
      <ul className={cn("space-y-2", compact && "space-y-1.5")}>
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-right">
            <Check
              className={cn(
                "mt-0.5 shrink-0 text-[#10B7C6]",
                compact ? "h-3.5 w-3.5" : "h-4 w-4"
              )}
              aria-hidden
            />
            <span
              className={cn(
                "font-bold text-ink",
                compact ? "text-sm" : "text-base leading-snug"
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PlanCardProps {
  plan: PurchasePlan;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function PlanCard({
  plan,
  selected,
  disabled = false,
  onSelect,
}: PlanCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3xl border-2 bg-white p-5 text-right shadow-[0_12px_32px_-16px_rgba(47,59,103,0.35)] transition",
        selected
          ? "border-[#10B7C6] ring-2 ring-[#10B7C6]/30"
          : "border-transparent hover:border-brand-200",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-brand-600">{plan.title}</div>
        </div>
        {selected ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#10B7C6]/15 px-2.5 py-1 text-xs font-bold text-[#0d8f9b]">
            <Check className="h-3.5 w-3.5" />
            <EditableText path="billing.selectedBadge" as="span" />
          </span>
        ) : null}
      </div>

      <PlanFeaturesList plan={plan} />

      <div className="flex items-end justify-between gap-3 border-t border-brand-100 pt-3">
        <span className="text-2xl font-extrabold text-[#2F3B67]">
          {formatPlanPrice(plan.priceAg)}
        </span>
        <span className="text-xs text-pink">
          <EditableText path="billing.priceNote" as="span" />
        </span>
      </div>
    </button>
  );
}
