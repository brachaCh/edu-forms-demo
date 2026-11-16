import { redirect } from "next/navigation";
import {
  teacherNameFromSearchParam,
} from "@/lib/personal-sector";

export const dynamic = "force-dynamic";

interface LegacyBrokenClassModePageProps {
  params: Promise<{ status: string; mode: string }>;
  searchParams: Promise<{ name?: string; sector?: string; framework?: string }>;
}

/**
 * ראוט ישן שנשבר ב-Turbopack — מפנה ל-/mode/...
 */
export default async function LegacyBrokenClassModeRedirectPage({
  params,
  searchParams,
}: LegacyBrokenClassModePageProps) {
  const { status, mode } = await params;
  const query = await searchParams;
  const className = teacherNameFromSearchParam(query.name);
  const qs = new URLSearchParams();
  if (className) qs.set("name", className);
  if (query.sector) qs.set("sector", query.sector);
  if (query.framework) qs.set("framework", query.framework);
  const q = qs.toString();
  redirect(
    `/personal-area/category/${status}/mode/${mode}${q ? `?${q}` : ""}`
  );
}
