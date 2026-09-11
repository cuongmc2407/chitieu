import { Preferences } from "@capacitor/preferences";
import { isNative } from "./native";

/**
 * Session storage abstraction. On the web (cookie-based sessions) this is
 * mostly just a local "am I logged in" flag; the actual credential is an
 * httpOnly cookie the browser manages on its own. In the iOS app there is
 * no cookie jar shared with a browser, so the pairing-code login stores a
 * real bearer token here — using Capacitor Preferences (durable native
 * storage) instead of localStorage. Every read/write goes through this one
 * module so callers never need to know which backend is in play.
 */

const TOKEN_KEY = "chitieu:token";
const SERVER_URL_KEY = "chitieu:serverUrl";
const LOGGED_IN_KEY = "chitieu:loggedIn";

async function storageGet(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode, etc.) — auth still works via cookie for this session.
  }
}

async function storageRemove(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function getToken(): Promise<string | null> {
  return storageGet(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await storageSet(TOKEN_KEY, token);
  else await storageRemove(TOKEN_KEY);
}

/** A cheap local flag so the UI can skip straight to "logged in" on reload instead of flashing the login screen. */
export async function getLoggedInFlag(): Promise<boolean> {
  return (await storageGet(LOGGED_IN_KEY)) === "1";
}

export async function setLoggedInFlag(loggedIn: boolean): Promise<void> {
  if (loggedIn) await storageSet(LOGGED_IN_KEY, "1");
  else await storageRemove(LOGGED_IN_KEY);
}

/** Server address — only ever shown/editable in the iOS app; the web build always talks to its own origin. */
export async function getServerUrl(): Promise<string> {
  return (await storageGet(SERVER_URL_KEY)) ?? "";
}

export async function setServerUrl(url: string): Promise<void> {
  await storageSet(SERVER_URL_KEY, url.trim());
}

export async function clearSession(): Promise<void> {
  await setToken(null);
  await setLoggedInFlag(false);
}
