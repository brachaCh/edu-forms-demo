"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CreditCard, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanCard, PlanFeaturesList } from "@/components/billing/PlanCard";
import { CustomPlanCard } from "@/components/billing/CustomPlanCard";
import { ContactButton } from "@/components/contact/ContactButton";
import { EditableText } from "@/components/editable/EditableText";
import {
  CUSTOM_PLAN_ID,
  DEFAULT_CLASS_PRICE_AG,
  DEFAULT_STUDENT_PRICE_AG,
  type BillingUnitPrices,
} from "@/lib/billing/custom-plan";
import { getPlanById, type PurchasePlan } from "@/lib/purchase-plans";
import { cacheAuthenticatedUser } from "@/lib/mock-store";
import { institutionProfileHref } from "@/lib/personal-sector";

import type { UserProfile } from "@/lib/supabase/types";

const SETUP_FROM_PLAN_HREF = "/personal-area/setup?edit=1&from=plan";

async function loadBillingPlans(): Promise<{
  plans: PurchasePlan[];
  sumitConfigured: boolean;
  unitPrices: BillingUnitPrices;
} | null> {
  try {
    const response = await fetch("/api/billing/plans");
    if (!response.ok) return null;
    const data = (await response.json()) as {
      plans?: PurchasePlan[];
      sumitConfigured?: boolean;
      unitPrices?: BillingUnitPrices;
    };
    if (!Array.isArray(data.plans)) return null;
    return {
      plans: data.plans,
      sumitConfigured: data.sumitConfigured === true,
      unitPrices: data.unitPrices ?? {
        classPriceAg: DEFAULT_CLASS_PRICE_AG,
        studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
      },
    };
  } catch {
    return null;
  }
}

async function loadSessionUser(): Promise<UserProfile | null> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) return null;
    const data = (await response.json()) as { profile: UserProfile | null };
    return data.profile;
  } catch {
    return null;
  }
}

export type PlanSelectMode = "onboarding" | "manage";

interface PlanSelectPageClientProps {
  mode?: PlanSelectMode;
}

