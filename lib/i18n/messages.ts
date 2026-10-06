import type { Locale } from "@/config/i18n";
import ru from "@/content/messages/ru.json";
import en from "@/content/messages/en.json";
import kk from "@/content/messages/kk.json";

export type Messages = typeof ru;

const dictionaries: Record<Locale, Messages> = { ru, en, kk };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/** Flatten nested message objects into dot-separated keys (used by parity tests). */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}
