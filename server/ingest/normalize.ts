import { isIP } from "node:net";
import {
  eventSchema,
  FIELD_LIMITS,
  MAX_COUNTER,
  SCHEMA_VERSION,
  type EventAction,
  type EventSource,
  type NormalizedEvent,
  type Protocol,
} from "@/server/schema/event";
import { sanitizeString } from "@/server/security/sanitize";

export type NormalizeResult =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; error: string };

type Loose = Record<string, unknown>;

const MIN_TS = Date.UTC(2000, 0, 1);
const MAX_FUTURE_MS = 24 * 3600 * 1000;

function pick(obj: Loose, ...keys: string[]): unknown {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "" && v !== "-") return v;
  }
  return undefined;
}

/** Accepts ISO strings, epoch seconds or epoch milliseconds. */
export function normalizeTimestamp(value: unknown, now = Date.now()): string | null {
  let ms: number;
  if (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()))) {
    const n = Number(value);
    ms = n < 1e11 ? n * 1000 : n;
  } else if (typeof value === "string") {
    ms = Date.parse(value.trim());
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else {
    return null;
  }
  if (!Number.isFinite(ms) || ms < MIN_TS || ms > now + MAX_FUTURE_MS) return null;
  return new Date(Math.floor(ms)).toISOString();
}

function normalizeIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s.toLowerCase().startsWith("::ffff:") && isIP(s.slice(7)) === 4) s = s.slice(7);
  return isIP(s) ? s.toLowerCase() : null;
}

function normalizePort(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : null;
}

function normalizeCounter(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), MAX_COUNTER);
}

const PROTO_NUMBERS: Record<string, Protocol> = { "6": "tcp", "17": "udp", "1": "icmp", "58": "icmp" };

export function normalizeProto(value: unknown): Protocol {
  if (value === undefined || value === null) return "other";
  const s = String(value).trim().toLowerCase();
  if (s in PROTO_NUMBERS) return PROTO_NUMBERS[s]!;
  if (s === "tcp" || s === "udp" || s === "icmp") return s;
  if (s === "icmp6" || s === "icmpv6") return "icmp";
  return "other";
}

const ACTION_ALIASES: Record<string, EventAction> = {
  allow: "allow", allowed: "allow", accept: "allow", accepted: "allow", pass: "allow", permit: "allow",
  deny: "deny", denied: "deny", block: "deny", blocked: "deny", drop: "deny", dropped: "deny", reject: "deny", rejected: "deny",
  success: "success", succeeded: "success", ok: "success",
  failure: "failure", fail: "failure", failed: "failure", error: "failure",
};

function normalizeAction(value: unknown): EventAction {
  if (typeof value !== "string") return "unknown";
  return ACTION_ALIASES[value.trim().toLowerCase()] ?? "unknown";
}

function normalizeFlags(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.toUpperCase().replace(/[^A-Z]/g, "");
  return s ? s.slice(0, FIELD_LIMITS.tcpFlags) : null;
}

function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

function asObject(value: unknown): Loose | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : null;
}

function normalizeHttp(raw: Loose): NormalizedEvent["http"] {
  const h = asObject(raw.http) ?? {};
  const method = sanitizeString(pick(h, "method") ?? pick(raw, "http_method", "method"), FIELD_LIMITS.method);
  const path = sanitizeString(pick(h, "path", "uri", "url") ?? pick(raw, "http_path", "uri", "url", "path"), FIELD_LIMITS.path);
  if (!method && !path) return null;
  const statusRaw = Number(pick(h, "status") ?? pick(raw, "http_status", "status"));
  return {
    method: (method ?? "-").toUpperCase(),
    path: path ?? "/",
    status: Number.isInteger(statusRaw) && statusRaw >= 100 && statusRaw <= 599 ? statusRaw : null,
    user_agent: sanitizeString(pick(h, "user_agent", "userAgent") ?? pick(raw, "user_agent", "http_user_agent"), FIELD_LIMITS.userAgent),
  };
}

function normalizeDns(raw: Loose): NormalizedEvent["dns"] {
  const d = asObject(raw.dns) ?? {};
  const query = sanitizeString(pick(d, "query", "qname") ?? pick(raw, "dns_query", "query"), FIELD_LIMITS.dnsQuery);
  if (!query) return null;
  return {
    query: query.toLowerCase().replace(/\.$/, ""),
    qtype: sanitizeString(pick(d, "qtype", "qtype_name") ?? pick(raw, "dns_qtype", "qtype"), FIELD_LIMITS.qtype)?.toUpperCase() ?? null,
  };
}

/**
 * Strict normalizer: converts a loosely-typed record into a schema-v1 event or
 * returns a precise error. Never throws on hostile input.
 */
export function normalizeEvent(input: unknown, source: EventSource, now = Date.now()): NormalizeResult {
  const raw = asObject(input);
  if (!raw) return { ok: false, error: "event must be an object" };
  if (raw.v !== undefined && raw.v !== SCHEMA_VERSION) return { ok: false, error: "unsupported schema version" };

  const ts = normalizeTimestamp(pick(raw, "ts", "timestamp", "time", "@timestamp"), now);
  if (!ts) return { ok: false, error: "invalid or missing ts" };

  const srcIp = normalizeIp(pick(raw, "src_ip", "source_ip", "src", "client_ip", "id.orig_h"));
  if (!srcIp) return { ok: false, error: "invalid or missing src_ip" };

  const candidate: NormalizedEvent = {
    v: SCHEMA_VERSION,
    ts,
    source,
    src_ip: srcIp,
    dst_ip: normalizeIp(pick(raw, "dst_ip", "dest_ip", "destination_ip", "dst", "id.resp_h")),
    src_port: normalizePort(pick(raw, "src_port", "source_port", "sport", "id.orig_p")),
    dst_port: normalizePort(pick(raw, "dst_port", "dest_port", "destination_port", "dport", "id.resp_p")),
    proto: normalizeProto(pick(raw, "proto", "protocol")),
    bytes_in: normalizeCounter(pick(raw, "bytes_in")),
    bytes_out: normalizeCounter(pick(raw, "bytes_out")),
    packets: normalizeCounter(pick(raw, "packets")),
    duration_ms: normalizeCounter(pick(raw, "duration_ms")),
    tcp_flags: normalizeFlags(pick(raw, "tcp_flags", "flags")),
    action: normalizeAction(pick(raw, "action", "outcome")),
    user: sanitizeString(pick(raw, "user", "username"), FIELD_LIMITS.user),
    country: normalizeCountry(pick(raw, "country", "country_code")),
    http: normalizeHttp(raw),
    dns: normalizeDns(raw),
    raw_ref: sanitizeString(pick(raw, "raw_ref"), FIELD_LIMITS.rawRef),
  };

  const parsed = eventSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "event"}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, event: parsed.data };
}
