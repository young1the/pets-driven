import { defaultLocale, locales } from "@pets-driven/i18n/config";
import type { MetadataRoute } from "next";
import { absoluteHreflangAlternates, localeUrl } from "@/lib/site";

/**
 * Served at /sitemap.xml. There is no non-localized route, so the bare "/" is
 * deliberately absent: it only ever redirects, and listing a redirect would
 * point crawlers at a URL that is never the canonical one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return locales.map((locale) => ({
    url: localeUrl(locale),
    lastModified,
    changeFrequency: "monthly" as const,
    priority: locale === defaultLocale ? 1 : 0.8,
    alternates: { languages: absoluteHreflangAlternates },
  }));
}