export function PlanSelectPageClient({
  mode = "onboarding",
}: PlanSelectPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frameworkUpdated = searchParams.get("frameworkUpdated") === "1";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(frameworkUpdated);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [sumitConfigured, setSumitConfigured] = useState(false);
  const [unitPrices, setUnitPrices] = useState<BillingUnitPrices>({
    classPriceAg: DEFAULT_CLASS_PRICE_AG,
    studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
  });
  const [customClasses, setCustomClasses] = useState(1);
  const [customStudents, setCustomStudents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bankRequestSent, setBankRequestSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSessionUser().then(async (user) => {
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      if (
        mode === "onboarding" &&
        !user.setup_completed_at &&
        !user.education_framework
      ) {
        router.replace("/personal-area/setup");
        return;
      }
      if (mode === "manage" && !user.setup_completed_at) {
        router.replace("/personal-area/setup");
        return;
      }
      setProfile(user);
      if (frameworkUpdated || !user.plan_id) {
        setChangingPlan(true);
        setSelectedPlanId(null);
      } else if (user.plan_id) {
        setSelectedPlanId(user.plan_id ?? null);
      }
      if (user.plan_custom_classes != null) {
        setCustomClasses(user.plan_custom_classes);
      }
      if (user.plan_custom_students != null) {
        setCustomStudents(user.plan_custom_students);
      }

      const billing = await loadBillingPlans();
      if (!cancelled && billing) {
        setPlans(billing.plans);
        setSumitConfigured(billing.sumitConfigured);
        setUnitPrices(billing.unitPrices);
      }

      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, router, frameworkUpdated]);

  const pendingPayment =
    profile?.subscription_status === "pending_payment" && !changingPlan;
  const activeSubscription = profile?.subscription_status === "active";
  const selectedPlan =
    (selectedPlanId ? plans.find((p) => p.id === selectedPlanId) : null) ??
    (profile?.plan_id ? plans.find((p) => p.id === profile.plan_id) : null) ??
    (selectedPlanId ? getPlanById(selectedPlanId) : null) ??
    (profile?.plan_id ? getPlanById(profile.plan_id) : null);

  useEffect(() => {
    if (!activeSubscription || mode !== "onboarding") return;
    if (!profile?.setup_completed_at) {
      router.replace("/personal-area/setup");
    }
  }, [activeSubscription, mode, profile, router]);

  const standardPlans = plans.filter((plan) => plan.id !== CUSTOM_PLAN_ID);
  const customPlanFromCatalog = plans.find((plan) => plan.id === CUSTOM_PLAN_ID);
  const frameworkLabel =
    profile?.education_framework === "regular"
      ? "חינוך רגיל"
      : profile?.education_framework === "special"
        ? "חינוך מיוחד"
        : null;

  async function saveSelection(): Promise<UserProfile | null> {
    if (!selectedPlanId) return null;
    if (
      selectedPlanId === CUSTOM_PLAN_ID &&
      customClasses === 0 &&
      customStudents === 0
    ) {
      setError("נא לבחור לפחות תיק כיתה/גן אחד או תלמיד אחד.");
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string | number> = { plan_id: selectedPlanId };
      if (selectedPlanId === CUSTOM_PLAN_ID) {
        payload.custom_classes = customClasses;
        payload.custom_students = customStudents;
      }

      const response = await fetch("/api/billing/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: UserProfile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        if (data.error === "PLAN_NOT_ALLOWED") {
          throw new Error("החבילה שנבחרה אינה זמינה לסוג המוסד שלכם.");
        }
        if (data.error === "PLAN_NOT_IN_CATALOG") {
          throw new Error("החבילה שנבחרה לא נמצאת בקטלוג. בחרו חבילה מחדש.");
        }
        if (data.error === "INVALID_CUSTOM_PLAN") {
          throw new Error("נא לבחור מספר תיקי שילוב/סל וכיתות ח״מ תקין.");
        }
        throw new Error("לא ניתן לשמור את הבחירה. נסו שוב.");
      }
      cacheAuthenticatedUser(data.profile);
      setProfile(data.profile);
      setSelectedPlanId(data.profile.plan_id ?? null);
      setChangingPlan(false);
      return data.profile;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "לא ניתן לשמור את הבחירה. נסו שוב."
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function startPayment() {
    setPaying(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/pay", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        paymentUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.paymentUrl) {
        if (data.error === "PAYMENT_NOT_CONFIGURED") {
          throw new Error(
            "תשלום מקוון עדיין לא הוגדר לחבילה שנבחרה. ניצור איתכם קשר."
          );
        }
        if (data.error === "PLAN_NOT_IN_CATALOG") {
          throw new Error("החבילה שנבחרה לא נמצאת בקטלוג. בחרו חבילה מחדש.");
        }
        throw new Error("לא ניתן להתחיל תשלום. נסו שוב.");
      }
      window.location.assign(data.paymentUrl);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "לא ניתן להתחיל תשלום. נסו שוב."
      );
      setPaying(false);
    }
  }

  async function handleContinue() {
    const saved = await saveSelection();
    if (!saved) return;
    if (mode === "onboarding") {
      if (sumitConfigured) {
        await startPayment();
      } else {
        router.replace(institutionProfileHref(saved));
      }
    }
  }

  if (loading) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="personalArea.loading" />
      </div>
    );
  }

  if (!profile) return null;

  if (pendingPayment && selectedPlan) {
    return (
      <div className="menu-box mx-auto w-full max-w-2xl space-y-5 p-5">
        <div className="text-center">
          <CreditCard className="mx-auto h-10 w-10 text-brand-600" />
          <h1 className="mt-3 text-2xl font-bold text-ink">
            <EditableText path="billing.pendingPaymentTitle" />
          </h1>
          <p className="mt-2 text-sm text-pink">
            <EditableText path="billing.pendingPaymentSubtitle" as="span" />
          </p>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="text-sm font-semibold text-brand-700">
            {selectedPlan.title}
          </div>
          <PlanFeaturesList plan={selectedPlan} compact className="mt-3" />
        </div>

        <p className="text-center text-sm text-brand-800">
          {sumitConfigured ? (
            <EditableText path="billing.pendingPaymentRedirectNote" as="span" />
          ) : (
            <EditableText path="billing.paymentComingSoon" as="span" />
          )}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {sumitConfigured ? (
            <Button
              type="button"
              size="lg"
              disabled={paying || saving}
              className="sm:min-w-[180px]"
              onClick={() => void startPayment()}
            >
              <CreditCard className="h-5 w-5" />
              {paying ? (
                <EditableText path="billing.redirectingToPayment" />
              ) : (
                <EditableText path="billing.payNow" />
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={saving}
              className="sm:min-w-[180px]"
              onClick={() => router.replace(institutionProfileHref(profile))}
            >
              <EditableText path="billing.continueWithoutPayment" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setChangingPlan(true)}
          >
            <EditableText path="billing.changePlan" />
          </Button>
        </div>

        <div className="text-center">
          <Link
            href={SETUP_FROM_PLAN_HREF}
            className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
          >
            <ArrowRight className="h-4 w-4" />
            <EditableText path="billing.changeFramework" />
          </Link>
        </div>

        <p className="text-center text-xs text-pink">
          <EditableText path="billing.bankTransferHint" as="span" />
          {" "}
          {bankRequestSent ? (
            <span className="text-sm font-medium text-brand-700">
              הבקשה נשלחה בהצלחה
            </span>
          ) : (
            <ContactButton
              variant="link"
              size="sm"
              className="inline"
              labelPath="billing.bankTransferContact"
              recipient="bank-transfer"
              defaultSubject="תשלום בהעברה בנקאית — פרוטוקל"
              defaultMessage={
                selectedPlan
                  ? `שלום,\n\nבחרתי חבילה: ${selectedPlan.title}.\nמעוניינ/ת לשלם בהעברה בנקאית.\n\nיש לי קופון למימוש: \n\nתודה`
                  : ""
              }
              onSent={() => setBankRequestSent(true)}
              onBeforeOpen={async () => {
                try {
                  await fetch("/api/billing/request-bank-transfer", {
                    method: "POST",
                  });
                } catch {
                  // ignore
                }
                return true;
              }}
            />
          )}
        </p>

        {error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        {mode === "manage" ? (
          <div className="text-center">
            <Link
              href={institutionProfileHref(profile)}
              className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
            >
              <EditableText path="personalArea.backToProfile" />
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="menu-box mx-auto w-full max-w-2xl space-y-5 p-5 text-center">
        <Package className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="text-2xl font-bold text-ink">
          <EditableText path="billing.noPlansTitle" />
        </h1>
        <p className="text-sm text-pink">
          <EditableText path="billing.noPlansSubtitle" as="span" />
        </p>
        {frameworkLabel ? (
          <p className="text-sm font-medium text-brand-800">
            מסגרת נוכחית: {frameworkLabel}
          </p>
        ) : null}
        <div className="flex flex-col items-center gap-3">
          <Link
            href={SETUP_FROM_PLAN_HREF}
            className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
          >
            <ArrowRight className="h-4 w-4" />
            <EditableText path="billing.changeFramework" />
          </Link>
          <ContactButton size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="menu-box mx-auto w-full max-w-3xl space-y-6 p-5">
      <div className="text-center">
        <Package className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-3 text-2xl font-bold text-ink">
          <EditableText
            path={mode === "manage" ? "billing.manageTitle" : "billing.title"}
          />
        </h1>
        <p className="mt-2 text-sm text-pink">
          <EditableText
            path={
              mode === "manage" ? "billing.manageSubtitle" : "billing.subtitle"
            }
            as="span"
          />
        </p>
        <p className="mt-1 text-xs text-brand-600">
          <EditableText path="billing.annualNote" as="span" />
        </p>
        {frameworkLabel ? (
          <p className="mt-2 text-sm font-medium text-ink">
            מסגרת נוכחית: {frameworkLabel}
          </p>
        ) : null}
        {frameworkUpdated ? (
          <p className="mt-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
            המסגרת עודכנה. בחרו חבילה שמתאימה למסגרת החדשה.
          </p>
        ) : null}
        <div className="mt-3">
          <Link
            href={SETUP_FROM_PLAN_HREF}
            className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
          >
            <ArrowRight className="h-4 w-4" />
            <EditableText path="billing.changeFramework" />
          </Link>
        </div>
      </div>

      {mode === "manage" && profile.plan_id && !changingPlan && selectedPlan ? (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="text-sm font-semibold text-brand-700">
            <EditableText path="billing.currentPlanLabel" as="span" />
          </div>
          <PlanFeaturesList plan={selectedPlan} compact className="mt-3" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setChangingPlan(true)}
          >
            <EditableText path="billing.changePlan" />
          </Button>
        </div>
      ) : null}

      {changingPlan || mode === "onboarding" || !profile.plan_id ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {standardPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlanId === plan.id}
                disabled={saving}
                onSelect={() => setSelectedPlanId(plan.id)}
              />
            ))}
            {customPlanFromCatalog ? (
              <CustomPlanCard
                selected={selectedPlanId === CUSTOM_PLAN_ID}
                disabled={saving}
                institutionType={profile.institution_type ?? null}
                classes={customClasses}
                students={customStudents}
                unitPrices={unitPrices}
                onSelect={() => setSelectedPlanId(CUSTOM_PLAN_ID)}
                onClassesChange={setCustomClasses}
                onStudentsChange={setCustomStudents}
              />
            ) : null}
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

        <div className="flex flex-col items-center gap-3">
            <Button
              type="button"
              size="lg"
              disabled={!selectedPlanId || saving}
              onClick={() => void handleContinue()}
            >
              <CreditCard className="h-5 w-5" />
              {saving ? (
                <EditableText path="billing.saving" />
              ) : (
                <EditableText path="billing.continueToPayment" />
              )}
            </Button>

            {selectedPlan && selectedPlanId ? (
              <div className="text-center">
                <p className="text-xs text-pink">
                  <EditableText path="billing.bankTransferHint" as="span" />
                </p>
                {bankRequestSent ? (
                  <p className="mt-1 text-sm font-medium text-brand-700">
                    הבקשה נשלחה בהצלחה
                  </p>
                ) : (
                <ContactButton
                  variant="link"
                  size="sm"
                  className="mt-1"
                  labelPath="billing.bankTransferContact"
                  recipient="bank-transfer"
                  defaultSubject="תשלום בהעברה בנקאית — פרוטוקל"
                  defaultMessage={`שלום,\n\nבחרתי חבילה: ${selectedPlan.title}.\nמעוניינ/ת לשלם בהעברה בנקאית.\n\nיש לי קופון למימוש: \n\nתודה`}
                  onSent={() => setBankRequestSent(true)}
                  onBeforeOpen={async () => {
                    if (!selectedPlanId) return false;
                    setSaving(true);
                    try {
                      await fetch("/api/billing/select-plan", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ plan_id: selectedPlanId }),
                      });
                      await fetch("/api/billing/request-bank-transfer", {
                        method: "POST",
                      });
                      return true;
                    } catch {
                      return true;
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
                )}
              </div>
            ) : null}

            {mode === "manage" ? (
              <div className="flex flex-col items-center gap-2">
                <Link
                  href={SETUP_FROM_PLAN_HREF}
                  className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
                >
                  <ArrowRight className="h-4 w-4" />
                  <EditableText path="billing.changeFramework" />
                </Link>
                <Link
                  href={institutionProfileHref(profile)}
                  className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
                >
                  <EditableText path="personalArea.backToProfile" />
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <Link
                href={SETUP_FROM_PLAN_HREF}
                className="inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
              >
                <ArrowRight className="h-4 w-4" />
                <EditableText path="billing.changeFramework" />
              </Link>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
