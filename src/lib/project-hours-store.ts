"use client";

import { getDataCache, setProjectHoursInCache } from "./data-cache";

export type HoursPool = "management" | "programming" | "extra";

export type ProjectHours = {
  id: string;
  management_total: number;
  management_used: number;
  programming_total: number;
  programming_used: number;
  extra_total: number;
  extra_used: number;
};

const ENDPOINT = "/api/project-hours";

/** תצוגת שעות — עד שני מקומות עשרוניים, בלי אפסים מיותרים */
export function formatHours(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const ERROR_MESSAGES: Record<string, string> = {
  WRONG_PASSWORD: "סיסמה שגויה",
  RATE_LIMITED: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.",
  HOURS_PASSWORD_NOT_CONFIGURED:
    "סיסמת ניהול השעות לא הוגדרה בשרת (HOURS_WIDGET_PASSWORD)",
  SERVER_UNAVAILABLE: "אין חיבור לשרת השעות",
  HOURS_ROW_MISSING: "מאגר השעות לא הוגדר — יש להריץ את המיגרציה",
  VALIDATION_ERROR: "הערכים שהוזנו אינם תקינים",
  HOURS_OP_FAILED: "הפעולה נכשלה",
};

function toMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

async function readError(response: Response): Promise<never> {
  let code = "HOURS_OP_FAILED";
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) code = body.error;
  } catch {
    // תשובה ללא JSON — נשארים עם קוד ברירת המחדל
  }
  throw new Error(toMessage(code));
}

async function request(
  body: Record<string, unknown>
): Promise<ProjectHours> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return readError(response);
  const payload = (await response.json()) as { data: ProjectHours };
  setProjectHoursInCache(payload.data);
  return payload.data;
}

/** מה שנטען כבר למטמון — בלי קריאת רשת נוספת */
export function getProjectHours(): ProjectHours | null {
  return getDataCache().projectHours;
}

export async function loadProjectHours(): Promise<ProjectHours> {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  if (!response.ok) return readError(response);
  const payload = (await response.json()) as { data: ProjectHours };
  setProjectHoursInCache(payload.data);
  return payload.data;
}

/** אימות הסיסמה מול השרת. מחזיר את המצב המעודכן כדי לפתוח את הדיאלוג עם נתונים טריים. */
export function verifyHoursPassword(password: string): Promise<ProjectHours> {
  return request({ op: "verify", password });
}

export function deductHours(data: {
  password: string;
  pool: HoursPool;
  amount: number;
}): Promise<ProjectHours> {
  return request({
    op: "deduct",
    password: data.password,
    pool: data.pool,
    amount: data.amount,
  });
}

export function addHours(data: {
  password: string;
  pool: HoursPool;
  amount: number;
}): Promise<ProjectHours> {
  return request({
    op: "add",
    password: data.password,
    pool: data.pool,
    amount: data.amount,
  });
}

export function updateHoursTotals(data: {
  password: string;
  management_total: number;
  programming_total: number;
  extra_total: number;
}): Promise<ProjectHours> {
  return request({ op: "updateTotals", ...data });
}

export function resetHours(data: { password: string }): Promise<ProjectHours> {
  return request({ op: "reset", password: data.password });
}
