export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "payload_too_large"
  | "unsupported_media_type"
  | "unprocessable"
  | "rate_limited"
  | "service_unavailable"
  | "internal";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Consistent error envelope; never includes stack traces. */
export function jsonError(status: number, code: ErrorCode, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, err.headers);
  console.error("[api] unhandled error:", err instanceof Error ? err.name : typeof err);
  return jsonError(500, "internal", "Internal server error");
}
