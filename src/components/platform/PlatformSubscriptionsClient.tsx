"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { InstitutionProfileBackLink } from "@/components/layout/InstitutionProfileBackLink";
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
  type BillingInstitutionType,
} from "@/lib/billing/custom-plan";
import { formatPlanPrice, getPlanById } from "@/lib/purchase-plans";
import { parseSumitPlanId } from "@/lib/sumit/protocol-packages";
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
  sumitCatalogKey?: string | null;
  sumitCatalogLabel?: string | null;
  sumitCatalogUrl?: string | null;
}

interface LinkablePlanRow {
  sumitItemId: string;
  title: string;
  priceAg: number;
  catalogLabel: string;
  catalogUrl: string | null;
}

const PAYMENT_LINK_CATALOG_ORDER = ["חינוך רגיל", "חינוך מיוחד"];

function groupLinkablePlansByCatalog(
  plans: LinkablePlanRow[]
): { label: string; catalogUrl: string | null; plans: LinkablePlanRow[] }[] {
  const byLabel = new Map<string, LinkablePlanRow[]>();
  const catalogUrlByLabel = new Map<string, string | null>();

  for (const plan of plans) {
    const label = plan.catalogLabel;
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      catalogUrlByLabel.set(label, plan.catalogUrl);
    }
    byLabel.get(label)!.push(plan);
  }

  return [...byLabel.entries()]
    .sort(([a], [b]) => {
      const prefixA = PAYMENT_LINK_CATALOG_ORDER.find((p) => a.startsWith(p));
      const prefixB = PAYMENT_LINK_CATALOG_ORDER.find((p) => b.startsWith(p));
      const ai = prefixA ? PAYMENT_LINK_CATALOG_ORDER.indexOf(prefixA) : 99;
      const bi = prefixB ? PAYMENT_LINK_CATALOG_ORDER.indexOf(prefixB) : 99;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "he");
    })
    .map(([label, groupPlans]) => ({
      label,
      catalogUrl: catalogUrlByLabel.get(label) ?? null,
      plans: [...groupPlans].sort((x, y) =>
        x.title.localeCompare(y.title, "he")
      ),
    }));
}

