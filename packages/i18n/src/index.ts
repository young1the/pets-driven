"use client";

// Client entry point. This barrel pulls in react-i18next (which calls
// React.createContext at import), so it is marked "use client" to keep it out
// of server bundles. Server components import from "./config" and "./server".
export {
  locales,
  defaultLocale,
  namespaces,
  localeLabels,
  isLocale,
  type Locale,
  type Namespace,
} from "./config";
export { I18nProvider, type I18nProviderProps } from "./provider";
export { resources, type LandingResource, type DesktopResource } from "./resources";

// Client hooks, re-exported so app code has a single import surface.
export { useTranslation, Trans } from "react-i18next";
