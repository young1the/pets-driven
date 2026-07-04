import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { I18nProvider } from "@pets-driven/i18n";
import { getServerTranslation } from "@pets-driven/i18n/server";
import { isLocale, locales, type Locale } from "@pets-driven/i18n/config";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "../globals.css";

type LocaleParams = { params: { locale: string } };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: LocaleParams): Metadata {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const { t } = getServerTranslation(locale, "landing");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    icons: { icon: "/petsdriven-mark.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  return (
    <html lang={params.locale}>
      <body>
        <I18nProvider locale={params.locale}>
          <LanguageSwitcher />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
