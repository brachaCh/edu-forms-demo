import type { Category, StudentStatus, UserProfile } from "@/lib/supabase/types";

export type PersonalSector = Exclude<Category, "tutorials">;

export type EducationFramework = "regular" | "special";

/** Entry surface that owns the sector → framework → table flow */
export type SectorArea = "personal-area" | "dashboard";

export const PERSONAL_SECTORS: PersonalSector[] = [
  "kindergartens",
  "schools",
  "high-schools",
];

export const EDUCATION_FRAMEWORKS: EducationFramework[] = [
  "regular",
  "special",
];

/** ברירת מחדל לכניסה לאזור האישי (דילוג על בחירת מגזר ומסגרת) */
export const DEFAULT_PERSONAL_SECTOR: PersonalSector = "schools";
export const DEFAULT_EDUCATION_FRAMEWORK: EducationFramework = "special";

export const SECTOR_TEXT_PATH: Record<PersonalSector, string> = {
  kindergartens: "categories.kindergartens",
  "high-schools": "categories.highSchools",
  schools: "categories.schools",
};

/** Dashboard cubes keep production copy under dashboard.* */
export const DASHBOARD_SECTOR_TEXT_PATH: Record<PersonalSector, string> = {
  kindergartens: "dashboard.kindergartens",
  "high-schools": "dashboard.highSchools",
  schools: "dashboard.schools",
};

export const SECTOR_SUBTITLE_PATH: Record<PersonalSector, string> = {
  kindergartens: "categories.kindergartensSubtitle",
  "high-schools": "categories.highSchoolsSubtitle",
  schools: "categories.schoolsSubtitle",
};

export const FRAMEWORK_TEXT_PATH: Record<EducationFramework, string> = {
  regular: "personalArea.regularFramework",
  special: "personalArea.specialFramework",
};

export function isPersonalSector(value: string): value is PersonalSector {
  return (PERSONAL_SECTORS as string[]).includes(value);
}

export function isEducationFramework(
  value: string
): value is EducationFramework {
  return (EDUCATION_FRAMEWORKS as string[]).includes(value);
}

function sectorBase(area: SectorArea, sector: PersonalSector): string {
  return area === "dashboard"
    ? `/dashboard/${sector}`
    : `/personal-area/sector-home/${sector}`;
}

/** נתיב ארוך ל-status — middleware מעביר ל-/personal-area/category/... */
function sectorLegacyBase(area: SectorArea, sector: PersonalSector): string {
  return area === "dashboard"
    ? `/dashboard/${sector}`
    : `/personal-area/sector/${sector}`;
}

export function sectorHomeHref(
  sector: PersonalSector,
  area: SectorArea = "personal-area"
): string {
  return sectorBase(area, sector);
}

export function sectorFrameworkHref(
  sector: PersonalSector,
  framework: EducationFramework,
  area: SectorArea = "personal-area"
): string {
  if (area === "dashboard") {
    return `${sectorBase(area, sector)}/framework/${framework}`;
  }
  return `/personal-area/sector-table/${sector}/${framework}`;
}

/** פרופיל המוסד — לפי סוג המוסד ומסגרת החינוך שהוגדרו בהגדרות */
export function institutionProfileHref(
  profile: Pick<UserProfile, "institution_type" | "education_framework">,
  area: SectorArea = "personal-area"
): string {
  const sector = profile.institution_type ?? DEFAULT_PERSONAL_SECTOR;
  const framework = profile.education_framework ?? DEFAULT_EDUCATION_FRAMEWORK;
  return sectorFrameworkHref(sector, framework, area);
}

export function defaultPersonalCategoryTableHref(
  area: SectorArea = "personal-area"
): string {
  // כניסה לאזור האישי — בחירת מסגרת (רגיל / מיוחד), לא ישר לטבלת קטגוריות
  return sectorHomeHref(DEFAULT_PERSONAL_SECTOR, area);
}

export function sectorStatusHref(
  sector: PersonalSector,
  status: StudentStatus,
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area"
): string {
  return `${sectorLegacyBase(area, sector)}/framework/${framework}/status/${status}`;
}

/** שם מורה ב-query, לא בנתיב — שמות בעברית ב-[teacher] מחזירים 404 ב-Next.js */
export function withTeacherNameQuery(pathname: string, teacherName: string): string {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "");
  const name = teacherName.trim();
  if (!name) return path;
  return `${path}?name=${encodeURIComponent(name)}`;
}

