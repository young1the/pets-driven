/**
 * Locale configuration shared across every surface (web + desktop).
 *
 * The source locale is English to match the repo's English-only code/docs
 * convention; Korean and Japanese are target translations.
 */
export const locales = ["en", "ko", "ja"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** i18next namespaces. Split so each surface can load only what it needs. */
export const namespaces = ["common", "landing", "desktop"] as const;

export type Namespace = (typeof namespaces)[number];

/** Human-readable labels for the language switcher. */
export const localeLabels: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
};

/** Narrowing guard for untrusted route params. */
export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}
