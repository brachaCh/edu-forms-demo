"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ClipboardList, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { PlatformSubscriptionsManageButton } from "@/components/platform/PlatformSubscriptionsManageButton";
import { InstitutionSwitcher } from "@/components/layout/InstitutionSwitcher";
import { clearUser } from "@/lib/mock-store";

export function PersonalAreaManageActions() {
  const router = useRouter();
  const [hasMultipleInstitutions, setHasMultipleInstitutions] = useState(false);

  useEffect(() => {
    async function checkInstitutions() {
      try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
          const data = (await response.json()) as {
            hasMultipleInstitutions?: boolean;
          };
          setHasMultipleInstitutions(data.hasMultipleInstitutions === true);
        }
      } catch {
        // Ignore errors - just don't show switcher
      }
    }
    checkInstitutions();
  }, []);

  async function handleLogout() {
    clearUser();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // offline — עדיין חוזרים לדף הבית
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
      <PlatformSubscriptionsManageButton />
      {hasMultipleInstitutions && <InstitutionSwitcher />}
      <Button asChild variant="outline" size="lg">
        <Link href="/personal-area/archive">
          <Archive className="h-5 w-5" />
          <EditableText path="personalArea.studentsArchiveButton" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link href="/admin/logs">
          <ClipboardList className="h-5 w-5" />
          <EditableText path="admin.logsNavTitle" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link href="/personal-area/setup?edit=1">
          <Settings className="h-5 w-5" />
          <EditableText path="personalArea.managePersonalArea" />
        </Link>
      </Button>
      <Button onClick={() => void handleLogout()} variant="outline" size="lg">
        <LogOut className="h-5 w-5" />
        <EditableText path="personalArea.logout" />
      </Button>
    </div>
  );
}
