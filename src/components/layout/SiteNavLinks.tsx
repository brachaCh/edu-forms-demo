"use client";

import Link from "next/link";
import { Accessibility, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactButton } from "@/components/contact/ContactButton";
import { EditableText } from "@/components/editable/EditableText";
import { isDemoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";

interface SiteNavLinksProps {
  className?: string;
}

const LEGAL_LINKS = [
  {
    href: "/accessibility",
    icon: Accessibility,
    labelPath: "landing.accessibilityLink" as const,
  },
  {
    href: "/terms",
    icon: ScrollText,
    labelPath: "landing.termsOfUseLink" as const,
  },
  {
    href: "/privacy",
    icon: ShieldCheck,
    labelPath: "landing.privacyLink" as const,
  },
] as const;

/** מסמכים משפטיים + צרו קשר — מוצגים בכל הדפים דרך SiteFooter */
export function SiteNavLinks({ className }: SiteNavLinksProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-1 gap-y-1 sm:gap-x-2",
        className
      )}
    >
      {LEGAL_LINKS.map((item) => (
        <Button
          key={item.href}
          asChild
          variant="ghost"
          size="sm"
          className="h-8 px-2"
        >
          <Link href={item.href}>
            <item.icon className="h-4 w-4" />
            <EditableText path={item.labelPath} as="span" />
          </Link>
        </Button>
      ))}
      {!isDemoMode() && (
        <ContactButton variant="ghost" size="sm" className="h-8 px-2" />
      )}
    </div>
  );
}
