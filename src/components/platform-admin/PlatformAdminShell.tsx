"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  CreditCard,
  Video,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { EditableText } from "@/components/editable/EditableText";
import { useSessionHome } from "@/components/layout/useSessionHome";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/platform-admin",
    label: "לוח בקרה",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/platform-admin/subscriptions",
    label: "ניהול מנויים",
    icon: Package,
    exact: false,
  },
  {
    href: "/platform-admin/pricing",
    label: "מחירים וחבילה אישית",
    icon: CreditCard,
    exact: false,
  },
  {
    href: "/platform-admin/tutorials",
    label: "סרטוני הדרכה",
    icon: Video,
    exact: false,
  },
  {
    href: "/platform-admin/institutions",
    label: "מוסדות ומשתמשים",
    icon: Building2,
    exact: false,
  },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { homeHref, loggedIn } = useSessionHome();

  return (
    <div className="flex min-h-full flex-col bg-brand-gradient">
      <Header />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-3 lg:flex-row lg:gap-6">
        <aside className="mb-4 flex shrink-0 flex-col gap-2 lg:mb-0 lg:w-56 lg:py-2">
          <nav className="flex flex-row flex-wrap gap-2 lg:flex-col">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-brand-500 text-white shadow-md"
                      : "bg-white/70 text-brand-800 hover:bg-brand-100 border border-brand-200"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <Link
            href={loggedIn ? homeHref : "/dashboard"}
            className="mt-auto hidden items-center gap-2 rounded-xl border border-brand-200 bg-white/70 px-4 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100 lg:flex"
          >
            <ArrowRight className="h-5 w-5" />
            {loggedIn ? (
              <EditableText path="personalArea.backToProfile" />
            ) : (
              <span>חזרה לדף הבית</span>
            )}
          </Link>
        </aside>
        <main className="min-w-0 flex-1 animate-fade-in pb-12">
          {children}
        </main>
      </div>
    </div>
  );
}
