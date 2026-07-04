"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  defaultLocale,
  isLocale,
  localeLabels,
  locales,
  useTranslation,
  type Locale,
} from "@pets-driven/i18n";

const LOCALE_COOKIE = "pd-locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Fixed pill that swaps the locale segment of the current URL. The choice is
 * persisted in a cookie so the middleware honors it on later bare-path visits.
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
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    router.push(nextPath);
  }

  return (
    <div
      aria-label={t("language.switchLabel")}
      role="group"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: "rgba(255,255,255,.72)",
        backdropFilter: "blur(10px)",
        border: "1px solid var(--border-soft)",
        boxShadow: "0 6px 18px rgba(34,31,46,.12)",
      }}
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
