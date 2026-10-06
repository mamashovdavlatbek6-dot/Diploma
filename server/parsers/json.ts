import { normalizeEvent } from "@/server/ingest/normalize";
import { iterateLines, pushError, type ParseOptions, type ParseResult } from "./types";

function collect(records: unknown[], opts: ParseOptions, result: ParseResult) {
  for (let i = 0; i < records.length; i++) {
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      return;
    }
    const r = normalizeEvent(records[i], opts.source, opts.now);
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, i + 1, r.error);
  }
}

/** JSON array of events, or an object `{ "events": [...] }`, or a single event object. */
export function parseJson(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "json", events: [], errors: [], records: 0, truncated: false };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    pushError(result.errors, 1, "invalid JSON");
    return result;
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)
      ? (data as { events: unknown[] }).events
      : [data];
  collect(list, opts, result);
  return result;
}

export function parseNdjson(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "ndjson", events: [], errors: [], records: 0, truncated: false };
  for (const { line, n } of iterateLines(text)) {
    if (!line.trim()) continue;
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      break;
    }
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      pushError(result.errors, n, "invalid JSON line");
      continue;
    }
    const r = normalizeEvent(obj, opts.source, opts.now);
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, n, r.error);
  }
  return result;
}
