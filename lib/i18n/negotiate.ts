import { defaultLocale, isLocale, type Locale } from "@/config/i18n";

/** Parse an Accept-Language header into language subtags sorted by q. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .slice(0, 20)
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { lang: (tag ?? "").toLowerCase().split("-")[0] ?? "", quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((x) => x.lang && x.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((x) => x.lang);
}

/** Cookie wins, then Accept-Language, then the default locale. */
export function negotiateLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  for (const lang of parseAcceptLanguage(acceptLanguage)) {
    if (isLocale(lang)) return lang;
  }
  return defaultLocale;
}

/** Returns the locale prefix of a pathname, if any. */
export function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}
