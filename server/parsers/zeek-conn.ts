import { normalizeEvent } from "@/server/ingest/normalize";
import { iterateLines, pushError, type ParseOptions, type ParseResult } from "./types";

/** Zeek conn_state -> coarse TCP flag summary and action. */
const CONN_STATE: Record<string, { flags: string; action: string }> = {
  S0: { flags: "S", action: "failure" },
  REJ: { flags: "SR", action: "deny" },
  RSTOS0: { flags: "SR", action: "failure" },
  RSTRH: { flags: "SAR", action: "failure" },
  SH: { flags: "SF", action: "failure" },
  S1: { flags: "SA", action: "allow" },
  SF: { flags: "SAF", action: "allow" },
  RSTO: { flags: "SAR", action: "allow" },
  RSTR: { flags: "SAR", action: "allow" },
  OTH: { flags: "", action: "unknown" },
};

export function looksLikeZeek(firstLine: string): boolean {
  return firstLine.startsWith("#separator") || firstLine.startsWith("#fields");
}

export function parseZeekConn(text: string, opts: ParseOptions): ParseResult {
  const result: ParseResult = { format: "zeek-conn", events: [], errors: [], records: 0, truncated: false };
  let fields: string[] | null = null;
  let sep = "\t";
  let unset = "-";

  for (const { line, n } of iterateLines(text)) {
    if (!line) continue;
    if (line.startsWith("#")) {
      if (line.startsWith("#separator")) {
        const v = line.slice("#separator".length).trim();
        sep = v.replace(/\\x([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))) || "\t";
      } else if (line.startsWith("#unset_field")) {
        unset = line.split(sep)[1] ?? "-";
      } else if (line.startsWith("#fields")) {
        fields = line.split(sep).slice(1);
      }
      continue;
    }
    if (!fields) {
      pushError(result.errors, n, "missing #fields header");
      return result;
    }
    result.records++;
    if (result.records > opts.maxRows) {
      result.truncated = true;
      break;
    }
    const cells = line.split(sep);
    const row: Record<string, string | undefined> = {};
    fields.forEach((f, i) => {
      const v = cells[i];
      row[f] = v === unset || v === "(empty)" ? undefined : v;
    });
    const state = CONN_STATE[row.conn_state ?? ""] ?? { flags: "", action: "unknown" };
    const duration = Number(row.duration ?? 0);
    const r = normalizeEvent(
      {
        ts: row.ts,
        src_ip: row["id.orig_h"],
        src_port: row["id.orig_p"],
        dst_ip: row["id.resp_h"],
        dst_port: row["id.resp_p"],
        proto: row.proto,
        duration_ms: Number.isFinite(duration) ? duration * 1000 : 0,
        bytes_out: row.orig_bytes,
        bytes_in: row.resp_bytes,
        packets: Number(row.orig_pkts ?? 0) + Number(row.resp_pkts ?? 0),
        tcp_flags: row.proto === "tcp" ? state.flags : undefined,
        action: state.action,
        raw_ref: row.uid ? `zeek:${row.uid}` : `line:${n}`,
      },
      opts.source,
      opts.now,
    );
    if (r.ok) result.events.push(r.event);
    else pushError(result.errors, n, r.error);
  }
  return result;
}
