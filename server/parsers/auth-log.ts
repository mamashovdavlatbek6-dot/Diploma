import { normalizeEvent } from "@/server/ingest/normalize";
import { iterateLines, pushError, type ParseOptions, type ParseResult } from "./types";

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const SYSLOG_PREFIX = /^(?<mon>[A-Z][a-z]{2})\s+(?<day>\d{1,2})\s(?<time>\d{2}:\d{2}:\d{2})\s+\S+\s+sshd(?:-session)?\[\d+\]:\s(?<msg>.*)$/;
const ISO_PREFIX = /^(?<iso>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+\S+\s+sshd(?:-session)?\[\d+\]:\s(?<msg>.*)$/;

/** Only terminal outcome lines are used, so one attempt yields exactly one event. */
const FAILED = /^Failed (?<method>password|publickey|keyboard-interactive\/pam|none) for (?:invalid user )?(?<user>\S{0,128}) from (?<ip>[0-9a-fA-F:.]+) port (?<port>\d+)/;
const ACCEPTED = /^Accepted (?<method>password|publickey|keyboard-interactive\/pam|gssapi-with-mic) for (?<user>\S{0,128}) from (?<ip>[0-9a-fA-F:.]+) port (?<port>\d+)/;

export function looksLikeAuthLog(line: string): boolean {
  return SYSLOG_PREFIX.test(line) || ISO_PREFIX.test(line);
}

/** Syslog lines lack a year: use the reference year, roll back if that lands in the future. */
export function syslogTimestamp(mon: string, day: string, time: string, now: number): string | null {
  const month = MONTHS[mon];
  if (month === undefined) return null;
  const [h, m, s] = time.split(":").map(Number);
  const year = new Date(now).getUTCFullYear();
  let t = Date.UTC(year, month, Number(day), h, m, s);
  if (t > now + 24 * 3600 * 1000) t = Date.UTC(year - 1, month, Number(day), h, m, s);
  return new Date(t).toISOString();
}

export function parseAuthLog(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "auth-log", events: [], errors: [], records: 0, truncated: false };
  const now = opts.now ?? Date.now();

  for (const { line, n } of iterateLines(text)) {
    if (!line.trim()) continue;
    const pre = SYSLOG_PREFIX.exec(line) ?? ISO_PREFIX.exec(line);
    if (!pre?.groups) continue; // non-sshd lines are ignored, not errors
    const msg = pre.groups.msg ?? "";
    const failed = FAILED.exec(msg);
    const accepted = failed ? null : ACCEPTED.exec(msg);
    const m = failed ?? accepted;
    if (!m?.groups) continue;
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      break;
    }
    const ts = pre.groups.iso ?? syslogTimestamp(pre.groups.mon!, pre.groups.day!, pre.groups.time!, now);
    const r = normalizeEvent(
      {
        ts,
        src_ip: m.groups.ip,
        src_port: m.groups.port,
        dst_port: 22,
        proto: "tcp",
        action: failed ? "failure" : "success",
        user: m.groups.user,
        raw_ref: `line:${n}`,
      },
      opts.source,
      now,
    );
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, n, r.error);
  }
  return result;
}
