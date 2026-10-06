export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";
export const localeCookie = "AEGIS_LOCALE";

export const localeLabels: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  kk: "KK",
};

/** BCP 47 tags used for hreflang and the html lang attribute. */
export const localeTags: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
  kk: "kk-KZ",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
