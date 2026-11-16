"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  type AuditLogEntry,
} from "@/lib/audit-log";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function actionBadgeClass(action: string): string {
  if (action.startsWith("print.")) {
    return "border border-sky-200 bg-sky-50 text-sky-900";
  }
  if (action.startsWith("auth.")) {
    return "border border-blue-200 bg-blue-50 text-blue-900";
  }
  if (action.startsWith("student.")) {
    return "border border-violet-200 bg-violet-50 text-violet-900";
  }
  if (action.startsWith("form_fill.")) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (action.startsWith("document.")) {
    return "border border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border border-slate-200 bg-slate-50 text-slate-800";
}

export function AuditLogsClient() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      const json = (await res.json()) as {
        rows?: AuditLogEntry[];
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "FETCH_FAILED");
      }
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "FETCH_FAILED");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionOptions = Object.entries(AUDIT_ACTION_LABELS);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-brand-800">
          <EditableText path="admin.logsFilterLabel" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setOffset(0);
              setActionFilter(e.target.value);
            }}
            className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">
              הכל
            </option>
            {actionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          <EditableText path="admin.logsRefresh" />
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error === "FORBIDDEN" ? (
            <EditableText path="admin.logsForbidden" />
          ) : (
            <EditableText path="admin.logsError" />
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-brand-50 text-right">
              <tr>
                <th className="px-4 py-3 font-semibold text-brand-900">
                  <EditableText path="admin.logsColWhen" />
                </th>
                <th className="px-4 py-3 font-semibold text-brand-900">
                  <EditableText path="admin.logsColAction" />
                </th>
                <th className="px-4 py-3 font-semibold text-brand-900">
                  <EditableText path="admin.logsColUser" />
                </th>
                <th className="px-4 py-3 font-semibold text-brand-900">
                  <EditableText path="admin.logsColSummary" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-brand-600">
                    <EditableText path="admin.logsLoading" />
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-brand-600">
                    <EditableText path="admin.logsEmpty" />
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-brand-100">
                  <td className="whitespace-nowrap px-4 py-3 text-brand-700">
                    {formatWhen(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        actionBadgeClass(String(row.action))
                      )}
                    >
                      {auditActionLabel(String(row.action))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-800">
                    <div className="font-medium">
                      {row.actor_name ?? "—"}
                    </div>
                    {row.actor_email ? (
                      <div className="text-xs text-brand-600">{row.actor_email}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-brand-800">
                    {row.summary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > limit ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-brand-700">
            {offset + 1}–{Math.min(offset + limit, total)} מתוך {total}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={offset <= 0 || loading}
              onClick={() => setOffset((v) => Math.max(0, v - limit))}
            >
              <EditableText path="admin.logsPrev" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset((v) => v + limit)}
            >
              <EditableText path="admin.logsNext" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminLogsNavCard() {
  return (
    <Link
      href="/admin/logs"
      className="flex items-start gap-4 rounded-2xl border border-brand-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
    >
      <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
        <ClipboardList className="h-6 w-6" />
      </div>
      <div>
        <div className="text-lg font-semibold text-brand-900">
          <EditableText path="admin.logsNavTitle" />
        </div>
        <p className="mt-1 text-sm text-brand-700">
          <EditableText path="admin.logsNavDescription" />
        </p>
      </div>
    </Link>
  );
}
