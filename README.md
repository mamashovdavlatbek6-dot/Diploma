# Aegis SOC

Рабочий дипломный продукт: события → нормализация → правила + статистика + ML → корреляция → объяснимые инциденты. Next.js 16 App Router, strict TypeScript, Node API, RU / EN / KK.

- Production: https://aegis-soc-diplom2.vercel.app/ru
- Repository: https://github.com/mamashovdavlatbek6-dot/Diploma
- API: `/ru/api-docs`; health: `/api/health`.

## Запуск

Node 22 или 24, npm. Python нужен только для переобучения, не для приложения.

```sh
git clone https://github.com/mamashovdavlatbek6-dot/Diploma.git
cd Diploma
npm ci
cp .env.example .env.local
npm run dev
```

Откройте http://localhost:3000/ru. Сайт, Simulation, файл-анализ и детекция работают без ключей. Для ingest и изменения статуса задайте **разные** `INGEST_TOKEN` и `ADMIN_TOKEN` длиной от 16 символов (`openssl rand -hex 32`). `.env.local` исключён из Git. Никаких секретов с префиксом `NEXT_PUBLIC_`.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm start
```

Сборка использует поддерживаемый webpack: локальный sandbox запрещал внутренний worker-port Turbopack. Шрифты поставляются локально, Google Fonts не нужны во время сборки.

## GitHub и Vercel

Код уже находится в `main`. GitHub Actions выполняет npm ci, lint, tsc, Vitest и production build на push/PR. Каждая фаза сохранена отдельным Conventional Commit; результаты команд находятся в `docs/checks/phaseN.json`.

Чтобы импортировать проект: Vercel → Add New Project → выбрать Diploma → Framework **Next.js**, Root Directory **./**, Node **24.x**, install **npm ci**, build **npm run build**, output по умолчанию. Задайте `NEXT_PUBLIC_SITE_URL` равным production URL. Остальные переменные необязательны. После изменения environment variables выполните redeploy. Для общедоступной ссылки требуется выключенная Deployment Protection для production. Первые деплои в подключённой команде получили SSO-защиту; изменение доступа требует согласия владельца.

Если Git-интеграция не подключена, верифицированный деплой можно создать из коммита через Vercel API. В этой сессии деплои публиковались именно так; автоматический redeploy при push требует подключения репозитория в Settings → Git. Настройки функций заданы в Route Handlers: Node runtime, maxDuration 15–30 секунд. Пакетный анализ не запускает сокеты или Python, запись возможна только в `/tmp`.

## Архитектура

```text
app/[locale]/       home, console, incidents, analyze, method, about, api-docs, privacy
app/api/            ingest, detect, analyze-file, events, alerts, incidents, stream, stats, health, contact
components/         layout, sections, ui, custom SVG visualizations
config/             site metadata, locale settings, tokens
content/            RU/EN/KK messages, model, metrics, threat intel, dot map
server/             parsers, schema, ingest, detection, correlation, security, adapters, services
agent/              dependency-free Node log tailer
ml/                 sklearn training, evaluation, JSON export, parity fixture
public/             local fonts, licenses, upload samples
supabase/           optional restricted SQL schema
scripts/            deterministic fixture generation
tests/              detector, parser, auth, limits, ML, i18n, security tests
docs/checks/        actual check output and integration audit
```

Next/React provide SSR and interaction; Zod validates untrusted data; Motion handles small transform/opacity animations; Lenis runs only on desktop; Tailwind supplies utility tokens; Vitest tests the pure engine. No map/chart library, external tiles, component kit or Python inference runtime.

## Источники и API

1. **Simulation** is a pure function of seed/time, always labeled in UI and API. Country arcs are schematic. It creates baseline plus all ten rule scenarios; the flow model supplies the eleventh class.
2. `POST /api/ingest`: authenticated, JSON/NDJSON or supported raw log text. Header `x-aegis-source: agent` selects agent provenance. Input cannot spoof `sim`.
3. `/analyze`: drag/drop or paste, lazy line parsers, normalized-progress/result NDJSON response, downloadable full JSON report. Does not store uploaded content. UI evidence is capped at 200 alerts.
4. `/agent`: tails Linux auth.log and nginx/Apache combined access logs; see [agent/README.md](agent/README.md).

Enforced byte/row caps: ingest 1,000,000 bytes / 5,000 rows; detect 512,000 bytes / 2,000 rows; analyze-file 5 MiB / 20,000 rows. Invalid rows are reported (max 50 errors), oversized requests get 413. Normalized schema v1: ISO UTC timestamp, source, source/destination IP and ports, protocol, byte/packet counters, duration, TCP flags, action, optional username/country/HTTP/DNS/raw reference. See `server/schema/event.ts` and the public API examples.

Read endpoints default to `source=simulation`; select `source=ingested` for received traffic. Public read APIs are intentionally read-only and available to visitors. Store counters at `/api/stats` describe received data, not Simulation. SSE emits a snapshot plus heartbeat every two seconds, ends after 24 seconds, and uses monotonic sequence IDs on reconnect. The client reconnects automatically with `lastEventId` and falls back to polling after repeated failures. IDs are delivery sequence numbers; missed intermediate snapshots are replaced by the current complete snapshot, not replayed history. Pause, hidden tabs and reduced motion stop appropriate work.

Default storage is a capped ring buffer plus best-effort `/tmp` snapshot **per instance**. There is no promise of durable or shared history. Memory state retains sliding windows, statuses, EWMA baselines, notification dedup and rate limits. With Redis, the detection window is capped at 2,000 retained events and shared across instances. Incident IDs are stable per entity/time bucket within the retained window; expired incident links produce a localized 404.

## Детекторы

All thresholds are tunable in `server/detection/config.ts`, with positive and quiet-baseline tests. Windows are five minutes with overlap; correlation uses shared entities within fifteen minutes.

| Class | MITRE | Evidence |
|---|---|---|
| Port scan | T1046 | ≥16 destination ports or ≥12 hosts, failed/SYN ratio |
| Brute force | T1110 | ≥10 failures, ratio ≥0.7, success after failures |
| SYN/UDP flood | T1498 | ≥5,000 pps, source fan-in/SYN/UDP, peak rate |
| DNS tunnel | T1071.004 | query length ≥60, entropy ≥3.5, ≥10 subdomains, TXT ratio |
| Beacon | T1071 | ≥8 connections, interval CV ≤0.12, small steady payload |
| Exfiltration | T1041 | outbound ≥40 MB, ratio ≥20, destination/baseline/off-hours evidence |
| Lateral | T1021 | ≥8 private hosts over SSH/SMB/RDP/WinRM |
| Web | T1190 | decoded SQLi/XSS/traversal/command/scanner signatures, error bursts |
| Threat intelligence | T1071 | bundled Feodo snapshot or optional live reputation |
| Impossible travel | T1078 | country-centroid distance >1,000 km and speed >1,000 km/h |
| Flow ML + EWMA | T1041 | small forest probability; warm online volume/rate z-score >6 |

Web signatures are documented directly in `server/detection/web-attack.ts`; percent decoding runs at most three times. Correlation deduplicates alerts, maps six kill-chain stages and computes bounded monotonic risk. Rule feature weights are heuristic evidence allocation; model weights are signed median-ablation contributions, not SHAP or causal attribution. All response actions are **recommendations**, never executed by the system. Detection is probabilistic and can miss attacks or produce false positives.

## ML и данные

Actual training produced 6,000 training and 2,000 held-out synthetic flows, 16 trees, depth 5. Accuracy 0.9985, weighted F1 0.998499993; exact precision, recall, ROC-AUC, class report and confusion matrix are in `content/metrics.json`. **These are synthetic benchmark results**, not CIC-IDS2017 or UNSW accuracy. No public dataset archive was downloaded in this session. `/method` explicitly states drift, imbalance, bias and false-positive limits.

[ml/README.md](ml/README.md) contains public dataset links, preprocessing assumptions and exact retrain commands. Python exports the shipped JSON forest and 64 parity vectors; TypeScript class probabilities match the Python fixture within 1e-10. Runtime input is cast to float32 to match sklearn. Validate on independent networks before operational reliance.

Threat intel snapshot provenance/date is in `content/threat-intel.json`. Historical listed addresses are signals for review, not guaranteed active C2. Optional live enrichment runs **on ingest only**, never against the synthetic demo: set `THREAT_INTEL_FEED_URL` to a trusted HTTPS Feodo-style JSON or newline IP feed; cached one hour, capped 2 MB / 20,000 IPs. `ABUSEIPDB_API_KEY` checks up to three public IPs per batch, caches daily and flags score ≥80. Without env or on failure, bundled rules remain operational. Supplying AbuseIPDB sends public IPs to that provider.

## Переменные окружения

`.env.example` documents every variable. No variable is required for the public demo.

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_SITE_URL | canonical, sitemap, links |
| INGEST_TOKEN / ADMIN_TOKEN | separate server-side Bearer secrets |
| STORE_CAPACITY / STORE_PERSIST | 100..50,000 cap / best-effort tmp persistence |
| UPSTASH_REDIS_REST_URL / TOKEN | shared windows, baselines, statuses, rate limits |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | optional durable event/counter store |
| IP_MASKING | IPv4 /24, IPv6 /48 in public responses |
| TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID | notifications to a chosen chat |
| WEBHOOK_URL | Slack/Discord-compatible webhook |
| THREAT_INTEL_FEED_URL / ABUSEIPDB_API_KEY | optional ingest enrichment |
| NEXT_PUBLIC_GA4_ID / NEXT_PUBLIC_YANDEX_METRIKA_ID | optional consent-gated analytics |
| NEXT_PUBLIC_VERCEL_ANALYTICS | consent-gated Vercel Analytics (dashboard enable required) |
| DIPLOMA_AUTHOR / SUPERVISOR / UNIVERSITY | public About metadata |
| CONTACT_EMAIL | optional public business email |
| NEXT_PUBLIC_TELEGRAM_USERNAME / WHATSAPP_NUMBER | optional floating contact links |

## Подключение интеграций

**Redis (5 minutes):** provision an Upstash database, set both REST variables in production, redeploy. This enables cross-instance rate limits and sliding-window/state continuity. Use separate databases/credentials for preview and production.

**Supabase (10 minutes):** create your own project, run `supabase/schema.sql`, set URL and secret service-role key, redeploy. RLS is enabled; anon/authenticated have no table/RPC access. Server-side `SupabaseEventStore` switches automatically; capped insertion/counters are transactional. Redis is still needed for shared EWMA/status/rate limits. This SQL adapter was inspected and typechecked, but no external database was provisioned or migration executed in this session. A Neon/Drizzle implementation can implement the same `EventStore` interface.

**Notifications:** set Telegram token/chat or webhook, redeploy. Only received high/critical incidents notify, with deduplication; Simulation never sends. Contact form uses Zod, a honeypot and 5 submissions/hour/IP. Without a configured/delivering channel, messages go into a bounded 100-message outbox for one hour in the State adapter; default memory can disappear with the instance. The outbox is not an automatic retry worker and the UI explicitly reports queued rather than delivered. Enabling a channel affects new submissions. Optional providers were not configured or sent messages during this build.

**Analytics:** enable the desired provider and set its public ID, redeploy. Consent banner appears only when analytics is configured. No analytics script loads before acceptance. Changing accepted consent reloads the page to remove provider handlers. Yandex webvisor/clickmap are disabled. Privacy page describes provider processing.

**Authentication (10-minute integration path):** keep token-protected ingest/admin API for machines. Add your selected identity SDK (e.g. Supabase Auth), verify users server-side, implement `IdentityAdapter.identify`, enforce role in mutation handlers and connect the sign-in UI. Current `identity` is explicitly disabled; no incomplete login is shown.

**Payments (10-minute integration path):** install your payment SDK, create a server-only checkout route, verify webhook signatures and implement `PaymentAdapter.checkout`. Current `payments` is disabled; no checkout or charging behavior exists. Do not route payment processing through a public client secret.

## Security and accessibility

Attacker-controlled values are React text, never HTML. Strings are truncated and control/bidi characters removed. No `dangerouslySetInnerHTML`, no payload execution. Zod, byte/row caps, same-origin checks, rate limiting and consistent non-stack JSON errors protect input. Token comparisons hash secrets then use timing-safe comparison. Default public demo has no configured mutation/ingest credentials.

Page CSP uses per-request script nonces and strict-dynamic; style-src allows inline styles required for Motion. X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy and Permissions-Policy are enabled. Local fonts include Kazakh glyphs. Keyboard-visible focus, modal focus trap/ESC/scroll lock, 44px controls, reduced-motion fallback, mobile dock and bounded visualizations are implemented. No real geolocation is invented: only provided supported country centroids are drawn; Simulation arcs are explicitly schematic.

## Assumptions and measured limits

The initially empty public `Diploma` repo was used. Author name is an editable assumption based on the connected account; supervisor, university and personal contacts were not supplied. Telegram/WhatsApp links are hidden until configured. Lovable supplied an initial source scaffold; its credits ran out, so the complete Next.js application was finished and validated locally. No Figma design URL was supplied or Figma artifact created. No paid Supabase resources were provisioned.

The final checks and integration results are in `docs/checks` and `docs/AUDIT.md`. Lighthouse mobile scores and 60 FPS on a physical mid-range phone have not been measured; they are design targets, not certified results. Default per-instance state, synthetic-model generalization and optional unconfigured integrations remain explicit operational limitations.
