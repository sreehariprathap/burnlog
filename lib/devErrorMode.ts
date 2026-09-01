// lib/devErrorMode.ts
// Per-device admin preference: show a dismissable modal with full error
// details (message/source/stack) whenever one occurs, instead of only
// logging to the console. Same localStorage idiom as the theme toggle —
// this is a personal debugging preference, not an account-wide setting.

const STORAGE_KEY = 'dev-error-modal-enabled';

export function isDevErrorModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDevErrorModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage unavailable (private mode, etc.) — no-op.
  }
}
