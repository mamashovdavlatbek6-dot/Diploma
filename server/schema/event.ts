import { z } from "zod";

/**
 * Normalized event schema, version 1.
 *
 * Direction convention: `bytes_out` = bytes sent by `src_ip`,
 * `bytes_in` = bytes received by `src_ip`.
 * Every string field is already sanitized (no control characters) and
 * truncated to the limits in FIELD_LIMITS by the normalizer.
 */
export const SCHEMA_VERSION = 1 as const;

export const FIELD_LIMITS = {
  user: 128,
  path: 1024,
  userAgent: 512,
  method: 16,
  dnsQuery: 255,
  qtype: 16,
  rawRef: 128,
  tcpFlags: 12,
} as const;

export const MAX_COUNTER = 1e12;

export const eventSources = ["sim", "agent", "file", "api"] as const;
export const protocols = ["tcp", "udp", "icmp", "other"] as const;
export const actions = ["allow", "deny", "success", "failure", "unknown"] as const;

const ip = z.union([z.ipv4(), z.ipv6()]);
const port = z.number().int().min(0).max(65535);
const counter = z.number().int().min(0).max(MAX_COUNTER);

export const httpSchema = z
  .object({
    method: z.string().max(FIELD_LIMITS.method),
    path: z.string().max(FIELD_LIMITS.path),
    status: z.number().int().min(100).max(599).nullable(),
    user_agent: z.string().max(FIELD_LIMITS.userAgent).nullable(),
  })
  .strict();

export const dnsSchema = z
  .object({
    query: z.string().max(FIELD_LIMITS.dnsQuery),
    qtype: z.string().max(FIELD_LIMITS.qtype).nullable(),
  })
  .strict();

export const eventSchema = z
  .object({
    v: z.literal(SCHEMA_VERSION),
    ts: z.iso.datetime({ offset: false }),
    source: z.enum(eventSources),
    src_ip: ip,
    dst_ip: ip.nullable(),
    src_port: port.nullable(),
    dst_port: port.nullable(),
    proto: z.enum(protocols),
    bytes_in: counter,
    bytes_out: counter,
    packets: counter,
    duration_ms: counter,
    tcp_flags: z.string().regex(/^[A-Z]*$/).max(FIELD_LIMITS.tcpFlags).nullable(),
    action: z.enum(actions),
    user: z.string().max(FIELD_LIMITS.user).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/).nullable(),
    http: httpSchema.nullable(),
    dns: dnsSchema.nullable(),
    raw_ref: z.string().max(FIELD_LIMITS.rawRef).nullable(),
  })
  .strict();

export type NormalizedEvent = z.infer<typeof eventSchema>;
export type EventSource = (typeof eventSources)[number];
export type Protocol = (typeof protocols)[number];
export type EventAction = (typeof actions)[number];
