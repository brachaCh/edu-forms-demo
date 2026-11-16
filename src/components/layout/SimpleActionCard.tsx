import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableText } from "@/components/editable/EditableText";

interface SimpleActionCardProps {
  href: string;
  textPath: string;
  icon: LucideIcon;
  variant?: "default" | "outline";
  className?: string;
  compact?: boolean;
}

export function SimpleActionCard({
  href,
  textPath,
  icon: Icon,
  variant = "default",
  className,
  compact = false,
}: SimpleActionCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "action-card min-h-[140px] sm:min-h-[160px]",
        compact && "min-h-[88px] gap-2 !p-3 sm:min-h-[100px]",
        variant === "outline" && "action-card-outline",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-[#2F3B67] shadow-[0_14px_28px_-12px_rgba(47,59,103,0.65)]",
          compact
            ? "h-9 w-9 rounded-lg sm:h-10 sm:w-10"
            : "h-12 w-12 sm:h-14 sm:w-14"
        )}
      >
        <Icon
          className={cn(
            "text-white",
            compact ? "h-5 w-5" : "h-6 w-6 sm:h-7 sm:w-7"
          )}
          strokeWidth={1.8}
        />
      </div>
      <EditableText
        path={textPath}
        as="span"
        center
        className={cn(
          "font-bold text-ink",
          compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
        )}
      />
    </Link>
  );
}
