import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { EditableText } from "@/components/editable/EditableText";

interface SimpleMenuItemProps {
  href: string;
  textPath: string;
  icon: LucideIcon;
}

export function SimpleMenuItem({ href, textPath, icon: Icon }: SimpleMenuItemProps) {
  return (
    <Link href={href} className="menu-item">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <EditableText
        path={textPath}
        as="span"
        className="text-lg font-semibold text-ink"
      />
    </Link>
  );
}
