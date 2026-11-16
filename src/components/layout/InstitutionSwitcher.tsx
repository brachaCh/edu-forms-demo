"use client";

/**
 * TZ-17: מחליף מוסד בכותרת / אזור אישי
 * מוצג רק כשלמשתמש יש יותר ממוסד אחד
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  cacheAuthenticatedUser,
  clearInstitutionSpecificCaches,
  getUser,
} from "@/lib/mock-store";
import type { UserInstitutionWithDetails, UserProfile } from "@/lib/supabase/types";

interface InstitutionsData {
  institutions: UserInstitutionWithDetails[];
  activeInstitutionId: string | null;
  hasMultipleInstitutions: boolean;
}

export function InstitutionSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [data, setData] = useState<InstitutionsData | null>(null);

  const currentUser = getUser();
  const currentInstitutionName =
    currentUser?.institution_name || currentUser?.institution_code || "";

  useEffect(() => {
    if (!open) return;

    async function loadInstitutions() {
      setLoading(true);
      try {
        const response = await fetch("/api/auth/institutions");
        if (response.ok) {
          const result = (await response.json()) as InstitutionsData;
          setData(result);
        }
      } catch (err) {
        console.error("[InstitutionSwitcher]", err);
      } finally {
        setLoading(false);
      }
    }

    loadInstitutions();
  }, [open]);

  async function handleSwitch(institutionId: string) {
    setSwitching(institutionId);

    try {
      const response = await fetch("/api/auth/switch-institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: institutionId }),
      });

      if (!response.ok) {
        throw new Error("SWITCH_FAILED");
      }

      const result = (await response.json()) as { profile: UserProfile };

      // TZ-17: ניקוי כל המטמונים הספציפיים למוסד
      clearInstitutionSpecificCaches();
      cacheAuthenticatedUser(result.profile);

      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("[InstitutionSwitcher] switch:", err);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <Building2 className="h-5 w-5" />
          <span className="max-w-[150px] truncate">
            {currentInstitutionName || "החלפת מוסד"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>החלפת מוסד</DialogTitle>
          <DialogDescription>בחרי מוסד אחר לעבודה</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.institutions?.length ? (
            data.institutions.map((inst) => {
              const isActive =
                inst.institution_id === data.activeInstitutionId ||
                inst.institution_id === currentUser?.institution_id;

              return (
                <Button
                  key={inst.institution_id}
                  variant={isActive ? "default" : "outline"}
                  size="lg"
                  className="h-auto w-full justify-start gap-3 px-3 py-3"
                  disabled={switching !== null}
                  onClick={() => handleSwitch(inst.institution_id)}
                >
                  {switching === inst.institution_id ? (
                    <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                  ) : inst.logo_url ? (
                    <img
                      src={inst.logo_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex flex-col items-start text-right">
                    <span className="text-sm font-medium">
                      {inst.institution_name || inst.institution_code}
                    </span>
                    {inst.school_name && (
                      <span className="text-xs opacity-70">
                        {inst.school_name}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <span className="mr-auto text-xs opacity-70">נבחר</span>
                  )}
                </Button>
              );
            })
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              אין מוסדות נוספים
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
