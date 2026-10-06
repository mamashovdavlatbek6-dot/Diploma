import { normalizeEvent } from "@/server/ingest/normalize";
import { headerKey, parseCsvLine } from "./csv";
import { iterateLines, pushError, type ParseOptions, type ParseResult } from "./types";

/** Header aliases across CICFlowMeter versions (CIC-IDS2017 / CSE-CIC-IDS2018). */
const COLUMNS = {
  srcIp: ["srcip", "sourceip"],
  dstIp: ["dstip", "destinationip"],
  srcPort: ["srcport", "sourceport"],
  dstPort: ["dstport", "destinationport"],
  proto: ["protocol"],
  ts: ["timestamp"],
  duration: ["flowduration"],
  fwdPkts: ["totfwdpkts", "totalfwdpackets"],
  bwdPkts: ["totbwdpkts", "totalbackwardpackets", "totalbwdpackets"],
  fwdBytes: ["totlenfwdpkts", "totallengthoffwdpackets"],
  bwdBytes: ["totlenbwdpkts", "totallengthofbwdpackets"],
  syn: ["synflagcnt", "synflagcount"],
  ack: ["ackflagcnt", "ackflagcount"],
  rst: ["rstflagcnt", "rstflagcount"],
  fin: ["finflagcnt", "finflagcount"],
} as const;

export function looksLikeCicHeader(line: string): boolean {
  const keys = new Set(parseCsvLine(line).map(headerKey));
  return COLUMNS.dstPort.some((k) => keys.has(k)) && COLUMNS.duration.some((k) => keys.has(k));
}

/**
 * CICFlowMeter timestamps are day-first ("7/7/2017 8:55", "03/07/2017 08:55:58 AM")
 * or ISO ("2018-02-14 08:31:01"). Interpreted as UTC.
 */
export function parseCicTimestamp(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim());
  if (m) {
    let hour = Number(m[4]);
    const ampm = m[7]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const d = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hour, Number(m[5]), Number(m[6] ?? 0));
    const date = new Date(d);
    if (date.getUTCFullYear() !== Number(m[3]) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[1]) || hour > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) return null;
    return Number.isFinite(d) ? new Date(d).toISOString() : null;
  }
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value.trim()) ? `${value.trim().replace(" ", "T")}Z` : value;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function flagString(syn: number, ack: number, rst: number, fin: number): string {
  return `${fin > 0 ? "F" : ""}${syn > 0 ? "S" : ""}${rst > 0 ? "R" : ""}${ack > 0 ? "A" : ""}`;
}

export function parseCicCsv(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "cic-csv", events: [], errors: [], records: 0, truncated: false };
  let index: Partial<Record<keyof typeof COLUMNS, number>> | null = null;

  for (const { line, n } of iterateLines(text)) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!index) {
      const keys = cells.map(headerKey);
      index = {};
      for (const [name, aliases] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, readonly string[]][]) {
        const i = keys.findIndex((k) => aliases.includes(k));
        if (i >= 0) index[name] = i;
      }
      if (index.srcIp === undefined || index.dstPort === undefined) {
        pushError(result.errors, n, "CIC header must include Src IP and Dst Port columns");
        return result;
      }
      continue;
    }
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      break;
    }
    const get = (k: keyof typeof COLUMNS) => (index![k] === undefined ? undefined : cells[index![k]!]);
    const num = (k: keyof typeof COLUMNS) => Number(get(k) ?? 0) || 0;
    const tsRaw = get("ts");
    const record = {
      ts: tsRaw ? parseCicTimestamp(tsRaw) : null,
      src_ip: get("srcIp"),
      dst_ip: get("dstIp"),
      src_port: get("srcPort"),
      dst_port: get("dstPort"),
      proto: get("proto"),
      duration_ms: num("duration") / 1000, // CICFlowMeter reports microseconds
      packets: num("fwdPkts") + num("bwdPkts"),
      bytes_out: num("fwdBytes"),
      bytes_in: num("bwdBytes"),
      tcp_flags: flagString(num("syn"), num("ack"), num("rst"), num("fin")),
      raw_ref: `line:${n}`,
    };
    const r = normalizeEvent(record, opts.source, opts.now);
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, n, r.error);
  }
  return result;
}
