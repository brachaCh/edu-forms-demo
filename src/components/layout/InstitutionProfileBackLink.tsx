"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { useSessionHome } from "@/components/layout/useSessionHome";
import { cn } from "@/lib/utils";

interface InstitutionProfileBackLinkProps {
  className?: string;
  href?: string;
  visible?: boolean;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}

/** «חזרה לפרופיל המוסד» — למשתמשת מחוברת עם מוסד, בכל מסכי האפליקציה */
export function InstitutionProfileBackLink({
  className,
  href,
  visible,
  variant = "outline",
  size = "sm",
}: InstitutionProfileBackLinkProps) {
  const session = useSessionHome();
  const show = visible ?? session.showInstitutionProfileBack;
  const target = href ?? session.homeHref;

  if (!show) return null;

  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link
        href={target}
        aria-label="חזרה לפרופיל מוסד"
        className="whitespace-nowrap"
      >
        <ArrowRight className="h-4 w-4" />
        <EditableText path="personalArea.backToProfile" />
      </Link>
    </Button>
  );
}
