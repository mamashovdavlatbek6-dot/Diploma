import { looksLikeAccessLog, parseAccessLog } from "./access-log";
import { looksLikeAuthLog, parseAuthLog } from "./auth-log";
import { looksLikeCicHeader, parseCicCsv } from "./cic-csv";
import { parseJson, parseNdjson } from "./json";
import { inputFormats, iterateLines, type InputFormat, type ParseOptions, type ParseResult } from "./types";
import { looksLikeZeek, parseZeekConn } from "./zeek-conn";

export { inputFormats, type InputFormat, type ParseOptions, type ParseResult };

/** Content sniffing on the first meaningful lines. Returns null if unknown. */
export function detectFormat(text: string): InputFormat | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) return "json";
  const lines: string[] = [];
  for (const { line } of iterateLines(trimmed)) {
    if (line.trim()) lines.push(line);
    if (lines.length >= 5) break;
  }
  const first = lines[0] ?? "";
  if (first.startsWith("{")) {
    if (lines.length > 1 && lines[1]!.trimStart().startsWith("{")) return "ndjson";
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "ndjson";
    }
  }
  if (looksLikeZeek(first)) return "zeek-conn";
  if (looksLikeCicHeader(first)) return "cic-csv";
  if (lines.some(looksLikeAuthLog)) return "auth-log";
  if (lines.some(looksLikeAccessLog)) return "access-log";
  return null;
}

const PARSERS: Record<InputFormat, (text: string, opts: ParseOptions) => ParseResult> = {
  json: parseJson,
  ndjson: parseNdjson,
  "cic-csv": parseCicCsv,
  "zeek-conn": parseZeekConn,
  "auth-log": parseAuthLog,
  "access-log": parseAccessLog,
};

export function parseInput(text: string, format: InputFormat, opts: ParseOptions): ParseResult {
  return PARSERS[format](text, opts);
}
