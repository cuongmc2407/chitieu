/**
 * Session storage abstraction. On the web (this stage) sessions are
 * cookie-based and this module mostly just remembers "am I logged in" for
 * instant UI state; the actual credential is an httpOnly cookie the browser
 * manages on its own. The pairing-code fallback stores a bearer token here
 * too — that's the SAME code path the iOS app (Capacitor) will use in a
 * later stage, just swapping localStorage for Capacitor Preferences behind
 * this same get/set/clear interface.
 */

const TOKEN_KEY = "chitieu:token";
const SERVER_URL_KEY = "chitieu:serverUrl";
const LOGGED_IN_KEY = "chitieu:loggedIn";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode, etc.) — auth still works via cookie for this session.
  }
}

/** A cheap local flag so the UI can skip straight to "logged in" on reload instead of flashing the login screen. */
export function getLoggedInFlag(): boolean {
  try {
    return localStorage.getItem(LOGGED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLoggedInFlag(loggedIn: boolean): void {
  try {
    if (loggedIn) localStorage.setItem(LOGGED_IN_KEY, "1");
    else localStorage.removeItem(LOGGED_IN_KEY);
  } catch {
    // ignore
  }
}

/** Server address — only ever shown/editable in the iOS app; the web build always talks to its own origin. */
export function getServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setServerUrl(url: string): void {
  try {
    localStorage.setItem(SERVER_URL_KEY, url.trim());
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  setToken(null);
  setLoggedInFlag(false);
}
