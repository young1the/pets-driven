import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSettings,
  LOCALE_STORAGE_KEY,
  SETTINGS_STORAGE_KEYS,
  TERMINAL_ONBOARDING_DISMISSED_STORAGE_KEY,
  THEME_ACCENT_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
} from "@/app/local-settings-storage";

describe("clearStoredSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("forgets every registered setting", () => {
    for (const key of SETTINGS_STORAGE_KEYS) {
      window.localStorage.setItem(key, "set");
    }

    clearStoredSettings();

    for (const key of SETTINGS_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });

  it("registers every setting the app persists on the frontend", () => {
    // The registry is the whole point of the module: a key that lives outside
    // it is invisible to the reset, which is how a "reset all settings" quietly
    // leaves a setting behind. Pin the four so a fifth cannot be added without
    // this list — and therefore the reset — seeing it.
    expect([...SETTINGS_STORAGE_KEYS]).toEqual([
      LOCALE_STORAGE_KEY,
      THEME_MODE_STORAGE_KEY,
      THEME_ACCENT_STORAGE_KEY,
      TERMINAL_ONBOARDING_DISMISSED_STORAGE_KEY,
    ]);
    expect(TERMINAL_ONBOARDING_DISMISSED_STORAGE_KEY).toBe(
      "pets-driven:terminal-onboarding-dismissed",
    );
  });

  it("leaves anything that is not a setting alone", () => {
    window.localStorage.setItem("some-other-app-key", "keep me");

    clearStoredSettings();

    expect(window.localStorage.getItem("some-other-app-key")).toBe("keep me");
  });
});
