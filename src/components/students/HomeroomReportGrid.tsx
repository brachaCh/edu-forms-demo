"use client";

import { Fragment } from "react";
import { Input } from "@/components/ui/input";
import {
  HOMEROOM_RATINGS,
  HOMEROOM_REPORT_GROUPS,
  HOMEROOM_REPORT_YEARS,
  homeroomCellKey,
  homeroomYearLabelKey,
  type HomeroomRatingValue,
  type HomeroomReportYearKey,
} from "@/lib/homeroom-report-grid";
import { cn } from "@/lib/utils";

interface HomeroomReportGridProps {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function HomeroomReportGrid({ data, onChange }: HomeroomReportGridProps) {
  function setRating(
    rowKey: string,
    yearKey: HomeroomReportYearKey,
    rating: HomeroomRatingValue | ""
  ) {
    onChange(homeroomCellKey(rowKey, yearKey), rating);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50">
            <th
              rowSpan={2}
              className="w-[28%] border-l border-border px-2 py-2 text-right font-bold text-ink"
            >
              התחום:
            </th>
            {HOMEROOM_REPORT_YEARS.map((year) => (
              <th
                key={year.key}
                colSpan={3}
                className="border-l border-border px-2 py-2 text-center"
              >
                <Input
                  value={data[homeroomYearLabelKey(year.key)] ?? year.defaultLabel}
                  onChange={(e) =>
                    onChange(homeroomYearLabelKey(year.key), e.target.value)
                  }
                  className="mx-auto h-8 max-w-[9rem] border-brand-200 text-center text-xs font-bold"
                  placeholder=""
                />
              </th>
            ))}
          </tr>
          <tr className="border-b border-border bg-slate-50 text-xs font-bold text-ink">
            {HOMEROOM_REPORT_YEARS.map((year) =>
              HOMEROOM_RATINGS.map((rating) => (
                <th
                  key={`${year.key}-${rating.value}`}
                  className="border-l border-border px-1 py-1 text-center"
                >
                  {rating.label}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {HOMEROOM_REPORT_GROUPS.map((group) => (
            <Fragment key={group.title}>
              <tr className="bg-slate-100">
                <td
                  colSpan={1 + HOMEROOM_REPORT_YEARS.length * 3}
                  className="border-b border-border px-3 py-2 text-right font-bold text-ink"
                >
                  {group.title}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="border-l border-border px-3 py-2 text-right font-medium text-ink">
                    {row.label}
                  </td>
                  {HOMEROOM_REPORT_YEARS.map((year) =>
                    HOMEROOM_RATINGS.map((rating) => {
                      const cellKey = homeroomCellKey(row.key, year.key);
                      const selected = data[cellKey] === rating.value;
                      return (
                        <td
                          key={`${row.key}-${year.key}-${rating.value}`}
                          className="border-l border-border p-1 text-center"
                        >
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${row.label} ${rating.label}`}
                            onClick={() =>
                              setRating(
                                row.key,
                                year.key,
                                selected ? ("" as HomeroomRatingValue) : rating.value
                              )
                            }
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded border text-sm transition-colors",
                              selected
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-slate-300 bg-white text-slate-400 hover:border-brand-300"
                            )}
                          >
                            {selected ? "☑" : "☐"}
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
