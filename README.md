# Aegis SOC

Diploma project — *Development of an intelligent system for monitoring and detecting network security threats*
(RU: Разработка системы интеллектуального мониторинга и выявления угроз сетевой безопасности ·
KK: Желілік қауіпсіздік қауіптерін интеллектуалды мониторингілеу және анықтау жүйесін әзірлеу).

**Status: phase 1 of 9 (scaffold).** Detection backend, simulator, ML, console and other pages arrive in later phases.

## Stack
Next.js 16 (App Router, `proxy.ts` locale routing) · TypeScript strict · Tailwind CSS 4 · Zod · Vitest.

| Dependency | Why |
| --- | --- |
| next, react, react-dom | Framework (SSR/SSG, Route Handlers on Node runtime) |
| tailwindcss, @tailwindcss/postcss | Styling with design tokens in CSS variables |
| zod | Input/schema validation (used from phase 2) |
| vitest | Unit tests (i18n parity now; detectors later) |
| eslint, eslint-config-next, typescript | Lint and typecheck |

## Local run
```bash
nvm use            # Node 22 (see .nvmrc; >= 20.9 required)
npm ci
cp .env.example .env.local
npm run dev        # http://localhost:3000 -> redirects to /ru, /en or /kk
npm run lint && npm run typecheck && npm run test && npm run build
```

## i18n
Locales `ru` (default), `en`, `kk` under `/[locale]`. `proxy.ts` picks the locale from the `AEGIS_LOCALE` cookie, then `Accept-Language`, then `ru`.
Strings live in `content/messages/{ru,en,kk}.json`; a test fails if keys differ.

## Content and config
- `config/site.ts` — name, nav, diploma info, contacts. Author/supervisor/university/contacts are `null` until filled in; the UI hides empty fields.
- `config/theme.ts` + `app/globals.css` — design tokens.

## Deploy on Vercel
1. Push this directory as the repository root.
2. Vercel → *Add New Project* → import the repo. Preset "Next.js" is auto-detected; build `npm run build`; no `vercel.json` needed.
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL (other variables are optional, see `.env.example`).

## Environment variables
See `.env.example` — every variable is commented. None are required in phase 1 except `NEXT_PUBLIC_SITE_URL` for correct canonical URLs.

## CI
`.github/workflows/ci.yml` runs `npm ci`, lint, typecheck, test, build on push to `main` and on PRs.
