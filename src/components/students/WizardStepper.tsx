"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableText } from "@/components/editable/EditableText";

export interface Step {
  id: number;
  titlePath: string;
  subtitlePath: string;
}

interface WizardStepperProps {
  steps: Step[];
  current: number;
  onStepClick?: (step: number) => void;
}

export function WizardStepper({
  steps,
  current,
  onStepClick,
}: WizardStepperProps) {
  return (
    <ol className="mb-8 flex flex-col gap-3">
      {steps.map((step) => {
        const isDone = step.id < current;
        const isActive = step.id === current;
        const isClickable = Boolean(onStepClick) && step.id <= current;
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition-all",
                isActive && "border-[#10B7C6] bg-[#F8FAFD] shadow-md",
                isDone && "border-[#E4EAF3] bg-white",
                !isActive && !isDone && "border-[#E4EAF3] bg-white/50 opacity-70",
                isClickable ? "cursor-pointer hover:border-[#10B7C6]" : "cursor-default"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  isDone
                    ? "bg-[#27AE60] text-white"
                    : isActive
                      ? "bg-[#2F3B67] text-white shadow-md"
                      : "bg-[#E4EAF3] text-[#2F3B67]"
                )}
              >
                {isDone ? <Check className="h-5 w-5" strokeWidth={3} /> : step.id}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-xs text-pink">
                  <EditableText path="wizard.stepOf" as="span" /> {step.id}{" "}
                  <EditableText path="wizard.stepOfTotal" as="span" /> {steps.length}
                </span>
                <EditableText
                  path={step.titlePath}
                  as="span"
                  className="text-sm font-bold text-pink"
                />
                <EditableText
                  path={step.subtitlePath}
                  as="span"
                  className="text-xs text-pink"
                />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
