/**
 * Sanitization for attacker-controlled strings before they are stored or logged.
 * Removes ASCII/Unicode control characters (log injection: CR/LF, ANSI escapes,
 * NUL, bidi overrides) and truncates on a code-point boundary.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).replace(CONTROL, " ").trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  return chars.length > maxLength ? chars.slice(0, maxLength).join("") : cleaned;
}

/** Masks the last IPv4 octet or the last 80 bits of an IPv6 address. */
export function maskIp(ip: string): string {
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip;
  }
  const groups = ip.split(":").filter((g, i, arr) => g !== "" || i === 0 || i === arr.length - 1);
  return `${groups.slice(0, 3).join(":")}::`;
}

export function ipMaskingEnabled(): boolean {
  return process.env.IP_MASKING === "true";
}
