import { normalizeEvent } from "@/server/ingest/normalize";
import { iterateLines, pushError, type ParseOptions, type ParseResult } from "./types";

/** nginx/Apache "combined" and "common" log formats. */
const ACCESS =
  /^(?<ip>[0-9a-fA-F:.]+) \S+ (?<user>\S+) \[(?<time>[^\]]+)\] "(?<method>[A-Z]{1,16}) (?<path>\S{1,8192})(?: (?<proto>HTTP\/[0-9.]+))?" (?<status>\d{3}) (?<size>\d+|-)(?: "(?<ref>[^"]*)" "(?<ua>[^"]*)")?/;

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

export function looksLikeAccessLog(line: string): boolean {
  return ACCESS.test(line);
}

/** "10/Oct/2000:13:55:36 -0700" -> ISO */
export function parseClfTime(value: string): string | null {
  const m = /^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value);
  if (!m || !MONTHS[m[2]!]) return null;
  const t = Date.parse(`${m[3]}-${MONTHS[m[2]!]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7]}${m[8]}:${m[9]}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseAccessLog(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "access-log", events: [], errors: [], records: 0, truncated: false };
  for (const { line, n } of iterateLines(text)) {
    if (!line.trim()) continue;
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      break;
    }
    const m = ACCESS.exec(line);
    if (!m?.groups) {
      pushError(result.errors, n, "line does not match combined/common log format");
      continue;
    }
    const g = m.groups;
    const status = Number(g.status);
    const r = normalizeEvent(
      {
        ts: parseClfTime(g.time ?? ""),
        src_ip: g.ip,
        proto: "tcp",
        bytes_in: g.size === "-" ? 0 : g.size, // response body bytes received by the client
        action: status >= 400 ? "failure" : "success",
        user: g.user === "-" ? undefined : g.user,
        http: { method: g.method, path: g.path, status, user_agent: g.ua || undefined },
        raw_ref: `line:${n}`,
      },
      opts.source,
      opts.now,
    );
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, n, r.error);
  }
  return result;
}
