/**
 * Pure logic for determining which external-document signature requests
 * are due for an automatic reminder. No I/O, no Supabase dependency.
 */

export const REMINDER_INTERVAL_DAYS = 3;
export const MAX_AUTO_REMINDERS = 3;
export const EXPIRY_DAYS = 14;

export interface SignatureRequestForReminder {
  id: string;
  student_id: string;
  document_id: string;
  document_name: string;
  recipient_email: string;
  signer_label: string;
  institution_id: string | null;
  created_at: string;
  auto_reminder_count: number;
  last_reminder_at: string | null;
  expires_at: string;
}

/**
 * Given a list of pending (not signed/cancelled/expired) requests that haven't
 * exhausted their reminder quota, return those that are due for a reminder now.
 *
 * A request is due if:
 * - It has no prior automatic reminder AND >= REMINDER_INTERVAL_DAYS since created_at
 * - OR it has prior reminders AND >= REMINDER_INTERVAL_DAYS since last_reminder_at
 *
 * This function is pure: it takes a list of candidates and a reference "now" timestamp.
 */
export function findRequestsDueForReminder(
  requests: SignatureRequestForReminder[],
  now: Date
): SignatureRequestForReminder[] {
  const intervalMs = REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  return requests.filter((req) => {
    if (req.auto_reminder_count >= MAX_AUTO_REMINDERS) {
      return false;
    }

    const referenceDate =
      req.last_reminder_at != null
        ? new Date(req.last_reminder_at)
        : new Date(req.created_at);

    const elapsed = nowMs - referenceDate.getTime();
    return elapsed >= intervalMs;
  });
}
