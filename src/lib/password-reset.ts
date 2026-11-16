/** Hash opaque reset tokens with SHA-256 (store hash only). */

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufferToHex(bytes);
}

export async function hashResetToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(new Uint8Array(digest));
}

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
