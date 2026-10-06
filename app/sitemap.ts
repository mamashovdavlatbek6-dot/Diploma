import type { MetadataRoute } from "next";
import { locales, localeTags } from "@/config/i18n";
import { siteConfig } from "@/config/site";

/** Public marketing and documentation routes. */
const paths = ["", "/analyze", "/method", "/about", "/api-docs", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [localeTags[l], `${siteConfig.url}/${l}${path}`])),
      },
    })),
  );
}
