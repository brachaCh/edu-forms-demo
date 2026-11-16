export type ContactResult = {
  ok?: boolean;
  error?: string;
};

export type ContactRecipient =
  | "default"
  | "coming-soon"
  | "free-access-signup"
  | "bank-transfer";

export async function invokeContact(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot — must stay empty */
  website?: string;
  recipient?: ContactRecipient;
}): Promise<ContactResult> {
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      subject: payload.subject,
      message: payload.message,
      website: payload.website ?? "",
      recipient: payload.recipient ?? "default",
    }),
  });

  let data: ContactResult = {};
  try {
    data = (await response.json()) as ContactResult;
  } catch {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    return {
      ok: false,
      error: data.error || "שליחת ההודעה נכשלה. נסו שוב.",
    };
  }

  return { ok: true };
}
