import { z } from "zod";
import { detectFormat, inputFormats, parseInput, type InputFormat, type ParseResult } from "@/server/parsers";
import type { EventSource } from "@/server/schema/event";
import { readBodyCapped } from "@/server/security/body";
import { ApiError } from "@/server/security/errors";
import { requireSameOrigin } from "@/server/security/origin";

const formatParam = z.enum(inputFormats).optional();

const MEDIA_FORMATS: Record<string, InputFormat | "sniff"> = {
  "application/json": "json",
  "application/x-ndjson": "ndjson",
  "application/ndjson": "ndjson",
  "text/csv": "cic-csv",
  "text/plain": "sniff",
  "": "sniff",
};

/**
 * Shared request handling for ingest/detect: capped body read, format
 * resolution (?format= > Content-Type > content sniffing) and parsing.
 */
export async function parseRequest(
  request: Request,
  opts: { source: EventSource; maxBytes: number; maxRows: number },
): Promise<ParseResult> {
  requireSameOrigin(request);
  const url = new URL(request.url);
  const fmt = formatParam.safeParse(url.searchParams.get("format") ?? undefined);
  if (!fmt.success) throw new ApiError(400, "bad_request", `format must be one of: ${inputFormats.join(", ")}`);

  const media = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const mapped = MEDIA_FORMATS[media];
  if (!fmt.data && mapped === undefined) {
    throw new ApiError(415, "unsupported_media_type", "Use application/json, application/x-ndjson, text/csv or text/plain");
  }

  const text = await readBodyCapped(request, opts.maxBytes);
  if (!text.trim()) throw new ApiError(400, "bad_request", "Empty body");

  let format: InputFormat | null = fmt.data ?? (mapped && mapped !== "sniff" ? mapped : null);
  if (format === "json" && !text.trimStart().startsWith("[") && detectFormat(text) === "ndjson") format = "ndjson";
  format ??= detectFormat(text);
  if (!format) throw new ApiError(422, "unprocessable", "Unrecognized input format; pass ?format=");

  return parseInput(text, format, { source: opts.source, maxRows: opts.maxRows });
}
