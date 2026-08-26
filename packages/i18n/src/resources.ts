import enCommon from "./locales/en/common.json";
import enDesktop from "./locales/en/desktop.json";
import enLanding from "./locales/en/landing.json";
import jaCommon from "./locales/ja/common.json";
import jaDesktop from "./locales/ja/desktop.json";
import jaLanding from "./locales/ja/landing.json";
import koCommon from "./locales/ko/common.json";
import koDesktop from "./locales/ko/desktop.json";
import koLanding from "./locales/ko/landing.json";
import zhCommon from "./locales/zh/common.json";
import zhDesktop from "./locales/zh/desktop.json";
import zhLanding from "./locales/zh/landing.json";

/**
 * All translation bundles, imported statically. The catalog is small (a handful
 * of locales) so eager bundling keeps setup synchronous and avoids async
 * loading flashes during SSR/hydration.
 */
export const resources = {
  en: { common: enCommon, landing: enLanding, desktop: enDesktop },
  ko: { common: koCommon, landing: koLanding, desktop: koDesktop },
  ja: { common: jaCommon, landing: jaLanding, desktop: jaDesktop },
  zh: { common: zhCommon, landing: zhLanding, desktop: zhDesktop },
} as const;

/** The English `landing` bundle is the source of truth for key typing. */
export type LandingResource = typeof enLanding;

/** The English `desktop` bundle is the source of truth for key typing. */
export type DesktopResource = typeof enDesktop;
