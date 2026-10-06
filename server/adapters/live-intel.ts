import { isIP } from 'node:net';
import { getState } from './state';
import { alert } from '@/server/detection/common';
import { readBodyCapped } from '@/server/security/body';
import type { NormalizedEvent } from '@/server/schema/event';
import type { Alert } from '@/server/detection/types';

/** Optional ingest enrichment. No keys = no requests. Local rules remain available. */
export async function liveIntel(events: readonly NormalizedEvent[]): Promise<Alert[]> {
  const state = getState();
  const output: Alert[] = [];
  const feed = process.env.THREAT_INTEL_FEED_URL;
  if (feed) {
    try {
      const url = new URL(feed);
      if (url.protocol === 'https:') {
        let ips = await state.getJson<string[]>('live-feed');
        if (!ips) {
          const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
          if (response.ok) {
            const text = await readBodyCapped(response, 2_000_000);
            let values: string[];
            if (text.trim().startsWith('[')) {
              const rows = JSON.parse(text) as unknown[];
              values = rows.flatMap(row => typeof row === 'string' ? [row] : row && typeof row === 'object' && 'ip_address' in row ? [String(row.ip_address)] : []);
            } else {
              values = text.split(/\r?\n/).filter(line => !line.startsWith('#')).map(line => line.split(',')[0].trim());
            }
            ips = values.filter(ip => isIP(ip)).slice(0, 20000);
            await state.setJson('live-feed', ips, 3600);
          }
        }
        const set = new Set(ips ?? []);
        for (const event of events.filter(e => set.has(e.src_ip) || e.dst_ip && set.has(e.dst_ip)).slice(0, 20)) {
          output.push(alert('threat_intel', [event], 'high', [
            { field: 'blocklist_match', value: set.has(event.src_ip) ? event.src_ip : event.dst_ip! },
            { field: 'feed', value: url.hostname },
          ], .95));
        }
      }
    } catch { /* Optional feeds are best effort. */ }
  }
  const key = process.env.ABUSEIPDB_API_KEY;
  if (key) {
    const publicIps = events.flatMap(e => [e.src_ip, e.dst_ip]).filter((ip): ip is string =>
      !!ip && isIP(ip) > 0 && !/^(10\.|192\.168\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|::1|f[cd])/i.test(ip));
    await Promise.all([...new Set(publicIps)].slice(0, 3).map(async ip => {
      try {
        let score = await state.getJson<number>(`abuse:${ip}`);
        if (score === null) {
          const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
            headers: { Key: key, Accept: 'application/json' }, signal: AbortSignal.timeout(2000),
          });
          if (!response.ok) return;
          const data = await response.json() as { data?: { abuseConfidenceScore?: number } };
          score = data.data?.abuseConfidenceScore ?? 0;
          await state.setJson(`abuse:${ip}`, score, 86400);
        }
        if (score >= 80) {
          output.push(alert('threat_intel', events.filter(e => e.src_ip === ip || e.dst_ip === ip), 'high', [
            { field: 'blocklist_match', value: ip }, { field: 'abuse_score', value: score, threshold: 80 },
          ], Math.min(1, score / 100)));
        }
      } catch { /* Reputation failures do not disable detection. */ }
    }));
  }
  return output;
}
