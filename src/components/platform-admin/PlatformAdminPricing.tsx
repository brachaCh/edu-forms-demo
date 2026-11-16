"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  RefreshCw,
  ExternalLink,
  Building2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { formatPlanPrice } from "@/lib/purchase-plans";
import { parseSumitPlanId } from "@/lib/sumit/protocol-packages";
import type { BillingInstitutionType } from "@/lib/billing/custom-plan";
import { cn } from "@/lib/utils";

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

interface InstitutionPriceRow {
  institutionId: string;
  institutionName: string;
  institutionCode: string;
  specialPriceAgorot: number | null;
  planCustomClasses: number | null;
  planCustomStudents: number | null;
}

type PriceRowState = {
  classPriceIls: string;
  studentPriceIls: string;
};

const PRICE_ROW_LABELS: Record<BillingInstitutionType, string> = {
  kindergartens: "platform.billingPricesKindergartens",
  schools: "platform.billingPricesSchools",
  "high-schools": "platform.billingPricesHighSchools",
};

const PAYMENT_LINK_CATALOG_ORDER = ["חינוך רגיל", "חינוך מיוחד"];

function formatIlsFromAg(ag: number): string {
  return String(ag / 100);
}

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

export function PlatformAdminPricing() {
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlanOption[]>([]);
  const [priceRows, setPriceRows] = useState<Record<BillingInstitutionType, PriceRowState>>({
    kindergartens: { classPriceIls: "1000", studentPriceIls: "45" },
    schools: { classPriceIls: "1000", studentPriceIls: "45" },
    "high-schools": { classPriceIls: "1000", studentPriceIls: "45" },
  });
  const [pricesSaving, setPricesSaving] = useState(false);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [linksSaving, setLinksSaving] = useState<string | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionPriceRow[]>([]);
  const [instSearch, setInstSearch] = useState("");
  const [instEdits, setInstEdits] = useState<
    Record<string, { price: string; classes: string; students: string }>
  >({});
  const [instSaving, setInstSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pricesRes, linksRes, subsRes, instPricesRes] = await Promise.all([
        fetch("/api/platform/billing-prices"),
        fetch("/api/platform/payment-links"),
        fetch("/api/platform/subscriptions"),
        fetch("/api/platform-admin/institution-prices"),
      ]);

      if (pricesRes.ok) {
        const data = await pricesRes.json();
        if (data.prices) {
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
        }
      }

      if (linksRes.ok) {
        const data = await linksRes.json();
        const nextLinks: Record<string, string> = {};
        for (const link of data.links ?? []) {
          nextLinks[link.sumitItemId] = link.paymentPageUrl;
        }
        setPaymentLinks(nextLinks);
      }

      if (subsRes.ok) {
        const data = await subsRes.json();
        setCatalogPlans(data.plans ?? []);
      }

      if (instPricesRes.ok) {
        const data = await instPricesRes.json();
        setInstitutions(data.institutions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const linkablePlanGroups = useMemo(() => {
    const seen = new Set<string>();
    const rows: LinkablePlanRow[] = [];
    for (const plan of catalogPlans) {
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

  const filteredInstitutions = useMemo(() => {
    if (!instSearch.trim()) return institutions;
    const q = instSearch.trim().toLowerCase();
    return institutions.filter(
      (inst) =>
        inst.institutionName.toLowerCase().includes(q) ||
        inst.institutionCode.toLowerCase().includes(q)
    );
  }, [institutions, instSearch]);

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
    } catch {
      setPricesError("לא ניתן לשמור את המחירים.");
    } finally {
      setPricesSaving(false);
    }
  }

  async function savePaymentLink(sumitItemId: string, url: string): Promise<void> {
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
          "לא ניתן לשמור את הקישור. בדקו שהכתובת היא דף תשלום תקין של SUMIT."
        );
        return;
      }
      const data = await response.json();
      const nextLinks: Record<string, string> = {};
      for (const link of data.links ?? []) {
        nextLinks[link.sumitItemId] = link.paymentPageUrl;
      }
      setPaymentLinks(nextLinks);
    } catch {
      setLinksError("לא ניתן לשמור את הקישור.");
    } finally {
      setLinksSaving(null);
    }
  }

  function institutionDraft(inst: InstitutionPriceRow) {
    return (
      instEdits[inst.institutionId] ?? {
        price:
          inst.specialPriceAgorot != null
            ? formatIlsFromAg(inst.specialPriceAgorot)
            : "",
        classes: String(inst.planCustomClasses ?? ""),
        students: String(inst.planCustomStudents ?? ""),
      }
    );
  }

  async function saveInstitutionPrice(institutionId: string): Promise<void> {
    const inst = institutions.find((row) => row.institutionId === institutionId);
    if (!inst) return;
    const draft = institutionDraft(inst);
    const priceAg =
      draft.price.trim() === ""
        ? null
        : Math.round(Number.parseFloat(draft.price) * 100);

    if (draft.price.trim() !== "" && (!Number.isFinite(priceAg) || priceAg! < 0)) {
      return;
    }

    setInstSaving(institutionId);
    try {
      const response = await fetch("/api/platform-admin/institution-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_id: institutionId,
          special_price_agorot: priceAg,
          custom_classes: Number.parseInt(draft.classes, 10) || 0,
          custom_students: Number.parseInt(draft.students, 10) || 0,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setInstitutions(data.institutions ?? []);
        setInstEdits((prev) => {
          const copy = { ...prev };
          delete copy[institutionId];
          return copy;
        });
      }
    } finally {
      setInstSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="menu-box p-8 text-center text-pink">טוען נתונים...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
          <CreditCard className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">מחירים וחבילה אישית</h1>
          <p className="text-sm text-pink">הגדרת מחירים בסיסיים, קישורי תשלום, ומחירים מיוחדים למוסדות</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mr-auto"
          onClick={() => void loadAll()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          רענון
        </Button>
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

      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            חבילה אישית ומחיר מיוחד למוסד
          </h2>
          <p className="mt-1 text-sm text-pink">
            מכסות חבילה אישית לכל מוסד, ומחיר קבוע אופציונלי שעוקף את חישוב הכיתות/תלמידים.
            השאירו את המחיר ריק לשימוש בחישוב הרגיל.
          </p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
          <Input
            type="search"
            placeholder="חיפוש מוסד..."
            value={instSearch}
            onChange={(e) => setInstSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        {filteredInstitutions.length === 0 ? (
          <p className="text-sm text-pink">לא נמצאו מוסדות</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-brand-100">
            <table className="w-full text-sm">
              <thead className="bg-brand-50">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold">מוסד</th>
                  <th className="px-3 py-2 text-right font-semibold">קוד</th>
                  <th className="px-3 py-2 text-right font-semibold">תיקי שילוב</th>
                  <th className="px-3 py-2 text-right font-semibold">כיתות ח״מ</th>
                  <th className="px-3 py-2 text-right font-semibold">מחיר מיוחד (₪)</th>
                  <th className="px-3 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filteredInstitutions.map((inst) => {
                  const draft = institutionDraft(inst);
                  const hasChanged = inst.institutionId in instEdits;
                  const isSaving = instSaving === inst.institutionId;

                  return (
                    <tr key={inst.institutionId} className="border-t border-brand-100">
                      <td className="px-3 py-2">{inst.institutionName}</td>
                      <td className="px-3 py-2 text-brand-600">{inst.institutionCode}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={draft.students}
                          onChange={(e) =>
                            setInstEdits((prev) => ({
                              ...prev,
                              [inst.institutionId]: {
                                ...institutionDraft(inst),
                                students: e.target.value,
                              },
                            }))
                          }
                          className="h-8 w-20 text-end"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={draft.classes}
                          onChange={(e) =>
                            setInstEdits((prev) => ({
                              ...prev,
                              [inst.institutionId]: {
                                ...institutionDraft(inst),
                                classes: e.target.value,
                              },
                            }))
                          }
                          className="h-8 w-20 text-end"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          placeholder="חישוב רגיל"
                          value={draft.price}
                          onChange={(e) =>
                            setInstEdits((prev) => ({
                              ...prev,
                              [inst.institutionId]: {
                                ...institutionDraft(inst),
                                price: e.target.value,
                              },
                            }))
                          }
                          className="h-8 w-28 text-end"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!hasChanged || isSaving}
                          onClick={() => void saveInstitutionPrice(inst.institutionId)}
                        >
                          {isSaving ? "שומר..." : "שמירה"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            קישורי דף תשלום (קופונים)
          </h2>
          <p className="mt-1 text-sm text-pink">
            לכל חבילה רגילה הדביקו את הקישור לדף התשלום הישיר ב-SUMIT (עם שדה קופון).
            תשלום באשראי לחבילה זו ינותב לדף זה. חבילה ללא קישור תמשיך בתשלום הרגיל (ללא קופון).
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
                        {formatPlanPrice(plan.priceAg)} · SUMIT ID: {plan.sumitItemId}
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
    </div>
  );
}
