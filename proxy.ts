import { NextResponse, type NextRequest } from "next/server";
import { localeCookie } from "@/config/i18n";
import { localeFromPath, negotiateLocale } from "@/lib/i18n/negotiate";

/** Locale routing: every page lives under /[locale]. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const current = localeFromPath(pathname);

  if (current) {
    const response = NextResponse.next();
    if (request.cookies.get(localeCookie)?.value !== current) {
      response.cookies.set(localeCookie, current, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    return response;
  }

  const locale = negotiateLocale(request.cookies.get(localeCookie)?.value, request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
