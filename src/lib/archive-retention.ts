/** מדיניות ארכיון: מסמכים בארכיון נשמרים 8 שנים ואז נמחקים לצמיתות. */

export const ARCHIVE_RETENTION_YEARS = 8;

/** תאריך חיתוך — מסמכים עם archived_at לפני תאריך זה מיועדים למחיקה */
export function archiveRetentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ARCHIVE_RETENTION_YEARS);
  return cutoff;
}

export function isArchivePastRetention(
  archivedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!archivedAt) return false;
  const at = new Date(archivedAt).getTime();
  if (Number.isNaN(at)) return false;
  return at < archiveRetentionCutoff(now).getTime();
}
