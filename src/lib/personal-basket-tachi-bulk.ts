/**
 * יצירת תח"י מרובים מכרטיס תלמיד סל אישי — שורה אחת לכל תחום.
 */
import { tableCellKey, resolveTableRowCount } from "@/lib/form-table-grids";

const TABLE_ID = "personal-basket-goals";

export interface PersonalBasketDomainRow {
  domain: string;
  mainGoal: string;
  partners: string;
}

/**
 * חילוץ שורות התחום מנתוני טופס כרטיס תלמיד סל אישי.
 * מחזיר רק שורות עם שם תחום לא ריק.
 */
export function extractDomainRows(
  formData: Record<string, string>
): PersonalBasketDomainRow[] {
  const rowCount = resolveTableRowCount(TABLE_ID, formData);
  const rows: PersonalBasketDomainRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const domain = (formData[tableCellKey(TABLE_ID, i, "domain")] ?? "").trim();
    const mainGoal = (formData[tableCellKey(TABLE_ID, i, "main_goal")] ?? "").trim();
    const partners = (formData[tableCellKey(TABLE_ID, i, "partners")] ?? "").trim();
    if (domain) {
      rows.push({ domain, mainGoal, partners });
    }
  }
  return rows;
}

export interface TachiBulkCreateResult {
  created: string[];
  skipped: string[];
  error?: string;
}

export interface TachiBulkCreateResponse extends TachiBulkCreateResult {
  ok: boolean;
  error?: string;
}

/**
 * קריאת API ליצירת תח"י מרובים מכרטיס סל אישי.
 * מחזיר תוצאה גם בהצלחה חלקית (כשחלק נוצרו לפני שגיאה).
 */
export async function createTachiBulk(
  studentId: string,
  domainRows: PersonalBasketDomainRow[]
): Promise<TachiBulkCreateResponse> {
  const response = await fetch("/api/personal-basket/create-tachi-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, domainRows }),
  });
  const json = await response.json();
  return {
    ok: json.ok ?? false,
    error: json.error,
    created: json.created ?? [],
    skipped: json.skipped ?? [],
  };
}
