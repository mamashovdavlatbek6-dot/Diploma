import { describe, expect, it } from "vitest";
import { locales } from "@/config/i18n";
import { flattenKeys, getMessages } from "@/lib/i18n/messages";
import { negotiateLocale, parseAcceptLanguage, localeFromPath } from "@/lib/i18n/negotiate";
import { siteConfig } from "@/config/site";

describe("i18n message parity", () => {
  const base = flattenKeys(getMessages("ru")).sort();
  for (const locale of locales) {
    it(`${locale} has identical keys to ru`, () => {
      expect(flattenKeys(getMessages(locale)).sort()).toEqual(base);
    });
    it(`${locale} has no empty strings`, () => {
      const walk = (o: unknown): string[] =>
        typeof o === "string" ? [o] : Object.values(o as object).flatMap(walk);
      for (const s of walk(getMessages(locale))) expect(s.trim().length).toBeGreaterThan(0);
    });
  }
  it("Kazakh copy uses Kazakh-specific letters", () => {
    expect(JSON.stringify(getMessages("kk"))).toMatch(/[әғқңөұүһі]/);
  });
  it("every nav key has a translation", () => {
    for (const item of siteConfig.nav) expect(getMessages("en").nav[item.key]).toBeTruthy();
  });
});

describe("locale negotiation", () => {
  it("parses q-values in order", () => {
    expect(parseAcceptLanguage("en-US;q=0.5, kk-KZ, ru;q=0.8")).toEqual(["kk", "ru", "en"]);
  });
  it("cookie wins over header", () => {
    expect(negotiateLocale("kk", "en-US")).toBe("kk");
  });
  it("falls back to header then default", () => {
    expect(negotiateLocale(undefined, "de, en;q=0.9")).toBe("en");
    expect(negotiateLocale("xx", "de")).toBe("ru");
    expect(negotiateLocale(undefined, null)).toBe("ru");
  });
  it("detects locale prefix in path", () => {
    expect(localeFromPath("/kk/console")).toBe("kk");
    expect(localeFromPath("/console")).toBeNull();
  });
});

describe("site config", () => {
  it("has at most 5 nav items", () => {
    expect(siteConfig.nav.length).toBeLessThanOrEqual(5);
  });
});
