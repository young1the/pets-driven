import { defaultLocale, type Locale, locales } from "@pets-driven/i18n/config";

/**
 * The site's canonical origin. Every absolute URL the site emits — canonical
 * links, hreflang alternates, Open Graph, the sitemap, robots.txt — is derived
 * from this one value, so moving to another domain is a single env change and
 * cannot leave half the URLs pointing at the old host.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://pets-driven.xyz").replace(
  /\/+$/,
  "",
);

/**
 * GitHub redirects this to the newest release's asset of that exact name, so the
 * CTA hands over the installer itself instead of dropping visitors on a release
 * page to hunt for it. The release workflow attaches the version-less copy.
 */
export const DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
  "https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe";

export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/young1the/pets-driven";

/** Root-relative path of a locale's landing page. */
export const localePath = (locale: Locale) => `/${locale}`;

/** Absolute URL of a locale's landing page. */
export const localeUrl = (locale: Locale) => `${SITE_URL}${localePath(locale)}`;

/**
 * The hreflang set every localized page must carry. A page has to link to all
 * of its siblings *and* itself, not just to the others, or search engines drop
 * the cluster — hence building it from `locales` rather than the current page.
 * `x-default` sends unmatched languages to the source locale.
 */
const hreflangSet = (href: (locale: Locale) => string): Record<string, string> => ({
  ...Object.fromEntries(locales.map((locale) => [locale, href(locale)])),
  "x-default": href(defaultLocale),
});

/** For `Metadata.alternates`, which Next resolves against `metadataBase`. */
export const hreflangAlternates = hreflangSet(localePath);

/**
 * For the sitemap, which needs the same set spelled out absolutely: its
 * serializer does not resolve against `metadataBase`, and Google ignores a
 * relative hreflang href in a sitemap.
 */
export const absoluteHreflangAlternates = hreflangSet(localeUrl);

/** Open Graph wants a full `language_TERRITORY` tag, unlike hreflang. */
export const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  ko: "ko_KR",
  ja: "ja_JP",
  zh: "zh_CN",
};

/** The demo video's poster doubles as the share card; dimensions must match. */
export const OG_IMAGE = {
  url: "/service-demo-poster.png",
  width: 1920,
  height: 1080,
} as const;
