import { isIP } from "node:net";
import { getState, MemoryState, type StateAdapter } from "@/server/adapters/state";
import { ApiError } from "./errors";

export interface RateLimitRule {
  /** Bucket name, e.g. "detect". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  ingest: { name: "ingest", limit: 120, windowSeconds: 60 },
  detect: { name: "detect", limit: 30, windowSeconds: 60 },
  read: { name: "read", limit: 240, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

const fallback = new MemoryState();

/** Fixed-window limiter. If the shared store fails, falls back to per-instance memory. */
export async function checkRateLimit(key: string, rule: RateLimitRule, state: StateAdapter = getState()): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / (rule.windowSeconds * 1000));
  const bucket = `rl:${rule.name}:${window}:${key}`;
  let r: { count: number; ttlMs: number };
  try {
    r = await state.incr(bucket, rule.windowSeconds);
  } catch {
    r = await fallback.incr(bucket, rule.windowSeconds);
  }
  return { allowed: r.count <= rule.limit, remaining: Math.max(0, rule.limit - r.count), resetMs: r.ttlMs, limit: rule.limit };
}

/** Client IP from platform headers (Vercel sets x-real-ip / x-forwarded-for). */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd && isIP(fwd)) return fwd;
  return "unknown";
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(Math.ceil(r.resetMs / 1000)),
  };
}

export async function enforceRateLimit(request: Request, rule: RateLimitRule): Promise<Record<string, string>> {
  const r = await checkRateLimit(clientIp(request), rule);
  const headers = rateLimitHeaders(r);
  if (!r.allowed) {
    throw new ApiError(429, "rate_limited", "Too many requests", { ...headers, "Retry-After": headers["RateLimit-Reset"]! });
  }
  return headers;
}
