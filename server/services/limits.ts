/** Request size and row caps (documented in README). */
export const LIMITS = {
  ingest: { maxBytes: 1_000_000, maxRows: 5_000 },
  detect: { maxBytes: 512_000, maxRows: 2_000 },
} as const;
