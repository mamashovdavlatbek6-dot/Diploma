import type { EventSource, NormalizedEvent } from "@/server/schema/event";

export const inputFormats = ["json", "ndjson", "cic-csv", "zeek-conn", "auth-log", "access-log"] as const;
export type InputFormat = (typeof inputFormats)[number];

export interface ParseOptions {
  source: EventSource;
  /** Maximum number of input records, including invalid records. */
  maxRows: number;
  /** Reference time (ms) for year inference and future-timestamp rejection. */
  now?: number;
}

export interface ParseError {
  line: number;
  error: string;
}

export interface ParseResult {
  format: InputFormat;
  events: NormalizedEvent[];
  errors: ParseError[];
  /** Total non-empty, non-comment records seen. */
  records: number;
  /** True when maxRows was reached before the end of input. */
  truncated: boolean;
}

/** Collects errors without letting a hostile file blow up memory. */
export const MAX_REPORTED_ERRORS = 50;

export function pushError(errors: ParseError[], line: number, error: string) {
  if (errors.length < MAX_REPORTED_ERRORS) errors.push({ line, error });
}

/** Iterates lines lazily without materializing a split array of the whole input. */
export function* iterateLines(text: string): Generator<{ line: string; n: number }> {
  let start = 0;
  let n = 0;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    n += 1;
    let line = text.slice(start, end);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    yield { line, n };
    if (end === text.length) break;
    start = end + 1;
  }
}
