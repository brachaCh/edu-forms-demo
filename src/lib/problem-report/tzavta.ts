import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TZAVTA_CREATE_RPC, TZAVTA_GET_REPORTER_RPC } from "./constants";
import { bugIdFromUnknown, ticketIdFromBugId, ticketIdFromUnknown } from "./ticket-id";

export type TzavtaBugInput = {
  /** Truncated text for `p_description` RPC (bugs.description). */
  description: string;
  /** Full text for `bug_reporter_contacts.description` (overwrites RPC insert). */
  contactsDescription?: string;
  reporterEmail: string;
  pagePath: string | null;
  browser: string | null;
};

export type CreateTzavtaBugResult =
  | { ok: true; ticketId: string; bugId: string | null }
  | { ok: false; reason: "not_configured" | "insert_failed" };

export type FetchReporterResult =
  | { ok: true; reporterEmail: string }
  | { ok: false; reason: "not_configured" | "not_found" | "read_failed" };

export function isTzavtaConfigured(): boolean {
  return Boolean(
    process.env.TZAVTA_SUPABASE_URL?.trim() &&
      process.env.TZAVTA_SERVICE_KEY?.trim()
  );
}

export function createTzavtaClient(): SupabaseClient | null {
  const url = process.env.TZAVTA_SUPABASE_URL?.trim();
  const key = process.env.TZAVTA_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createRpcName(): string {
  return process.env.TZAVTA_CREATE_RPC?.trim() || TZAVTA_CREATE_RPC;
}

function getReporterRpcName(): string {
  return process.env.TZAVTA_GET_REPORTER_RPC?.trim() || TZAVTA_GET_REPORTER_RPC;
}

async function syncBugReporterContacts(
  client: SupabaseClient,
  bugId: string,
  input: TzavtaBugInput
): Promise<void> {
  const email = input.reporterEmail.trim().toLowerCase();
  if (!email.includes("@")) return;

  const row = {
    bug_id: bugId,
    email,
    description: input.contactsDescription ?? input.description,
    page_path: input.pagePath,
    browser: input.browser,
  };

  const { error } = await client
    .from("bug_reporter_contacts")
    .upsert(row, { onConflict: "bug_id" });
  if (error) {
    console.error("[problem-report] bug_reporter_contacts sync failed");
  }
}

/**
 * Opens a Tzavta ticket via SECURITY DEFINER RPC only.
 * The app never inserts into or selects from `bugs`.
 * Report text is never sent to AI.
 *
 * Returns the ticketId ("TZ-n") and bug_id (e.g. "bug-2610211250-116").
 * Supports both new jsonb {ticket_id, bug_id, bug_number} format and legacy 'TZ-n' string.
 * With legacy 'TZ-n', bugId is null and attachments will be skipped.
 */
export async function createTzavtaBug(
  input: TzavtaBugInput,
  client: SupabaseClient | null = createTzavtaClient()
): Promise<CreateTzavtaBugResult> {
  if (!client) return { ok: false, reason: "not_configured" };
  try {
    const { data, error } = await client.rpc(createRpcName(), {
      p_description: input.description,
      p_reporter_email: input.reporterEmail,
      p_page_path: input.pagePath,
      p_browser: input.browser,
    });
    if (error) {
      console.error("[problem-report] tzavta rpc failed");
      return { ok: false, reason: "insert_failed" };
    }

    const bugId = bugIdFromUnknown(data);
    const ticketId = ticketIdFromUnknown(data);

    if (bugId) {
      await syncBugReporterContacts(client, bugId, input);
    }

    if (ticketId) {
      return { ok: true, ticketId, bugId };
    }

    if (bugId) {
      const derivedTicketId = ticketIdFromBugId(bugId);
      if (derivedTicketId) {
        return { ok: true, ticketId: derivedTicketId, bugId };
      }
    }

    return { ok: false, reason: "insert_failed" };
  } catch {
    console.error("[problem-report] tzavta unavailable");
    return { ok: false, reason: "insert_failed" };
  }
}

/** Looks up the stored reporter email by TZ-n / bug_number. Never reads `bugs`. */
export async function fetchGitiBugReporter(
  bugNumber: number,
  client: SupabaseClient | null = createTzavtaClient()
): Promise<FetchReporterResult> {
  if (!client) return { ok: false, reason: "not_configured" };
  try {
    const { data, error } = await client.rpc(getReporterRpcName(), {
      p_bug_number: bugNumber,
    });
    if (error) {
      console.error("[problem-report] tzavta reporter rpc failed");
      return { ok: false, reason: "read_failed" };
    }
    const email =
      typeof data === "string" ? data.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, reporterEmail: email };
  } catch {
    console.error("[problem-report] tzavta reporter rpc unavailable");
    return { ok: false, reason: "read_failed" };
  }
}
