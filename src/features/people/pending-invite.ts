// A manager code given at sign-up, kept until it's used: across waiting for
// the confirmation email (then "Finish setting up" joins with it), or across
// logging in to an account the email already had (then the dashboard's
// household switcher opens "Join a household" with it).
const PENDING_CODE_KEY = "linara_pending_manager_code";

export function readPendingCode(): string {
  try {
    return window.localStorage.getItem(PENDING_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePendingCode(code: string) {
  try {
    window.localStorage.setItem(PENDING_CODE_KEY, code);
  } catch {
    // Private mode: the code is typed again after logging in.
  }
}

export function clearPendingCode() {
  try {
    window.localStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
