"use client";

import { useMemo } from "react";
import {
  ACCOMMODATION_DOMAINS,
  ACCOMMODATIONS_CLASSROOM_KEY,
  ACCOMMODATIONS_DOMAINS_KEY,
  ACCOMMODATIONS_EXAMS_KEY,
  ACCOMMODATIONS_SELECTIONS_KEY,
  buildAccommodationsTablePatch,
  flattenAccommodationsByDomain,
  parseAccommodationList,
  resolveAccommodationsByDomain,
  serializeAccommodationList,
  serializeAccommodationsByDomain,
  type AccommodationsByDomain,
} from "@/lib/accommodations-catalog";
import { cn } from "@/lib/utils";

interface AccommodationsPickerFieldProps {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onPatch?: (patch: Record<string, string>) => void;
}

function toggleInList(list: string[], value: string, checked: boolean): string[] {
  if (checked) {
    return list.includes(value) ? list : [...list, value];
  }
  return list.filter((item) => item !== value);
}

export function AccommodationsPickerField({
  data,
  onChange,
  onPatch,
}: AccommodationsPickerFieldProps) {
  const selectedDomains = parseAccommodationList(data[ACCOMMODATIONS_DOMAINS_KEY]);
  const selections = useMemo(
    () => resolveAccommodationsByDomain(data),
    [data]
  );

  function applyState(
    nextDomains: string[],
    nextSelections: AccommodationsByDomain
  ) {
    const flat = flattenAccommodationsByDomain(nextDomains, nextSelections);
    const base: Record<string, string> = {
      [ACCOMMODATIONS_DOMAINS_KEY]: serializeAccommodationList(nextDomains),
      [ACCOMMODATIONS_SELECTIONS_KEY]:
        serializeAccommodationsByDomain(nextSelections),
      [ACCOMMODATIONS_CLASSROOM_KEY]: serializeAccommodationList(flat.classroom),
      [ACCOMMODATIONS_EXAMS_KEY]: serializeAccommodationList(flat.exams),
    };
    const tablePatch = buildAccommodationsTablePatch(
      { ...data, ...base },
      nextDomains,
      nextSelections
    );
    const patch = { ...base, ...tablePatch };
    if (onPatch) {
      onPatch(patch);
      return;
    }
    for (const [key, value] of Object.entries(patch)) {
      onChange(key, value);
    }
  }

  function setDomains(nextDomains: string[]) {
    const nextSelections: AccommodationsByDomain = {};
    for (const id of nextDomains) {
      const domain = ACCOMMODATION_DOMAINS.find((item) => item.id === id);
      nextSelections[id] = selections[id] ?? {
        classroom: domain?.classroom ?? [],
        exams: domain?.exams ?? [],
      };
    }
    applyState(nextDomains, nextSelections);
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-border bg-white p-4">
        <h3 className="mb-1 text-base font-bold text-ink">בחירת סוג קושי</h3>
        <p className="mb-3 text-sm text-pink">
          בחרו תחומים — ההתאמות יופיעו בטבלה למטה (אפשר לערוך שם)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCOMMODATION_DOMAINS.map((domain) => {
            const checked = selectedDomains.includes(domain.id);
            return (
              <label
                key={domain.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition",
                  checked
                    ? "border-brand-400 bg-brand-50 text-ink"
                    : "border-border bg-white text-ink hover:bg-slate-50"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={(e) =>
                    setDomains(
                      toggleInList(selectedDomains, domain.id, e.target.checked)
                    )
                  }
                />
                <span className="font-medium">{domain.label}</span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
