import { I18nProvider } from "@pets-driven/i18n";
import { defaultLocale, isLocale, type Locale, locales } from "@pets-driven/i18n/config";
import { getServerTranslation } from "@pets-driven/i18n/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { GithubLink } from "@/components/GithubLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  DOWNLOAD_URL,
  GITHUB_URL,
  hreflangAlternates,
  localePath,
  localeUrl,
  OG_IMAGE,
  OG_LOCALES,
  SITE_URL,
} from "@/lib/site";
import "../globals.css";

type LocaleParams = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;
  const { t } = getServerTranslation(locale, "landing");
  const title = t("metadata.title");
  const description = t("metadata.description");

  return {
    // Lets every relative URL below resolve against the real origin, which is
    // what Open Graph and canonical links require — a relative og:image is
    // ignored by every crawler that reads it.
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: "Pets-Driven",
    icons: { icon: "/petsdriven-mark.svg" },
    alternates: {
      canonical: localePath(locale),
      languages: hreflangAlternates,
    },
    openGraph: {
      type: "website",
      siteName: "Pets-Driven",
      url: localePath(locale),
      title,
      description,
      locale: OG_LOCALES[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
      images: [{ ...OG_IMAGE, alt: t("metadata.ogImageAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: OG_IMAGE.url, alt: t("metadata.ogImageAlt") }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Structured data for the download. `SoftwareApplication` is what earns the
 * app-style result — price, platform, and category — so it is emitted per
 * locale with that locale's description.
 */
function softwareApplicationJsonLd(locale: Locale, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Pets-Driven",
    description,
    url: localeUrl(locale),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows 10, Windows 11",
    downloadUrl: DOWNLOAD_URL,
    softwareHelp: GITHUB_URL,
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    inLanguage: locale,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    screenshot: `${SITE_URL}${OG_IMAGE.url}`,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const { t } = getServerTranslation(locale, "landing");
  const jsonLd = softwareApplicationJsonLd(locale, t("metadata.description"));

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>
          {/* Fixed site nav: owns the corner placement so each pill inside it
              stays a plain, independently reusable component. */}
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <GithubLink label={t("nav.github")} />
            <LanguageSwitcher />
          </div>
          {children}
        </I18nProvider>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has to be inlined as a raw script body; the payload is our own strings with "<" escaped.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
