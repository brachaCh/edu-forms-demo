import {
  FORM_TABLE_DEFS,
  resolveTableRowCount,
  rowTableFlatKeys,
  tableCellKey,
  tableRowCountKey,
} from "@/lib/form-table-grids";
import { personNamesMatch } from "@/lib/person-name";

export const STUDENT_TEAM_TABLE_ID = "student-team";

export type StudentTeamStaffPick = {
  name: string;
  role?: string | null;
  phone?: string | null;
};

/** TZ-73: narrow staff-picker row — no notes / emails / ids / portfolio fields. */
export type InstitutionStaffPickerRow = {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
};

export function toInstitutionStaffPickerRow(row: {
  id: string;
  full_name?: string | null;
  role?: string | null;
  phone?: string | null;
}): InstitutionStaffPickerRow {
  return {
    id: row.id,
    full_name: String(row.full_name ?? ""),
    role: row.role ?? null,
    phone: row.phone ?? null,
  };
}

/** TZ-188: staff for fill request dropdown — includes email for sending. */
export type StaffFillRecipient = {
  name: string;
  email: string;
};

export function toStaffFillRecipient(row: {
  full_name?: string | null;
  email?: string | null;
}): StaffFillRecipient | null {
  const name = String(row.full_name ?? "").trim();
  const email = String(row.email ?? "").trim();
  if (!name || !email) return null;
  return { name, email };
}

function normalizeTeamLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isHomeroomTeamRole(role: string): boolean {
  const normalized = normalizeTeamLabel(role);
  return normalized === "מחנכת" || normalized === "מחנך";
}

export function findInstitutionStaffByName(
  staff: InstitutionStaffPickerRow[],
  name: string
): InstitutionStaffPickerRow | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const matches = staff.filter((row) => personNamesMatch(row.full_name, trimmed));
  if (matches.length !== 1) return undefined;
  return matches[0];
}

/**
 * ממלא טלפון (ושדות ריקים אחרים) לשורת מחנכת — כמו בחירה מצוות המוסד.
 * לא דורס ערכים שהמשתמש כבר שמר.
 */
export function enrichStudentTeamHomeroomFromInstitutionStaff(
  data: Record<string, string>,
  staff: InstitutionStaffPickerRow[],
  homeroomRows?: readonly number[]
): void {
  if (!staff.length || !homeroomRows?.length) return;
  for (const row of homeroomRows) {
    const role = String(
      data[tableCellKey(STUDENT_TEAM_TABLE_ID, row, "role")] ?? ""
    ).trim();
    if (!isHomeroomTeamRole(role)) continue;
    const name = String(
      data[tableCellKey(STUDENT_TEAM_TABLE_ID, row, "name")] ?? ""
    ).trim();
    if (!name) continue;

    const match = findInstitutionStaffByName(staff, name);
    if (!match) continue;

    const phoneKey = tableCellKey(STUDENT_TEAM_TABLE_ID, row, "phone");
    if (!(data[phoneKey] ?? "").trim()) {
      const phone = String(match.phone ?? "").trim();
      if (phone) data[phoneKey] = phone;
    }
  }
}

function ensureTableRows(
  data: Record<string, string>,
  tableId: string,
  minRows: number
): void {
  const current = resolveTableRowCount(tableId, data);
  const next = Math.min(30, Math.max(current, minRows));
  data[tableRowCountKey(tableId)] = String(next);
  for (const key of rowTableFlatKeys(tableId, next)) {
    if (!(key in data)) data[key] = "";
  }
}

/** שמות שכבר מופיעים בטבלת צוות התלמיד */
export function existingStudentTeamNames(
  data: Record<string, string>
): Set<string> {
  const names = new Set<string>();
  const rows = resolveTableRowCount(STUDENT_TEAM_TABLE_ID, data);
  for (let row = 0; row < rows; row += 1) {
    const name = String(
      data[tableCellKey(STUDENT_TEAM_TABLE_ID, row, "name")] ?? ""
    ).trim();
    if (name) names.add(normalizeTeamLabel(name));
  }
  return names;
}

/**
 * מוסיף אנשי צוות שנבחרו לשורות ריקות בטבלת «צוות התלמיד»
 * (מדלג על שמות שכבר קיימים).
 */
export function applyStaffPicksToStudentTeam(
  data: Record<string, string>,
  picks: StudentTeamStaffPick[]
): Record<string, string> {
  const def = FORM_TABLE_DEFS[STUDENT_TEAM_TABLE_ID];
  if (!def) return data;

  const next = { ...data };
  const usedNames = existingStudentTeamNames(next);

  for (const pick of picks) {
    const name = pick.name.trim();
    if (!name) continue;
    const normalized = normalizeTeamLabel(name);
    if (usedNames.has(normalized)) continue;

    let rows = resolveTableRowCount(STUDENT_TEAM_TABLE_ID, next);
    let target = -1;
    for (let row = 0; row < rows; row += 1) {
      const existingName = String(
        next[tableCellKey(STUDENT_TEAM_TABLE_ID, row, "name")] ?? ""
      ).trim();
      const existingRole = String(
        next[tableCellKey(STUDENT_TEAM_TABLE_ID, row, "role")] ?? ""
      ).trim();
      if (!existingName && !existingRole) {
        target = row;
        break;
      }
    }
    if (target < 0) {
      ensureTableRows(next, STUDENT_TEAM_TABLE_ID, rows + 1);
      target = rows;
    }

    next[tableCellKey(STUDENT_TEAM_TABLE_ID, target, "name")] = name;
    const role = String(pick.role ?? "").trim();
    if (role) {
      next[tableCellKey(STUDENT_TEAM_TABLE_ID, target, "role")] = role;
    }
    const phone = String(pick.phone ?? "").trim();
    if (phone) {
      next[tableCellKey(STUDENT_TEAM_TABLE_ID, target, "phone")] = phone;
    }
    usedNames.add(normalized);
  }

  return next;
}
