"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  Ban,
  Check,
  X,
  RefreshCw,
  Search,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-lifecycle";
import { formatSchoolYearExpiryDate } from "@/lib/billing/school-year-expiry";
import {
  applyClearedSubscriptionFields,
  readSubscriptionActionError,
  removeSubscriptionConfirmMessage,
  subscriptionActionErrorMessage,
  subscriptionActionSuccessMessage,
  subscriptionRowDisplayName,
} from "@/lib/platform-subscription-admin";
import {
  CUSTOM_PLAN_ID,
  MAX_CUSTOM_CLASSES,
  MAX_CUSTOM_STUDENTS,
} from "@/lib/billing/custom-plan";
import { formatPlanPrice, getPlanById } from "@/lib/purchase-plans";
import type { PaymentMethod, SubscriptionStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface SubscriptionRow {
  institutionId: string;
  institutionName: string;
  schoolName: string | null;
  institutionCode: string;
  institutionType: string | null;
  planId: string | null;
  planTitle: string | null;
  educationFramework: "regular" | "special" | null;
  planCustomClasses: number | null;
  planCustomStudents: number | null;
  subscriptionStatus: SubscriptionStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  planExpiresAt: string | null;
  userFullName: string | null;
  userEmail: string | null;
  userPhone: string | null;
}

interface CatalogPlanOption {
  id: string;
  title: string;
  priceAg: number;
  category: "regular" | "special";
}

type CustomPlanDraft = {
  students: string;
  classes: string;
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  none: "ללא מנוי",
  pending_payment: "ממתין לתשלום",
  active: "פעיל",
  expired: "פג תוקף",
  cancelled: "בוטל",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  credit_card: "אשראי",
  bank_transfer: "העברה בנקאית",
};

const STATUS_BADGE_CLASS: Record<SubscriptionStatus, string> = {
  none: "border border-slate-200 bg-slate-100 text-slate-700",
  pending_payment: "border border-amber-200 bg-amber-100 text-amber-900",
  active: "border border-emerald-200 bg-emerald-100 text-emerald-900",
  expired: "border border-orange-200 bg-orange-100 text-orange-900",
  cancelled:
    "border-2 border-red-300 bg-red-100 text-red-900 ring-2 ring-red-200/60",
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "הכל" },
  { value: "active", label: "פעיל" },
  { value: "pending_payment", label: "ממתין לתשלום" },
  { value: "expired", label: "פג תוקף" },
  { value: "cancelled", label: "בוטל" },
  { value: "none", label: "ללא מנוי" },
];

function resolveStatus(row: SubscriptionRow): SubscriptionStatus {
  return effectiveSubscriptionStatus(
    row.subscriptionStatus,
    row.planExpiresAt
  );
}

function canActivateBank(status: SubscriptionStatus): boolean {
  return status !== "active";
}

function canCancelSubscription(status: SubscriptionStatus): boolean {
  return status === "active" || status === "pending_payment";
}

function formatDate(value: string | null): string {
  return formatSchoolYearExpiryDate(value);
}

function resolveCustomPlanDraft(
  row: SubscriptionRow,
  editCustomPlan: Record<string, CustomPlanDraft>
): CustomPlanDraft {
  const draft = editCustomPlan[row.institutionId];
  if (draft) return draft;
  return {
    students: String(row.planCustomStudents ?? 0),
    classes: String(row.planCustomClasses ?? 0),
  };
}

function buildSubscriptionPatchBody(
  action: string,
  planId: string,
  customDraft: CustomPlanDraft | null
): Record<string, string | number> {
  const body: Record<string, string | number> = { action, plan_id: planId };
  if (planId === CUSTOM_PLAN_ID && customDraft) {
    body.custom_classes = Number.parseInt(customDraft.classes, 10) || 0;
    body.custom_students = Number.parseInt(customDraft.students, 10) || 0;
  }
  return body;
}

function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const isCancelled = status === "cancelled";

  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          STATUS_BADGE_CLASS[status]
        )}
      >
        {isCancelled ? <Ban className="h-3.5 w-3.5 shrink-0" /> : null}
        {STATUS_LABELS[status]}
      </span>
      {isCancelled ? (
        <span className="text-xs font-medium text-red-700">
          המנוי בוטל — אין גישה למערכת
        </span>
      ) : null}
    </div>
  );
}

