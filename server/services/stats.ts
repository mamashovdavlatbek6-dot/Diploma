import type { EventStore } from "@/server/adapters/store";
import type { NormalizedEvent } from "@/server/schema/event";
import { maskIp } from "@/server/security/sanitize";

export interface StatsSummary {
  window: { events: number; from: string | null; to: string | null };
  total_ingested: number;
  by_source: Record<string, number>;
  by_proto: Record<string, number>;
  by_action: Record<string, number>;
  top_src_ips: { ip: string; count: number }[];
  top_dst_ports: { port: number; count: number }[];
}

function topN<K>(map: Map<K, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Pure aggregation over a window of events. */
export function summarize(events: readonly NormalizedEvent[], masking: boolean): Omit<StatsSummary, "total_ingested" | "by_source"> {
  const proto: Record<string, number> = {};
  const action: Record<string, number> = {};
  const ips = new Map<string, number>();
  const ports = new Map<number, number>();
  let from: string | null = null;
  let to: string | null = null;
  for (const e of events) {
    proto[e.proto] = (proto[e.proto] ?? 0) + 1;
    action[e.action] = (action[e.action] ?? 0) + 1;
    const ip = masking ? maskIp(e.src_ip) : e.src_ip;
    ips.set(ip, (ips.get(ip) ?? 0) + 1);
    if (e.dst_port !== null) ports.set(e.dst_port, (ports.get(e.dst_port) ?? 0) + 1);
    if (!from || e.ts < from) from = e.ts;
    if (!to || e.ts > to) to = e.ts;
  }
  return {
    window: { events: events.length, from, to },
    by_proto: proto,
    by_action: action,
    top_src_ips: topN(ips, 10).map(([ip, count]) => ({ ip, count })),
    top_dst_ports: topN(ports, 10).map(([port, count]) => ({ port, count })),
  };
}

export async function buildStats(store: EventStore, masking: boolean): Promise<StatsSummary> {
  const [events, counters] = await Promise.all([store.recent(store.capacity), store.counters()]);
  return { ...summarize(events, masking), total_ingested: counters.totalIngested, by_source: counters.bySource };
}
