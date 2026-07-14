import type { Locale, Namespace } from "./config";
import { createServerInstance } from "./create-instance";

/**
 * Translation helper for server components and metadata generation, where the
 * `useTranslation` hook is unavailable. Uses the core (non-React) instance so
 * it is safe to call inside React Server Components.
 */
export function getServerTranslation(locale: Locale, ns: Namespace = "landing") {
  const instance = createServerInstance(locale);
  return {
    t: instance.getFixedT(locale, ns),
    i18n: instance,
  };
}
