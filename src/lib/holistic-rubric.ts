/** מחוון עזר לדף הכנה לתח"י / תל"א — קובץ סטטי ב-public, שם ASCII ב-URL */

export const HOLISTIC_STUDENT_CENTER_KEY = "student_profile";

export const HOLISTIC_RUBRIC_HREF = "/portfolio-templates/machon-talmid.docx";

export const HOLISTIC_RUBRIC_DOWNLOAD_NAME = "מחוון תלמיד.docx";

export const HOLISTIC_RUBRIC_PUBLIC_FILE =
  "public/portfolio-templates/machon-talmid.docx";

/** טקסט ישן שנשמר בקוביית «התלמיד» בטיוטות — לא שדה למילוי */
export function leftoverHolisticStudentProfile(
  data: Record<string, string> | null | undefined
): string {
  return (data?.[HOLISTIC_STUDENT_CENTER_KEY] ?? "").trim();
}
