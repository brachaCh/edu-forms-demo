import { notFound, redirect } from "next/navigation";
import { isSpecialEdMode } from "@/lib/special-ed-mode";
import { teacherNameFromSearchParam } from "@/lib/personal-sector";

export const dynamic = "force-dynamic";

interface SpecialEdClassModeQueryPageProps {
  params: Promise<{ status: string; mode: string }>;
  searchParams: Promise<{ name?: string; sector?: string; framework?: string }>;
}

/**
 * Alias ישן — Turbopack לא רושם /class-mode ליד /class.
 * מפנה לראוט /mode שעובד.
 */
export default async function SpecialEdClassModeAliasPage({
  params,
  searchParams,
}: SpecialEdClassModeQueryPageProps) {
  const { status, mode } = await params;
  const query = await searchParams;
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }

  const className = teacherNameFromSearchParam(query.name);
  if (!className) {
    redirect("/personal-area/category/special-ed-class");
  }

  const paramsOut = new URLSearchParams();
  paramsOut.set("name", className);
  if (query.sector) paramsOut.set("sector", query.sector);
  if (query.framework) paramsOut.set("framework", query.framework);
  redirect(
    `/personal-area/category/special-ed-class/mode/${mode}?${paramsOut.toString()}`
  );
}