type CustomPlanDraft = {
  /** תיקי שילוב / סל אישי */
  students: string;
  /** כיתות ח״מ */
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

type PriceRowState = {
  classPriceIls: string;
  studentPriceIls: string;
};

const PRICE_ROW_LABELS: Record<BillingInstitutionType, string> = {
  kindergartens: "platform.billingPricesKindergartens",
  schools: "platform.billingPricesSchools",
  "high-schools": "platform.billingPricesHighSchools",
};

function formatIlsFromAg(ag: number): string {
  return String(ag / 100);
}

const STATUS_BADGE_CLASS: Record<SubscriptionStatus, string> = {
  none: "border border-slate-200 bg-slate-100 text-slate-700",
  pending_payment: "border border-amber-200 bg-amber-100 text-amber-900",
  active: "border border-emerald-200 bg-emerald-100 text-emerald-900",
  expired: "border border-orange-200 bg-orange-100 text-orange-900",
  cancelled:
    "border-2 border-red-300 bg-red-100 text-red-900 ring-2 ring-red-200/60",
};

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

export function PlatformSubscriptionsClient() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editPlanId, setEditPlanId] = useState<Record<string, string>>({});
  const [editCustomPlan, setEditCustomPlan] = useState<Record<string, CustomPlanDraft>>({});
  const [priceRows, setPriceRows] = useState<Record<BillingInstitutionType, PriceRowState>>({
    kindergartens: { classPriceIls: "1000", studentPriceIls: "45" },
    schools: { classPriceIls: "1000", studentPriceIls: "45" },
    "high-schools": { classPriceIls: "1000", studentPriceIls: "45" },
  });
  const [pricesSaving, setPricesSaving] = useState(false);
  const [pricesError, setPricesError] = useState<string | null>(null);
  // מיפוי sumitItemId -> כתובת דף תשלום מתארח (עם שדה קופון)
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [linksSaving, setLinksSaving] = useState<string | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);

  const loadPrices = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/billing-prices");
      if (!response.ok) return;
      const data = (await response.json()) as {
        prices?: Record<
          BillingInstitutionType,
          { classPriceAg: number; studentPriceAg: number }
        >;
      };
      if (!data.prices) return;
      const next: Record<BillingInstitutionType, PriceRowState> = {
        kindergartens: {
          classPriceIls: formatIlsFromAg(data.prices.kindergartens?.classPriceAg ?? 100_000),
          studentPriceIls: formatIlsFromAg(data.prices.kindergartens?.studentPriceAg ?? 4_500),
        },
        schools: {
          classPriceIls: formatIlsFromAg(data.prices.schools?.classPriceAg ?? 100_000),
          studentPriceIls: formatIlsFromAg(data.prices.schools?.studentPriceAg ?? 4_500),
        },
        "high-schools": {
          classPriceIls: formatIlsFromAg(data.prices["high-schools"]?.classPriceAg ?? 100_000),
          studentPriceIls: formatIlsFromAg(data.prices["high-schools"]?.studentPriceAg ?? 4_500),
        },
      };
      setPriceRows(next);
    } catch {
      // ignore — defaults remain
    }
  }, []);

  const loadPaymentLinks = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/payment-links");
      if (!response.ok) return;
      const data = (await response.json()) as {
        links?: { sumitItemId: string; paymentPageUrl: string }[];
      };
      const next: Record<string, string> = {};
      for (const link of data.links ?? []) {
        next[link.sumitItemId] = link.paymentPageUrl;
      }
      setPaymentLinks(next);
    } catch {
      // ignore
    }
  }, []);

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
    void loadPrices();
    void loadPaymentLinks();
  }, [loadRows, loadPrices, loadPaymentLinks]);

  const linkablePlanGroups = useMemo(() => {
    const seen = new Set<string>();
    const rows: LinkablePlanRow[] = [];
    for (const plan of catalogPlans) {
      if (plan.id === CUSTOM_PLAN_ID) continue;
      const sumitItemId = parseSumitPlanId(plan.id)?.itemId ?? null;
      if (!sumitItemId || seen.has(sumitItemId)) continue;
      seen.add(sumitItemId);
      const catalogLabel =
        plan.sumitCatalogLabel?.trim() ||
        (plan.category === "special" ? "חינוך מיוחד" : "חינוך רגיל");
      rows.push({
        sumitItemId,
        title: plan.title,
        priceAg: plan.priceAg,
        catalogLabel,
        catalogUrl: plan.sumitCatalogUrl ?? null,
      });
    }
    return groupLinkablePlansByCatalog(rows);
  }, [catalogPlans]);

  async function savePaymentLink(
    sumitItemId: string,
    url: string
  ): Promise<void> {
    setLinksSaving(sumitItemId);
    setLinksError(null);
    try {
      const response = await fetch("/api/platform/payment-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sumit_item_id: sumitItemId,
          payment_page_url: url.trim(),
        }),
      });
      if (!response.ok) {
        setLinksError(
          "לא ניתן לשמור את הקישור. בדקו שהכתובת היא דף תשלום תקין של SUMIT (pay.sumit.co.il)."
        );
        return;
      }
      await loadPaymentLinks();
    } catch {
      setLinksError("לא ניתן לשמור את הקישור.");
    } finally {
      setLinksSaving(null);
    }
  }

  async function saveBillingPrices(): Promise<void> {
    setPricesSaving(true);
    setPricesError(null);
    try {
      for (const institutionType of Object.keys(priceRows) as BillingInstitutionType[]) {
        const row = priceRows[institutionType];
        const response = await fetch("/api/platform/billing-prices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institution_type: institutionType,
            class_price_ils: Number.parseFloat(row.classPriceIls),
            student_price_ils: Number.parseFloat(row.studentPriceIls),
          }),
        });
        if (!response.ok) {
          setPricesError("לא ניתן לשמור את המחירים. בדקו שהערכים תקינים.");
          return;
        }
      }
      await loadPrices();
    } catch {
      setPricesError("לא ניתן לשמור את המחירים.");
    } finally {
      setPricesSaving(false);
    }
  }

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
        <InstitutionProfileBackLink variant="outline" size="default" />
      </div>
    );
  }

  return (
    <div className="menu-box mx-auto w-full max-w-5xl space-y-5 p-5">
      <div className="text-center">
        <Package className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-3 text-2xl font-bold text-ink">
          <EditableText path="platform.subscriptionsTitle" />
        </h1>
        <p className="mt-2 text-sm text-pink">
          <EditableText path="platform.subscriptionsSubtitle" as="span" />
        </p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink">
            <EditableText path="platform.billingPricesTitle" />
          </h2>
          <p className="mt-1 text-sm text-pink">
            <EditableText path="platform.billingPricesSubtitle" as="span" />
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(priceRows) as BillingInstitutionType[]).map((type) => (
            <div key={type} className="rounded-xl border border-brand-100 bg-white p-3 space-y-3">
              <div className="text-sm font-semibold text-brand-700">
                <EditableText path={PRICE_ROW_LABELS[type]} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-pink">
                  <EditableText path="platform.billingPricesClassLabel" as="span" />
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={priceRows[type].classPriceIls}
                  onChange={(e) =>
                    setPriceRows((prev) => ({
                      ...prev,
                      [type]: { ...prev[type], classPriceIls: e.target.value },
                    }))
                  }
                  className="text-end"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-pink">
                  <EditableText path="platform.billingPricesStudentLabel" as="span" />
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={priceRows[type].studentPriceIls}
                  onChange={(e) =>
                    setPriceRows((prev) => ({
                      ...prev,
                      [type]: { ...prev[type], studentPriceIls: e.target.value },
                    }))
                  }
                  className="text-end"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-end">
          {pricesError ? (
            <p className="text-sm text-destructive">{pricesError}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={pricesSaving}
            onClick={() => void saveBillingPrices()}
          >
            {pricesSaving ? (
              <EditableText path="platform.billingPricesSaving" as="span" />
            ) : (
              <EditableText path="platform.billingPricesSave" as="span" />
            )}
          </Button>
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
        <table className="w-full min-w-[720px] text-sm">
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
            {rows.map((row) => {
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
                    {formatDate(row.planExpiresAt)}
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

      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink">קישורי דף תשלום (קופונים)</h2>
          <p className="mt-1 text-sm text-pink">
            לכל חבילה רגילה הדביקו את הקישור לדף התשלום הישיר ב-SUMIT (עם שדה
            קופון). תשלום באשראי לחבילה זו ינותב לדף זה. חבילה ללא קישור תמשיך
            בתשלום הרגיל (ללא קופון).
          </p>
        </div>
        {linkablePlanGroups.length === 0 ? (
          <p className="text-sm text-pink">אין חבילות קטלוג זמינות למיפוי.</p>
        ) : (
          <div className="space-y-5">
            {linkablePlanGroups.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="border-b border-brand-200 pb-2">
                  <h3 className="text-sm font-bold text-brand-800">
                    {group.label}
                  </h3>
                  {group.catalogUrl ? (
                    <p
                      className="mt-1 truncate text-xs text-pink"
                      dir="ltr"
                      title={group.catalogUrl}
                    >
                      {group.catalogUrl}
                    </p>
                  ) : null}
                </div>
                {group.plans.map((plan) => (
                  <div
                    key={plan.sumitItemId}
                    className="rounded-xl border border-brand-100 bg-white p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-700">
                        {plan.title}
                      </span>
                      <span className="text-xs text-pink">
                        {formatPlanPrice(plan.priceAg)} · SUMIT ID:{" "}
                        {plan.sumitItemId}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="url"
                        dir="ltr"
                        placeholder="https://pay.sumit.co.il/.../.../.../payment/"
                        value={paymentLinks[plan.sumitItemId] ?? ""}
                        onChange={(e) =>
                          setPaymentLinks((prev) => ({
                            ...prev,
                            [plan.sumitItemId]: e.target.value,
                          }))
                        }
                        className="text-start"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={linksSaving === plan.sumitItemId}
                        onClick={() =>
                          void savePaymentLink(
                            plan.sumitItemId,
                            paymentLinks[plan.sumitItemId] ?? ""
                          )
                        }
                      >
                        {linksSaving === plan.sumitItemId ? "שומר…" : "שמירה"}
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
        {linksError ? (
          <p className="text-sm text-destructive">{linksError}</p>
        ) : null}
      </div>

      <div className="text-center">
        <InstitutionProfileBackLink variant="ghost" />
      </div>
    </div>
  );
}
