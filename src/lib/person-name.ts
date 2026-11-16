/** שם פרטי + שם משפחה — תצוגה ואחסון כ־full_name */

export function splitPersonName(fullName: string): {
  first_name: string;
  last_name: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export function joinPersonName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/** שם לתצוגה בכל מקום בפרויקט (בחירה, רשימות, כרטיס) */
export function formatStudentDisplayName(
  fullName: string | null | undefined
): string {
  return (fullName ?? "").trim();
}

/** השוואת שמות — רווחים כפולים / רישיות לא משנים */
export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function personNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizePersonName(a ?? "");
  const right = normalizePersonName(b ?? "");
  return Boolean(left) && left === right;
}

export function hasLastName(fullName: string | null | undefined): boolean {
  return Boolean(splitPersonName(fullName ?? "").last_name);
}
