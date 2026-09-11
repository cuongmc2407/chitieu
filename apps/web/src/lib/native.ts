import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNative = Capacitor.isNativePlatform();

function applyStatusBarStyle(isDarkMode: boolean): void {
  // Capacitor's naming is theme-based, not literal-color-based:
  // Style.Dark = "light text for dark backgrounds", Style.Light = "dark text for light backgrounds".
  void StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light }).catch(() => undefined);
}

/**
 * Wires the bits that only make sense on the native iOS app: the status
 * bar follows the system light/dark theme (same as the CSS already does),
 * and the splash screen hides once React has actually mounted instead of
 * on a fixed timer.
 */
export function initNative(): void {
  if (!isNative) return;

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  applyStatusBarStyle(media.matches);
  media.addEventListener("change", (e) => applyStatusBarStyle(e.matches));

  void SplashScreen.hide();
}

/** A short success buzz after saving a transaction. No-op outside the native app. */
export async function successHaptic(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // haptics unavailable on this device — not worth surfacing to the user
  }
}