export function PlatformAdminSubscriptions() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editPlanId, setEditPlanId] = useState<Record<string, string>>({});
  const [editCustomPlan, setEditCustomPlan] = useState<Record<string, CustomPlanDraft>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [extendDays, setExtendDays] = useState<Record<string, string>>({});

  const loadRows = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/platform/subscriptions");
      if (response.status === 403) {
        setError("אין הרשאה לניהול מנויים.");
        return;
      }
      if (!response.ok) throw new Error("LOAD_FAILED");
      const data = (await response.json()) as {
        subscriptions?: SubscriptionRow[];
        plans?: CatalogPlanOption[];
      };
      setRows(data.subscriptions ?? []);
      setCatalogPlans(data.plans ?? []);
    } catch {
      setError("לא ניתן לטעון רשימת מנויים.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    let result = rows;

    if (statusFilter) {
      result = result.filter((row) => resolveStatus(row) === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((row) => {
        return (
          row.institutionName.toLowerCase().includes(q) ||
          row.institutionCode.toLowerCase().includes(q) ||
          (row.schoolName?.toLowerCase().includes(q) ?? false) ||
          (row.userFullName?.toLowerCase().includes(q) ?? false) ||
          (row.userEmail?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    return result;
  }, [rows, statusFilter, searchQuery]);

  async function patchSubscription(
    institutionId: string,
    body: Record<string, string | number>
  ): Promise<boolean> {
    setActionError(null);
    setActionNotice(null);
    if (!institutionId?.trim()) {
      setActionError(subscriptionActionErrorMessage(400, "INVALID_ID"));
      return false;
    }
    setBusyId(institutionId);
    try {
      const response = await fetch(`/api/platform/subscriptions/${institutionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setActionError(await readSubscriptionActionError(response));
        return false;
      }
      if (body.action === "remove") {
        setRows((prev) =>
          prev.map((row) =>
            row.institutionId === institutionId
              ? applyClearedSubscriptionFields(row)
              : row
          )
        );
      }
      setActionNotice(subscriptionActionSuccessMessage(String(body.action)));
      await loadRows();
      return true;
    } catch {
      setActionError(subscriptionActionErrorMessage(0));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function extendExpiry(institutionId: string) {
    const days = Number.parseInt(extendDays[institutionId] ?? "30", 10);
    if (!Number.isFinite(days) || days <= 0) {
      setActionError("יש להזין מספר ימים תקין להארכת התוקף.");
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setBusyId(institutionId);
    try {
      const response = await fetch(`/api/platform/subscriptions/${institutionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend_expiry", days }),
      });
      if (!response.ok) {
        setActionError(await readSubscriptionActionError(response));
        return;
      }
      setExtendDays((prev) => {
        const copy = { ...prev };
        delete copy[institutionId];
        return copy;
      });
      setActionNotice(subscriptionActionSuccessMessage("extend_expiry"));
      await loadRows();
    } catch {
      setActionError(subscriptionActionErrorMessage(0));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="personalArea.loading" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="menu-box mx-auto max-w-2xl space-y-4 p-6 text-center">
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
          <Package className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">ניהול מנויים</h1>
          <p className="text-sm text-pink">
            {filteredRows.length} מוסדות{rows.length !== filteredRows.length ? ` (מסוננים מתוך ${rows.length})` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mr-auto"
          onClick={() => void loadRows()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          רענון
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-pink">חיפוש</Label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
            <Input
              type="search"
              placeholder="שם מוסד, קוד, לקוח..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-pink">סטטוס</Label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {actionError}
        </p>
      ) : null}
      {actionNotice ? (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {actionNotice}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-brand-200">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-brand-50 text-start">
            <tr>
              <th className="px-3 py-2 font-semibold">מוסד</th>
              <th className="px-3 py-2 font-semibold">לקוח</th>
              <th className="px-3 py-2 font-semibold">חבילה</th>
              <th className="px-3 py-2 font-semibold">סטטוס</th>
              <th className="px-3 py-2 font-semibold">תשלום</th>
              <th className="px-3 py-2 font-semibold">תפוגה</th>
              <th className="px-3 py-2 font-semibold">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-pink">
                  לא נמצאו תוצאות
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const frameworkPlans = row.educationFramework
                ? catalogPlans.filter(
                    (plan) => plan.category === row.educationFramework
                  )
                : [];
              const legacyPlan =
                row.planId &&
                row.planId !== CUSTOM_PLAN_ID &&
                !frameworkPlans.some((plan) => plan.id === row.planId)
                  ? getPlanById(row.planId)
                  : null;
              const planDraft =
                editPlanId[row.institutionId] ??
                row.planId ??
                frameworkPlans[0]?.id ??
                CUSTOM_PLAN_ID;
              const isCustomPlan = planDraft === CUSTOM_PLAN_ID;
              const customDraft = isCustomPlan
                ? resolveCustomPlanDraft(row, editCustomPlan)
                : null;
              const catalogPlan = catalogPlans.find((plan) => plan.id === planDraft);
              const staticPlan = catalogPlan ?? getPlanById(planDraft);
              const status = resolveStatus(row);
              const activateEnabled = canActivateBank(status);
              const cancelEnabled = canCancelSubscription(status);
              const rowBusy = busyId === row.institutionId;

              return (
                <tr
                  key={row.institutionId}
                  className={cn(
                    "border-t border-brand-100",
                    status === "cancelled" && "bg-red-50/70"
                  )}
                >
                  <td className="px-3 py-3 align-top">
                    <div className="font-semibold text-ink">{row.institutionName}</div>
                    {row.schoolName ? (
                      <div className="text-xs text-pink">{row.schoolName}</div>
                    ) : null}
                    <div className="text-xs text-brand-600">{row.institutionCode}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div>{row.userFullName ?? "—"}</div>
                    <div className="text-xs text-pink" dir="ltr">{row.userEmail}</div>
                    {row.userPhone ? (
                      <div className="text-xs text-pink">{row.userPhone}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div>{row.planTitle ?? "—"}</div>
                    {row.planId && staticPlan ? (
                      <div className="text-xs text-brand-600">
                        {formatPlanPrice(staticPlan.priceAg)}
                      </div>
                    ) : null}
                    <select
                      className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      value={planDraft}
                      onChange={(e) =>
                        setEditPlanId((prev) => ({
                          ...prev,
                          [row.institutionId]: e.target.value,
                        }))
                      }
                    >
                      {frameworkPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.title}
                        </option>
                      ))}
                      {legacyPlan ? (
                        <option value={legacyPlan.id}>{legacyPlan.title}</option>
                      ) : row.planId &&
                        row.planId !== CUSTOM_PLAN_ID &&
                        !frameworkPlans.some((plan) => plan.id === row.planId) ? (
                        <option value={row.planId}>{row.planTitle ?? row.planId}</option>
                      ) : null}
                      <option value={CUSTOM_PLAN_ID}>חבילה אישית</option>
                    </select>
                    {isCustomPlan && customDraft ? (
                      <div className="mt-2 space-y-2 rounded-md border border-brand-100 bg-brand-50/40 p-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-pink">
                            תיקי שילוב / סל אישי
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            max={MAX_CUSTOM_STUDENTS}
                            value={customDraft.students}
                            onChange={(e) =>
                              setEditCustomPlan((prev) => ({
                                ...prev,
                                [row.institutionId]: {
                                  ...resolveCustomPlanDraft(row, prev),
                                  students: e.target.value,
                                },
                              }))
                            }
                            className="h-8 text-end text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-pink">כיתות ח״מ</Label>
                          <Input
                            type="number"
                            min={0}
                            max={MAX_CUSTOM_CLASSES}
                            value={customDraft.classes}
                            onChange={(e) =>
                              setEditCustomPlan((prev) => ({
                                ...prev,
                                [row.institutionId]: {
                                  ...resolveCustomPlanDraft(row, prev),
                                  classes: e.target.value,
                                },
                              }))
                            }
                            className="h-8 text-end text-xs"
                          />
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <SubscriptionStatusBadge status={status} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    {row.paymentMethod
                      ? PAYMENT_LABELS[row.paymentMethod]
                      : "—"}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div>{formatDate(row.planExpiresAt)}</div>
                    {status === "active" && (
                      <div className="mt-2 flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          placeholder="30"
                          value={extendDays[row.institutionId] ?? ""}
                          onChange={(e) =>
                            setExtendDays((prev) => ({
                              ...prev,
                              [row.institutionId]: e.target.value,
                            }))
                          }
                          className="h-7 w-16 text-center text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          disabled={rowBusy}
                          onClick={() => void extendExpiry(row.institutionId)}
                          title="הארכת תוקף"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rowBusy || !activateEnabled}
                        title={
                          activateEnabled
                            ? undefined
                            : "המנוי כבר פעיל — אין צורך בהפעלה"
                        }
                        onClick={() =>
                          void patchSubscription(
                            row.institutionId,
                            buildSubscriptionPatchBody(
                              "activate_bank",
                              planDraft,
                              customDraft
                            )
                          )
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                        <EditableText path="platform.activateBank" as="span" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rowBusy}
                        onClick={() =>
                          void patchSubscription(
                            row.institutionId,
                            buildSubscriptionPatchBody(
                              "update_plan",
                              planDraft,
                              customDraft
                            )
                          )
                        }
                      >
                        <EditableText path="platform.updatePlan" as="span" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rowBusy || !cancelEnabled}
                        title={
                          cancelEnabled
                            ? undefined
                            : status === "cancelled"
                              ? "המנוי כבר מסומן כמבוטל"
                              : "אין מנוי פעיל לביטול"
                        }
                        onClick={() =>
                          void patchSubscription(row.institutionId, {
                            action: "cancel",
                          })
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                        <EditableText path="platform.cancelSubscription" as="span" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={rowBusy}
                        onClick={() => {
                          const name = subscriptionRowDisplayName(row);
                          const ok = window.confirm(
                            removeSubscriptionConfirmMessage(name)
                          );
                          if (!ok) return;
                          void patchSubscription(row.institutionId, {
                            action: "remove",
                          });
                        }}
                      >
                        <EditableText path="platform.removeSubscription" as="span" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
