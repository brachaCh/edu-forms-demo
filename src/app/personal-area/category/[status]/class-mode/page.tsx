import { notFound, redirect } from "next/navigation";
import { teacherNameFromSearchParam } from "@/lib/personal-sector";

export const dynamic = "force-dynamic";

interface ClassModeIndexRedirectProps {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ name?: string; sector?: string; framework?: string }>;
}

/**
 * נתיב שבור בלי [mode] (למשל אחרי «חזרה» ישנה) —
 * מפנה לבחירת מצב כיתה או לרשימת כיתות.
 */
export default async function ClassModeIndexRedirect({
  params,
  searchParams,
}: ClassModeIndexRedirectProps) {
  const { status } = await params;
  const query = await searchParams;
  if (status !== "special-ed-class") notFound();

  const className = teacherNameFromSearchParam(query.name);
  if (className) {
    const paramsOut = new URLSearchParams();
    paramsOut.set("name", className);
    if (query.sector) paramsOut.set("sector", query.sector);
    if (query.framework) paramsOut.set("framework", query.framework);
    redirect(
      `/personal-area/category/special-ed-class/class?${paramsOut.toString()}`
    );
  }

  redirect("/personal-area/category/special-ed-class");
}
