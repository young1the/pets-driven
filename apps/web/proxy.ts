import { defaultLocale, isLocale, locales } from "@pets-driven/i18n/config";
import { type NextRequest, NextResponse } from "next/server";

const LOCALE_COOKIE = "pd-locale";

/** Pick the best locale from a stored cookie, then the Accept-Language header. */
function resolveLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    const base = tag?.split("-")[0];
    if (isLocale(base)) {
      return base;
    }
  }

  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Already prefixed with a supported locale — let it through.
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) {
    return NextResponse.next();
  }

  // Redirect bare paths (e.g. "/") to the resolved locale.
  const locale = resolveLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and static assets; only run on page routes.
  matcher: ["/((?!_next|.*\\..*).*)"],
};
