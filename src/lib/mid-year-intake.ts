/** קליטת תלמידים חדשים במהלך השנה — רשימת המתנה עד העברה לשילוב / סל אישי */

import {
  currentCalendarYear,
  formatHebrewYear,
} from "@/lib/calendar-year";
import type { IntegrationFrequency } from "@/lib/supabase/types";
import type {
  EducationFramework,
  PersonalSector,
  SectorArea,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";

const STORAGE_KEY = "matoah.mid-year-intake";

export type MidYearIntakeTarget = "integration" | "personal-basket";

export interface MidYearIntakeRecord {
  targetStatus: MidYearIntakeTarget;
  year: number;
  sector: PersonalSector;
  frequency?: IntegrationFrequency | null;
}

type IntakeMap = Record<string, MidYearIntakeRecord>;

export function isMidYearIntakeTarget(
  status: string | null | undefined
): status is MidYearIntakeTarget {
  return status === "integration" || status === "personal-basket";
}

function getStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function readMap(): IntakeMap {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IntakeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: IntakeMap): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export function isMidYearIntakePending(studentId: string): boolean {
  if (!studentId) return false;
  return Boolean(readMap()[studentId]);
}

export function getMidYearIntakeRecord(
  studentId: string
): MidYearIntakeRecord | null {
  return readMap()[studentId] ?? null;
}

export function markMidYearIntake(
  studentId: string,
  record: MidYearIntakeRecord
): void {
  if (!studentId) return;
  const map = readMap();
  map[studentId] = {
    targetStatus: record.targetStatus,
    year: record.year,
    sector: record.sector,
    frequency: record.frequency ?? null,
  };
  writeMap(map);
}

export function clearMidYearIntake(studentId: string): void {
  if (!studentId) return;
  const map = readMap();
  if (!(studentId in map)) return;
  delete map[studentId];
  writeMap(map);
}

export function clearMidYearIntakeMany(studentIds: string[]): void {
  if (studentIds.length === 0) return;
  const map = readMap();
  let changed = false;
  for (const id of studentIds) {
    if (id in map) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeMap(map);
}

export function listMidYearIntakeEntries(
  filter?: Partial<MidYearIntakeRecord>
): Array<{ studentId: string; record: MidYearIntakeRecord }> {
  const map = readMap();
  return Object.entries(map)
    .filter(([, record]) => {
      if (filter?.targetStatus && record.targetStatus !== filter.targetStatus) {
        return false;
      }
      if (filter?.sector && record.sector !== filter.sector) return false;
      if (filter?.year != null && record.year !== filter.year) return false;
      if (filter?.frequency) {
        const want = filter.frequency;
        const got = record.frequency ?? "high";
        if (got !== want) return false;
      }
      return true;
    })
    .map(([studentId, record]) => ({ studentId, record }));
}

/** שנת קליטת תלמידים חדשים — שנה אחת אחרי שנת הלימודים הנוכחית */
export function midYearIntakeYear(date: Date = new Date()): number {
  return currentCalendarYear(date) + 1;
}

export function midYearIntakeButtonLabel(year = midYearIntakeYear()): string {
  return `העלאת תלמידים חדשים לשנה ${formatHebrewYear(year)}`;
}

export function midYearIntakeListTitle(
  target: MidYearIntakeTarget,
  year = midYearIntakeYear()
): string {
  const category =
    target === "integration" ? "תלמידי שילוב" : "תלמידי סל אישי";
  return `תלמידים חדשים לשנה ${formatHebrewYear(year)} — ${category}`;
}

export function midYearIntakeTransferLabel(target: MidYearIntakeTarget): string {
  return target === "integration"
    ? "העברה לתלמידי שילוב"
    : "העברה לתלמידי סל אישי";
}

export function midYearIntakeHref(options: {
  sector: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  target: MidYearIntakeTarget;
  frequency?: IntegrationFrequency | null;
  year?: number;
}): string {
  const params = new URLSearchParams();
  params.set("sector", options.sector);
  params.set("framework", options.framework ?? "regular");
  params.set("area", options.area ?? "personal-area");
  params.set("target", options.target);
  params.set("year", String(options.year ?? midYearIntakeYear()));
  if (options.target === "personal-basket" && options.frequency) {
    params.set("frequency", options.frequency);
  }
  return `/personal-area/mid-year-intake?${params.toString()}`;
}

export function intakeTargetAsStatus(
  target: MidYearIntakeTarget
): StudentStatus {
  return target;
}
