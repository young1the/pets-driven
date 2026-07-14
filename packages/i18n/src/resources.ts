import enCommon from "./locales/en/common.json";
import enDesktop from "./locales/en/desktop.json";
import enLanding from "./locales/en/landing.json";
import koCommon from "./locales/ko/common.json";
import koDesktop from "./locales/ko/desktop.json";
import koLanding from "./locales/ko/landing.json";

/**
 * All translation bundles, imported statically. The catalog is small (two
 * locales) so eager bundling keeps setup synchronous and avoids async
 * loading flashes during SSR/hydration.
 */
export const resources = {
  en: { common: enCommon, landing: enLanding, desktop: enDesktop },
  ko: { common: koCommon, landing: koLanding, desktop: koDesktop },
} as const;

/** The English `landing` bundle is the source of truth for key typing. */
export type LandingResource = typeof enLanding;

/** The English `desktop` bundle is the source of truth for key typing. */
export type DesktopResource = typeof enDesktop;
