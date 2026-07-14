"use client";

import { createInstance, type i18n } from "i18next";
import { type ReactNode, useMemo } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { Locale } from "./config";
import { baseInitOptions } from "./create-instance";

/** i18next instance wired to the react-i18next binding (client only). */
function createClientInstance(locale: Locale): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init(baseInitOptions(locale));
  return instance;
}

export interface I18nProviderProps {
  locale: Locale;
  children: ReactNode;
}

/**
 * Client boundary that supplies an i18next instance to the tree. The instance
 * is memoized on `locale`, so navigating between `/en` and `/ko` rebuilds it
 * while re-renders within a locale reuse it.
 */
export function I18nProvider({ locale, children }: I18nProviderProps) {
  const instance = useMemo(() => createClientInstance(locale), [locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
