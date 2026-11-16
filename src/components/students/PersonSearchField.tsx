"use client";

import { Search } from "lucide-react";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { useTextScope } from "@/components/providers/TextScope";
import { getScopedTextByPath } from "@/lib/get-text-by-path";
import { cn } from "@/lib/utils";

interface PersonSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  /** שמות לבחירה מתוך הרשימה שנוצרה במערכת */
  options: string[];
  id?: string;
  className?: string;
  /** נתיב כיתוב לתווית החיפוש */
  labelPath?: string;
}

export function PersonSearchField({
  value,
  onChange,
  onSelect,
  options,
  id = "person-search",
  className,
  labelPath = "personalArea.studentsSearchPlaceholder",
}: PersonSearchFieldProps) {
  const { texts } = useSiteText();
  const scope = useTextScope();
  const label =
    getScopedTextByPath(texts, labelPath, scope) || "חיפוש";
  const allLabel =
    getScopedTextByPath(texts, "personalArea.searchSelectAll", scope) || "";

  return (
    <div className={cn("mb-4 flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-bold text-pink">
        <EditableText path={labelPath} />
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink" />
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            if (next) onSelect?.(next);
          }}
          aria-label={label}
          className="flex h-10 w-full appearance-none rounded-md border-2 border-brand-200 bg-white py-2 pr-10 pl-3 text-sm focus-visible:border-brand-500 focus-visible:outline-none"
        >
          <option value="">{allLabel || "\u00A0"}</option>
          {options.map((name) => (
            <option key={name} value={name} title={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function matchesPersonQuery(
  query: string,
  ...fields: Array<string | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/** שמות ייחודיים לבחירה בקוביית החיפוש */
export function uniqueSearchOptions(
  ...groups: Array<Array<string | null | undefined>>
): string[] {
  const names = new Set<string>();
  for (const group of groups) {
    for (const raw of group) {
      const name = raw?.trim();
      if (name) names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "he"));
}
