/**
 * Single source of truth for site-wide settings and diploma metadata.
 * Edit values here; components never hard-code content.
 * Fields set to null are intentionally empty until the author fills them in —
 * the UI hides them instead of inventing data.
 */
export const siteConfig = {
  name: "Aegis SOC",
  shortName: "Aegis",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  themeColor: "#05070d",
  repository: "https://github.com/mamashovdavlatbek6-dot/Diploma",

  diploma: {
    author: null as string | null,
    supervisor: null as string | null,
    university: null as string | null,
    year: 2026,
  },

  contacts: {
    email: null as string | null,
    telegram: null as string | null, // username without @
    whatsapp: null as string | null, // digits only, international format
  },

  /**
   * Navigation (max 5 items, logo = home). `enabled` turns on an item once its
   * page ships in a later phase, so the nav never contains dead links.
   */
  nav: [
    { key: "console", href: "/console", enabled: true },
    { key: "analyze", href: "/analyze", enabled: false },
    { key: "incidents", href: "/incidents", enabled: true },
    { key: "method", href: "/method", enabled: false },
    { key: "about", href: "/about", enabled: false },
  ],
} as const;

export type NavKey = (typeof siteConfig.nav)[number]["key"];
