"use client";

import {
  formatParentFormSendStatusLine,
  type StudentParentFormSendStatus,
} from "@/lib/form-parent-send-status";
import { cn } from "@/lib/utils";

interface FormParentSendStatusLineProps {
  status: Pick<StudentParentFormSendStatus, "lastSentAt" | "filled"> | null;
  loading?: boolean;
  className?: string;
}

export function FormParentSendStatusLine({
  status,
  loading = false,
  className,
}: FormParentSendStatusLineProps) {
  if (loading) {
    return (
      <p className={cn("text-center text-sm text-pink", className)}>
        טוען סטטוס שליחה...
      </p>
    );
  }
  if (!status) return null;
  return (
    <p
      className={cn(
        "text-center text-sm font-medium",
        status.filled ? "text-brand-700" : "text-pink",
        className
      )}
    >
      {formatParentFormSendStatusLine({
        lastSentAt: status.lastSentAt,
        filled: status.filled,
      })}
    </p>
  );
}