export function withSectorContextQuery(
  href: string,
  sector?: PersonalSector,
  framework?: EducationFramework,
  area?: SectorArea
): string {
  const [path, existing] = href.split("?");
  const params = new URLSearchParams(existing);
  if (sector) params.set("sector", sector);
  if (framework) params.set("framework", framework);
  if (area && area !== "personal-area") params.set("area", area);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : (path ?? href);
}

export function sectorContextFromSearchParams(sp: {
  get(name: string): string | null;
}): {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
} {
  const sectorRaw = sp.get("sector") ?? "";
  const frameworkRaw = sp.get("framework") ?? "";
  const areaRaw = sp.get("area") ?? "";
  return {
    sector: isPersonalSector(sectorRaw) ? sectorRaw : undefined,
    framework: isEducationFramework(frameworkRaw) ? frameworkRaw : undefined,
    area:
      areaRaw === "dashboard" || areaRaw === "personal-area" ? areaRaw : undefined,
  };
}

export function teacherNameFromSearchParam(
  name: string | string[] | undefined | null
): string {
  const raw = Array.isArray(name) ? name[0] : name;
  if (raw == null) return "";
  const value = String(raw).replace(/\+/g, " ").trim();
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value;
  }
}

export function categoryTeacherHref(
  status: StudentStatus,
  teacherName: string
): string {
  return withTeacherNameQuery(
    `/personal-area/category/${status}/teacher`,
    teacherName
  );
}

export function categorySpecialEdModeTeacherHref(
  mode: "student" | "curriculum",
  teacherName: string
): string {
  return withTeacherNameQuery(
    `/personal-area/category/special-ed-class/mode/${mode}/teacher`,
    teacherName
  );
}

export function sectorTeacherHref(
  sector: PersonalSector,
  status: StudentStatus,
  teacherName: string,
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area"
): string {
  return withSectorContextQuery(
    withTeacherNameQuery(
      `/personal-area/category/${status}/teacher`,
      teacherName
    ),
    sector,
    framework,
    area
  );
}

export function sectorFrequencyHref(
  sector: PersonalSector,
  status: StudentStatus,
  frequency: "high" | "low",
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area"
): string {
  return `${sectorLegacyBase(area, sector)}/framework/${framework}/status/${status}/frequency/${frequency}`;
}

export function sectorSpecialEdModeHref(
  sector: PersonalSector,
  mode: "student" | "curriculum",
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area",
  className?: string | null
): string {
  const base = `${sectorLegacyBase(area, sector)}/framework/${framework}/status/special-ed-class`;
  const key = (className ?? "").trim();
  const href = `${base}/mode/${mode}`;
  if (key) return withTeacherNameQuery(href, key);
  return href;
}

/** קישור למצב ניהול כיתה (תל"כ / תיק תלמיד) בנתיב category */
export function categorySpecialEdClassModeHref(
  mode: "student" | "curriculum",
  className: string
): string {
  return withTeacherNameQuery(
    `/personal-area/category/special-ed-class/mode/${mode}`,
    className
  );
}

export function sectorSpecialEdClassHref(
  sector: PersonalSector,
  className: string,
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area"
): string {
  return `${sectorLegacyBase(area, sector)}/framework/${framework}/status/special-ed-class/class/${encodeURIComponent(className.trim())}`;
}

export function sectorSpecialEdModeTeacherHref(
  sector: PersonalSector,
  mode: "student" | "curriculum",
  teacherName: string,
  framework: EducationFramework = "special",
  area: SectorArea = "personal-area",
  className?: string | null
): string {
  const href = withSectorContextQuery(
    withTeacherNameQuery(
      `/personal-area/category/special-ed-class/mode/${mode}/teacher`,
      teacherName
    ),
    sector,
    framework,
    area
  );
  const key = (className ?? "").trim();
  if (!key) return href;
  const [path, existing] = href.split("?");
  const params = new URLSearchParams(existing);
  params.set("class", key);
  return `${path}?${params.toString()}`;
}

export function sectorSectorsListHref(area: SectorArea): string {
  return area === "dashboard" ? "/dashboard" : "/personal-area";
}

/** @deprecated use sectorHomeHref(sector, "dashboard") */
export function dashboardSectorHref(sector: PersonalSector): string {
  return sectorHomeHref(sector, "dashboard");
}

/** @deprecated use sectorFrameworkHref(sector, framework, "dashboard") */
export function dashboardFrameworkHref(
  sector: PersonalSector,
  framework: EducationFramework
): string {
  return sectorFrameworkHref(sector, framework, "dashboard");
}
