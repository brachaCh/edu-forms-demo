/** תפקידים מוגדרים בטבלת צוות תלמיד / כרטיס איש צוות */

export const TEAM_ROLE_OTHER_VALUE = "אחר";

/** רשימת תפקידים בבחירה — הערך האחרון הוא «אחר» (טקסט חופשי). */
export const TEAM_ROLE_PRESET_LABELS = [
  "מחנכת",
  "מומחית תחום",
  "מורה מלווה",
  "סייעת",
  "מנהל/ת",
  "קלינאית תקשורת",
  "מטפל/ת רגשית",
  "מנתח/ת התנהגות",
  TEAM_ROLE_OTHER_VALUE,
] as const;

export function normalizeTeamRoleLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isTeamRolePreset(value: string): boolean {
  const norm = normalizeTeamRoleLabel(value);
  return TEAM_ROLE_PRESET_LABELS.some(
    (label) => normalizeTeamRoleLabel(label) === norm
  );
}

/** ערך לתצוגה בהדפסה / רשימות — לא מציג «אחר» כשיש טקסט מותאם */
export function formatTeamRoleDisplay(stored: string | null | undefined): string {
  const trimmed = String(stored ?? "").trim();
  if (!trimmed) return "";
  return trimmed;
}

/**
 * ערך שנבחר ב־select: פריסט ידוע, אחרת «אחר» לעריכת טקסט חופשי.
 */
export function teamRoleSelectValue(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (isTeamRolePreset(trimmed)) return trimmed;
  if (normalizeTeamRoleLabel(trimmed) === normalizeTeamRoleLabel(TEAM_ROLE_OTHER_VALUE)) {
    return TEAM_ROLE_OTHER_VALUE;
  }
  return TEAM_ROLE_OTHER_VALUE;
}

/** טקסט חופשי כשהבחירה היא «אחר» */
export function teamRoleOtherText(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (isTeamRolePreset(trimmed)) return "";
  if (normalizeTeamRoleLabel(trimmed) === normalizeTeamRoleLabel(TEAM_ROLE_OTHER_VALUE)) {
    return "";
  }
  return trimmed;
}

/** שמירה: פריסט או טקסט מותאם (לא «אחר» ריק אם יש טקסט) */
export function composeTeamRoleStored(
  selectValue: string,
  otherText: string
): string {
  const select = selectValue.trim();
  if (!select) return otherText.trim();
  if (select !== TEAM_ROLE_OTHER_VALUE) return select;
  const custom = otherText.trim();
  if (custom) return custom;
  return TEAM_ROLE_OTHER_VALUE;
}

/** טיוטת טקסט חופשי תוך הקלדה — בלי trim (שומר רווחים באמצע) */
export function composeTeamRoleOtherDraft(otherText: string): string {
  if (!otherText) return TEAM_ROLE_OTHER_VALUE;
  return otherText;
}

/** סיום עריכה (blur / שמירה) — trim בלבד בסוף */
export function finalizeTeamRoleOther(otherText: string): string {
  const custom = otherText.trim();
  if (!custom) return "";
  return custom;
}

/** האם להציג מצב «אחר» עם שדה טקסט (טעינה / ערך מותאם שאינו פריסט טהור) */
export function shouldUseTeamRoleOtherUi(stored: string): boolean {
  const trimmed = stored.trim();
  if (!trimmed) return false;
  if (normalizeTeamRoleLabel(trimmed) === normalizeTeamRoleLabel(TEAM_ROLE_OTHER_VALUE)) {
    return true;
  }
  return !isTeamRolePreset(trimmed);
}

export const TEAM_ROLE_SELECT_OPTIONS = TEAM_ROLE_PRESET_LABELS.map((label) => ({
  value: label,
  label,
}));