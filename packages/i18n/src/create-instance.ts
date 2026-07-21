import { createInstance, type InitOptions, type i18n, type Resource } from "i18next";
import { defaultLocale, type Locale, type Namespace } from "./config";
import { landingNamespaces, landingResources } from "./resources.landing";

/**
 * Shared init options for both the server (plain i18next) and client
 * (react-i18next) instances, so their behavior stays identical.
 *
 * `resources`/`ns` default to the lightweight landing catalog so consumers that
 * don't need the `desktop` namespace (the marketing site) never bundle it. The
 * desktop app passes the full catalog explicitly.
 */
export function baseInitOptions(
  locale: Locale,
  resources: Resource = landingResources,
  ns: readonly Namespace[] = landingNamespaces,
): InitOptions {
  return {
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...new Set([locale, defaultLocale])],
    resources,
    ns: [...ns],
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
