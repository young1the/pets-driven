/**
 * Every localStorage key the desktop app keeps a *setting* under, in one place.
 *
 * The owning modules import their key from here instead of declaring their own
 * string literal, so "reset all settings" cannot silently miss one: adding a key
 * anywhere else than this file makes it unreachable from the reset, and a reset
 * that quietly leaves a setting behind is the classic bug in this feature.
 *
 * Only frontend-owned settings belong here. Anything persisted by the Rust state
 * store is reset by `reset_pets_driven_settings` (see state_store.rs), which is
 * the source of truth for the document on disk.
 */

/** Language override set by the settings switcher; unset follows the OS. */
export const LOCALE_STORAGE_KEY = "pd-locale";

/** Appearance: light / dark / system. */
export const THEME_MODE_STORAGE_KEY = "pd-theme-mode";

/** Appearance: which of the six brand accents recolors the app. */
export const THEME_ACCENT_STORAGE_KEY = "pd-theme-accent";

/** Whether the terminal tab's coach has already greeted this user. */
export const TERMINAL_ONBOARDING_DISMISSED_STORAGE_KEY =
  "pets-driven:terminal-onboarding-dismissed";

const SETTINGS_STORAGE_KEYS = [
  LOCALE_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  THEME_ACCENT_STORAGE_KEY,
  TERMINAL_ONBOARDING_DISMISSED_STORAGE_KEY,
] as const;

/**
 * Forget every frontend-owned setting. The providers that hold these values in
 * React state reset themselves separately (see `useDesktopTheme().reset` and
 * `useDesktopLocale().reset`) so the screen updates without a restart; this only
 * clears what is on disk.
 *
 * localStorage is left alone entirely outside a browser (SSR, node tests).
 */
export function clearStoredSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of SETTINGS_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

/** The keys `clearStoredSettings` removes. Exported for tests. */
export { SETTINGS_STORAGE_KEYS };
