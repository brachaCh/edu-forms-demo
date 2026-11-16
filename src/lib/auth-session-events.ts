/** אירועי שינוי התחברות — לרענון מטמון נתונים לפי מוסד */

const AUTH_SESSION_EVENT = "matoah-auth-session-changed";

export function notifyAuthSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function subscribeAuthSessionChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(AUTH_SESSION_EVENT, listener);
  return () => window.removeEventListener(AUTH_SESSION_EVENT, listener);
}
