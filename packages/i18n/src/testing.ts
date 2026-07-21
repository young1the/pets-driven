import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLocale, type Locale, namespaces } from "./config";
import { baseInitOptions } from "./create-instance";
import { resources } from "./resources";

/**
 * Initialize a global react-i18next instance for tests that render translated
 * components without mounting a provider. `useTranslation` falls back to this
 * default instance, so keys resolve to the given locale's source strings.
 * Reuses the app's `baseInitOptions` so test behavior matches production, with
 * the full catalog so `desktop`-namespace components resolve.
 */
export function initI18nForTesting(locale: Locale = defaultLocale): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init(baseInitOptions(locale, resources, namespaces));
  return instance;
}
