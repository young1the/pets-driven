"use client";

// Client hooks, re-exported so app code has a single import surface.
export { Trans, useTranslation } from "react-i18next";
// Client entry point. This barrel pulls in react-i18next (which calls
// React.createContext at import), so it is marked "use client" to keep it out
// of server bundles. Server components import from "./config" and "./server".
export {
  defaultLocale,
  isLocale,
  type Locale,
  localeLabels,
  locales,
  type Namespace,
  namespaces,
} from "./config";
export { I18nProvider, type I18nProviderProps } from "./provider";
export { type DesktopResource, type LandingResource, resources } from "./resources";
