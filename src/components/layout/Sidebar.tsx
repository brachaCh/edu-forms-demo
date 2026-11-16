"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  User,
  Home,
  LayoutDashboard,
  Accessibility,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { PlatformSubscriptionsNavLink } from "@/components/platform/PlatformSubscriptionsNavLink";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { sidebarHomeHref } from "@/lib/auth-navigation";
import { subscribeAuthSessionChanged } from "@/lib/auth-session-events";
import { getUser } from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const REST_NAV_ITEMS = [
  { href: "/personal-area", label: "האזור האישי שלך", icon: User },
  {
    href: "/personal-area/summary",
    label: "סיכום ורשימות",
    icon: LayoutDashboard,
  },
  { href: "/accessibility", label: "הצהרת נגישות", icon: Accessibility },
  { href: "/terms", label: "תקנון שימוש", icon: ScrollText },
  { href: "/privacy", label: "מדיניות פרטיות", icon: ShieldCheck },
  { href: "/admin", label: "הגדרות מנהל", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { guestDemo } = useDataStore();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    setUser(getUser());
    return subscribeAuthSessionChanged(() => setUser(getUser()));
  }, []);

  const homeHref = sidebarHomeHref({
    loggedIn: Boolean(user) && !guestDemo,
    profile: user,
  });
  const navItems = [
    { href: homeHref, label: "דף הבית", icon: Home },
    ...REST_NAV_ITEMS,
  ];

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-1 border-l border-brand-200 bg-white/70 p-4 lg:flex">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-brand-500 text-white shadow-md"
                  : "text-brand-800 hover:bg-brand-100"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <PlatformSubscriptionsNavLink />
      </nav>
      <div className="mt-auto rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 text-center">
        <div className="text-xs font-medium text-brand-700">
          האתר בהרצה - גרסה 0.1
        </div>
      </div>
    </aside>
  );
}
