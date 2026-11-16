import {
  DEFAULT_EDUCATION_FRAMEWORK,
  isEducationFramework,
  isPersonalSector,
  sectorFrameworkHref,
  type EducationFramework,
  type PersonalSector,
} from "@/lib/personal-sector";
import type { Category } from "@/lib/supabase/types";

/**
 * TZ-27: Institution settings for building the redirect href.
 * When a teacher is invited, use the institution's own framework/type
 * instead of a global default.
 */
export interface InstitutionSettings {
  institution_type?: PersonalSector | string | null;
  education_framework?: EducationFramework | string | null;
}

/**
 * אחרי הזמנת מורה — כניסה למרחב המוסד המלא.
 * כל מורה באותו מוסד רואה ומעדכנת את אותם נתונים (לא רק תלמידים שסומנו כ«מורה אחראית»).
 *
 * TZ-27: Now uses institution's own education_framework and institution_type
 * when available, falling back to staff card category and global default.
 */
export function teacherInviteStudentsHref(
  _teacherName: string,
  category?: Category | null,
  institutionSettings?: InstitutionSettings | null
): string {
  // TZ-27: Prefer institution's own settings over staff card category/defaults
  const instType = institutionSettings?.institution_type;
  const instFramework = institutionSettings?.education_framework;

  // Determine sector: institution_type > staff card category > fallback to personal-area
  const sector: PersonalSector | null =
    (instType && isPersonalSector(instType) ? instType : null) ??
    (category && isPersonalSector(category) ? category : null);

  if (!sector) {
    return "/personal-area";
  }

  // Determine framework: institution's education_framework > global default
  const framework: EducationFramework =
    instFramework && isEducationFramework(instFramework)
      ? instFramework
      : DEFAULT_EDUCATION_FRAMEWORK;

  return sectorFrameworkHref(sector, framework);
}
