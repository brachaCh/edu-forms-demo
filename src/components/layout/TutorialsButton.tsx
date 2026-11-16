"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { EditableText } from "@/components/editable/EditableText";
import { hrefWithFrom } from "@/lib/navigation-back";
import { cn } from "@/lib/utils";

export function TutorialsButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const href = hrefWithFrom("/dashboard/tutorials", pathname || "/");

  return (
    <Link
      href={href}
      className={cn(
        "tutorials-button group",
        compact && "!gap-3 !px-5 !py-2.5",
        className
      )}
    >
      <span
        className={cn(
          "tutorials-button-play",
          compact && "!h-10 !w-10"
        )}
      >
        <PlayCircle
          className={compact ? "h-5 w-5" : "h-7 w-7"}
          strokeWidth={2}
        />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <EditableText
          path="dashboard.tutorials"
          as="span"
          className={cn("font-bold", compact ? "text-base" : "text-lg")}
        />
        <span
          className={cn(
            "font-medium opacity-75",
            compact ? "text-[11px]" : "text-xs"
          )}
        >
          צפו איך המערכת עובדת
        </span>
      </span>
      <span className="tutorials-button-shine" aria-hidden />
    </Link>
  );
}
