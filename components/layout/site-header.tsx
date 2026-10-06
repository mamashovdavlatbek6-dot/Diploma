import { type Locale } from "@/config/i18n";
import { LiquidNav } from './liquid-nav';
import type { Messages } from "@/lib/i18n/messages";

/**
 * Static floating pill header. The liquid-glass animated navigation replaces
 * the interactive layer in phase 5; structure and a11y contract stay the same.
 */
export function SiteHeader({locale,messages,theme}:{locale:Locale;messages:Messages;theme:'dark'|'light'}){return <LiquidNav locale={locale} messages={messages} initialTheme={theme}/>;}
