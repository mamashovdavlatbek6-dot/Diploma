import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

/** Constant-time comparison: both sides are hashed to equal-length digests first. */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db) && a.length === b.length;
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S{1,512})$/i.exec(header.trim());
  return m ? m[1]! : null;
}

export type TokenKind = "INGEST_TOKEN" | "ADMIN_TOKEN";

/**
 * Throws 503 if the token is not configured (feature disabled),
 * 401 if missing/invalid. Tokens shorter than 16 chars are treated as unset.
 */
export function requireToken(request: Request, kind: TokenKind): void {
  const expected = process.env[kind];
  if (!expected || expected.length < 16) {
    throw new ApiError(503, "service_unavailable", `${kind} is not configured on this deployment`);
  }
  const provided = bearerToken(request.headers.get("authorization"));
  if (!provided || !safeEqual(provided, expected)) {
    throw new ApiError(401, "unauthorized", "Missing or invalid bearer token", { "WWW-Authenticate": "Bearer" });
  }
}
