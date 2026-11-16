"use client";

/**
 * TZ-17: בורר מוסד — מוצג אחרי כניסה כשלמשתמש יש יותר ממוסד אחד
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { Logo } from "@/components/layout/Logo";
import {
  cacheAuthenticatedUser,
  clearInstitutionSpecificCaches,
} from "@/lib/mock-store";
import { safePersonalAreaNext } from "@/lib/auth-navigation";
import type { UserInstitutionWithDetails, UserProfile } from "@/lib/supabase/types";

interface InstitutionsData {
  institutions: UserInstitutionWithDetails[];
  activeInstitutionId: string | null;
  hasMultipleInstitutions: boolean;
}

export function InstitutionPickerPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstitutionsData | null>(null);

  // Preserve `next` from login flow, validated as safe same-origin path
  const nextParam = searchParams.get("next");
  const postPickHref = safePersonalAreaNext(nextParam) ?? "/personal-area";

  useEffect(() => {
    async function loadInstitutions() {
      try {
        const response = await fetch("/api/auth/institutions");
        if (!response.ok) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error("FETCH_FAILED");
        }
        const result = (await response.json()) as InstitutionsData;
        setData(result);

        // אם יש רק מוסד אחד — ישר ליעד המבוקש
        if (result.institutions.length === 1) {
          router.replace(postPickHref);
          return;
        }

        // אם אין מוסדות — להגדרות
        if (result.institutions.length === 0) {
          router.replace("/personal-area/setup");
          return;
        }
      } catch (err) {
        console.error("[InstitutionPicker]", err);
        setError("שגיאה בטעינת רשימת המוסדות");
      } finally {
        setLoading(false);
      }
    }

    loadInstitutions();
  }, [router, postPickHref]);

  async function handleSelectInstitution(institutionId: string) {
    setSwitching(institutionId);
    setError(null);

    try {
      const response = await fetch("/api/auth/switch-institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: institutionId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "SWITCH_FAILED");
      }

      const result = (await response.json()) as { profile: UserProfile };

      // TZ-17: ניקוי כל המטמונים הספציפיים למוסד
      clearInstitutionSpecificCaches();
      cacheAuthenticatedUser(result.profile);

      router.replace(postPickHref);
    } catch (err) {
      console.error("[InstitutionPicker] switch:", err);
      setError("שגיאה בהחלפת מוסד");
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.institutions.length === 0) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#E4EAF3] to-[#F8F9FB] p-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <EditableText path="auth.selectInstitutionTitle" as="span" />
          </CardTitle>
          <CardDescription>
            <EditableText path="auth.selectInstitutionSubtitle" as="span" />
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {error && (
            <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {data.institutions.map((inst) => (
            <Button
              key={inst.institution_id}
              variant="outline"
              size="lg"
              className="h-auto w-full justify-start gap-3 px-4 py-4"
              disabled={switching !== null}
              onClick={() => handleSelectInstitution(inst.institution_id)}
            >
              {switching === inst.institution_id ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : inst.logo_url ? (
                <img
                  src={inst.logo_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-contain"
                />
              ) : (
                <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex flex-col items-start text-right">
                <span className="font-semibold">
                  {inst.institution_name || inst.institution_code}
                </span>
                {inst.school_name && (
                  <span className="text-sm text-muted-foreground">
                    {inst.school_name}
                  </span>
                )}
              </div>
              {inst.institution_id === data.activeInstitutionId && (
                <span className="mr-auto rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                  פעיל
                </span>
              )}
            </Button>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
