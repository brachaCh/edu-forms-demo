"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";

export function PlatformSubscriptionsManageButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: { isPlatformAdmin?: boolean }) => {
        if (!cancelled) setVisible(data.isPlatformAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <Button asChild variant="outline" size="lg">
      <Link href="/platform-admin">
        <Package className="h-5 w-5" />
        <EditableText path="platform.subscriptionsNav" as="span" />
      </Link>
    </Button>
  );
}
