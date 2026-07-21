"use client";

import { createInstance, type i18n, type Resource } from "i18next";
import { type ReactNode, useMemo } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { Locale, Namespace } from "./config";
import { baseInitOptions } from "./create-instance";

/** i18next instance wired to the react-i18next binding (client only). */
function createClientInstance(
  locale: Locale,
  resources?: Resource,
  namespaces?: readonly Namespace[],
): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init(baseInitOptions(locale, resources, namespaces));
  return instance;
}

export interface I18nProviderProps {
  locale: Locale;
  children: ReactNode;
  /**
   * Translation catalog to load. Defaults to the lightweight landing catalog
   * (`common` + `landing`); the desktop app passes the full catalog so its
   * `desktop` namespace resolves.
   */
  resources?: Resource;
  /** Namespaces to register. Defaults to the landing namespaces. */
  namespaces?: readonly Namespace[];
}

/**
 * Client boundary that supplies an i18next instance to the tree. The instance
 * is memoized on its inputs, so navigating between `/en` and `/ko` rebuilds it
 * while re-renders within a locale reuse it.
 */
export function I18nProvider({ locale, children, resources, namespaces }: I18nProviderProps) {
  const instance = useMemo(
    () => createClientInstance(locale, resources, namespaces),
    [locale, resources, namespaces],
  );

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
