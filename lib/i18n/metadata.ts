import type { Metadata } from "next";
import { locales, localeTags, defaultLocale, type Locale } from "@/config/i18n";
import { siteConfig } from "@/config/site";

/** Canonical + hreflang alternates for a locale-agnostic path ("" = home). */
export function localizedAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[localeTags[l]] = `/${l}${path}`;
  languages["x-default"] = `/${defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}

export const metadataBase = new URL(siteConfig.url);
