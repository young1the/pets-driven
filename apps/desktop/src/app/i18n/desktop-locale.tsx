import {
  defaultLocale,
  I18nProvider,
  isLocale,
  type Locale,
  locales,
  namespaces,
  resources,
} from "@pets-driven/i18n";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

const LOCALE_STORAGE_KEY = "pd-locale";

/**
 * Resolve the desktop locale. A user override (persisted in localStorage by the
 * language switcher) wins; otherwise we fall back to the WebView's UI language,
 * which mirrors the OS display language on Windows. Everything else lands on the
 * source locale (English).
 */
function detectDesktopLocale(): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored ?? undefined)) {
    return stored as Locale;
  }

  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of candidates) {
    const base = tag.split("-")[0]?.toLowerCase();
    if (isLocale(base)) {
      return base as Locale;
    }
  }

  return defaultLocale;
}

type DesktopLocaleControl = {
  locale: Locale;
  setLocale: (next: Locale) => void;
};

const DesktopLocaleContext = createContext<DesktopLocaleControl | null>(null);

/**
 * Wraps the shared `I18nProvider` with desktop-side locale detection and a
 * persisted user override. Every desktop React root mounts inside this so
 * `useTranslation` works and the language switcher can flip locales live.
 */
export function DesktopLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectDesktopLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
  }, []);

  const control = useMemo<DesktopLocaleControl>(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <DesktopLocaleContext.Provider value={control}>
      {/* Desktop needs the full catalog (incl. the `desktop` namespace). */}
      <I18nProvider locale={locale} resources={resources} namespaces={namespaces}>
        {children}
      </I18nProvider>
    </DesktopLocaleContext.Provider>
  );
}

/**
 * Read/flip the active desktop locale (used by the settings switcher). Outside
 * a provider (e.g. components rendered in isolation by tests) this degrades to
 * a read-only default rather than throwing, since the real app always mounts
 * the provider at the root.
 */
export function useDesktopLocale(): DesktopLocaleControl {
  const control = useContext(DesktopLocaleContext);
  if (!control) {
    return { locale: defaultLocale, setLocale: () => {} };
  }
  return control;
}

export { LOCALE_STORAGE_KEY, locales };
