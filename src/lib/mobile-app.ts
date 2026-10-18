/**
 * This site inside LINARA_MOBILE's WebView (app/manager.tsx), which adds
 * "LinaraApp" to the user agent. There the app owns the session, its own
 * sign-in and its own "which one are you?" screen, so the page hands those
 * back to the app rather than showing its web copies (QA LMM-A6).
 */
export function inMobileApp(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("LinaraApp");
}

/** The app's own screens a page inside it can send the visitor to. */
export type AppScreen = "sign-in" | "create-account" | "kasambahay" | "forgot-password";

type NativeBridge = { postMessage: (message: string) => void };

/**
 * Asks the app to show one of its own screens. False outside the app, so
 * the caller does the web thing instead. `notice` is shown there, e.g. that
 * a confirmation email is on its way. Must match app/manager.tsx's
 * "open-screen" message.
 */
export function openAppScreen(screen: AppScreen, notice?: "confirm-email"): boolean {
  const bridge = (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView;
  if (!inMobileApp() || !bridge) return false;
  bridge.postMessage(JSON.stringify({ type: "open-screen", screen, notice }));
  return true;
}
