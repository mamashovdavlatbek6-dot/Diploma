import Link from "next/link";
import { locales, localeLabels, type Locale } from "@/config/i18n";
import { siteConfig } from "@/config/site";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Static floating pill header. The liquid-glass animated navigation replaces
 * the interactive layer in phase 5; structure and a11y contract stay the same.
 */
export function SiteHeader({ locale, messages }: { locale: Locale; messages: Messages }) {
  const items = siteConfig.nav.filter((item) => item.enabled);
  return (
    <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <nav aria-label={messages.nav.primary} className="glass flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 shadow-[0_10px_40px_rgb(0_0_0/0.4)]">
        <Link href={`/${locale}`} aria-current="page" className="flex min-h-11 items-center gap-2 pr-2 font-display text-sm font-semibold">
          <span className="size-2.5 rotate-45 rounded-[3px] bg-primary shadow-glow" aria-hidden />
          {siteConfig.name}
        </Link>
        {items.map((item) => (
          <Link key={item.key} href={`/${locale}${item.href}`} className="min-h-11 rounded-full px-3 py-3 text-sm text-muted hover:text-foreground">
            {messages.nav[item.key]}
          </Link>
        ))}
        <ul className="flex rounded-full border border-line p-0.5" aria-label={messages.nav.language}>
          {locales.map((l) => (
            <li key={l}>
              <Link
                href={`/${l}`}
                hrefLang={l}
                aria-current={l === locale ? "true" : undefined}
                className={`grid min-h-10 min-w-10 place-items-center rounded-full font-mono text-xs transition-colors ${l === locale ? "bg-primary/15 text-primary" : "text-muted hover:text-foreground"}`}
              >
                {localeLabels[l]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
