"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableText } from "@/components/editable/EditableText";

export function PlatformSubscriptionsNavLink() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const href = "/platform-admin/subscriptions";
  const active = pathname === href || pathname.startsWith(`${href}/`);

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
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
        active
          ? "bg-brand-500 text-white shadow-md"
          : "text-brand-800 hover:bg-brand-100"
      )}
    >
      <Package className="h-5 w-5" />
      <EditableText path="platform.subscriptionsNav" as="span" />
    </Link>
  );
}
