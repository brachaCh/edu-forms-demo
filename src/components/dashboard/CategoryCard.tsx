import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  gradient: "primary" | "secondary" | "tertiary" | "quaternary";
}

const gradients = {
  primary: "from-[#2F3B67] to-[#242C4F]",
  secondary: "from-[#10B7C6] to-[#0D96A3]",
  tertiary: "from-[#FF7A20] to-[#E66A14]",
  quaternary: "from-[#6B2DBD] to-[#58249C]",
};

export function CategoryCard({
  href,
  title,
  description,
  icon: Icon,
  gradient,
}: CategoryCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-3xl border-2 border-brand-200 bg-white p-6 shadow-md transition-all hover:-translate-y-1 hover:border-brand-400 hover:shadow-xl"
    >
      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md",
          gradients[gradient]
        )}
      >
        <Icon className="h-7 w-7" strokeWidth={2.2} />
      </div>
      <h3 className="mb-1 text-xl font-bold text-brand-900">{title}</h3>
      <p className="mb-4 flex-1 text-sm text-brand-600 leading-relaxed">
        {description}
      </p>
      <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors group-hover:text-brand-900">
        כניסה לקטגוריה
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
      </div>
    </Link>
  );
}
