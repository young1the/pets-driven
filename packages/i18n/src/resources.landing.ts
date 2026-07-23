import enCommon from "./locales/en/common.json";
import enLanding from "./locales/en/landing.json";
import jaCommon from "./locales/ja/common.json";
import jaLanding from "./locales/ja/landing.json";
import koCommon from "./locales/ko/common.json";
import koLanding from "./locales/ko/landing.json";

/**
 * The web/landing catalog — `common` + `landing` only, in its own module that
 * never imports `desktop.json`. This is the default for the shared client
 * provider, so client bundles that don't opt into the full catalog (e.g. the
 * marketing site) never pull in the large `desktop` translations.
 */
export const landingResources = {
  en: { common: enCommon, landing: enLanding },
  ko: { common: koCommon, landing: koLanding },
  ja: { common: jaCommon, landing: jaLanding },
} as const;

/** Namespaces present in {@link landingResources}. */
export const landingNamespaces = ["common", "landing"] as const;
