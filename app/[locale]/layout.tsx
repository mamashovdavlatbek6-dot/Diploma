import { cookies } from 'next/headers';
import { Runtime } from '@/components/layout/runtime';
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import "../globals.css";
import { isLocale, locales, localeTags } from "@/config/i18n";
import { siteConfig } from "@/config/site";
import { getMessages } from "@/lib/i18n/messages";
import { localizedAlternates, metadataBase } from "@/lib/i18n/metadata";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const unbounded = localFont({ src: '../../public/fonts/Display.woff2', variable: '--font-unbounded', display: 'swap', weight: '600' });
const onest = localFont({ src: '../../public/fonts/Onest.woff2', variable: '--font-onest', display: 'swap', weight: '100 900' });
const jetbrains = localFont({ src: '../../public/fonts/JetBrainsMono.woff2', variable: '--font-jetbrains', display: 'swap', weight: '100 800' });

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: siteConfig.themeColor, colorScheme: "dark" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return {
    metadataBase,
    title: { default: m.meta.title, template: `%s · ${siteConfig.name}` },
    description: m.meta.description,
    alternates: localizedAlternates(locale),
    openGraph: { type: "website", siteName: siteConfig.name, title: m.meta.title, description: m.meta.description, locale: localeTags[locale] },
    twitter: { card: "summary_large_image", title: m.meta.title, description: m.meta.description },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const theme = (await cookies()).get('AEGIS_THEME')?.value === 'light' ? 'light' : 'dark';

  return (
    <html data-theme={theme} lang={localeTags[locale]} className={`${unbounded.variable} ${onest.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
          {m.skip}
        </a>
        <SiteHeader locale={locale} messages={m} theme={theme} />
        <Runtime />
        <main id="main">{children}</main>
        <SiteFooter messages={m} />
      </body>
    </html>
  );
}
