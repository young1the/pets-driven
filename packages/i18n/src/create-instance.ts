import { createInstance, type InitOptions, type i18n } from "i18next";
import { defaultLocale, type Locale, namespaces } from "./config";
import { resources } from "./resources";

/**
 * Shared init options for both the server (plain i18next) and client
 * (react-i18next) instances, so their behavior stays identical.
 */
export function baseInitOptions(locale: Locale): InitOptions {
  return {
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...new Set([locale, defaultLocale])],
    resources,
    ns: [...namespaces],
    defaultNS: "landing",
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    initImmediate: false,
  };
}

/**
 * A plain i18next instance with no React binding. `react-i18next` calls
 * `React.createContext` at import time, which throws inside React Server
 * Components — so server-side translation (metadata, server components) must
 * go through this core instance instead.
 */
export function createServerInstance(locale: Locale): i18n {
  const instance = createInstance();
  void instance.init(baseInitOptions(locale));
  return instance;
}
