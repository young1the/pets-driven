"use client";

import {
  defaultLocale,
  isLocale,
  type Locale,
  localeLabels,
  locales,
  useTranslation,
} from "@pets-driven/i18n";
import { usePathname, useRouter } from "next/navigation";

const LOCALE_COOKIE = "pd-locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Pill that swaps the locale segment of the current URL. The choice is
 * persisted in a cookie so the proxy honors it on later bare-path visits.
 * Positioning belongs to the site nav cluster in the layout, not here.
 */
export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("common");

  const segments = pathname.split("/");
  const current: Locale = isLocale(segments[1]) ? segments[1] : defaultLocale;

  function switchTo(next: Locale) {
    if (next === current) return;
    segments[1] = next;
    const nextPath = segments.join("/") || `/${next}`;
    // biome-ignore lint/suspicious/noDocumentCookie: direct document.cookie keeps broad browser support for the locale preference cookie; CookieStore is not universally available.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    router.push(nextPath);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: role="group" labels a cluster of switch buttons; there is no fitting native grouping element (<fieldset> is for form controls).
    <div
      aria-label={t("language.switchLabel")}
      className="pd-pill"
      role="group"
      style={{ gap: 2, padding: 3 }}
    >
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            aria-current={active ? "true" : undefined}
            onClick={() => switchTo(locale)}
            type="button"
            style={{
              border: "none",
              cursor: active ? "default" : "pointer",
              borderRadius: 999,
              padding: "6px 13px",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 13,
              color: active ? "#fff" : "var(--ink-600)",
              background: active ? "var(--blossom-500)" : "transparent",
              transition: "background .15s ease, color .15s ease",
            }}
          >
            {localeLabels[locale]}
          </button>
        );
      })}
    </div>
  );
}
