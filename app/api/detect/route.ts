import { pipeline, publicData } from "@/server/services/pipeline";
import { toErrorResponse } from "@/server/security/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { LIMITS } from "@/server/services/limits";
import { parseRequest } from "@/server/services/parse-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Stateless: normalizes a batch and runs detection. Nothing is stored. */
export async function POST(request: Request) {
  try {
    const rl = await enforceRateLimit(request, RATE_LIMITS.detect);
    const parsed = await parseRequest(request, { source: "api", ...LIMITS.detect });
    const detection = pipeline(parsed.events);
    return Response.json(
      {
        format: parsed.format,
        records: parsed.records,
        normalized: parsed.events.length,
        truncated: parsed.truncated,
        errors: parsed.errors,
        alerts: publicData(detection.alerts),
        incidents: publicData(detection.incidents),
        source: "api",
        simulation: false,
        engine: detection.engine,
        note: "Detection is probabilistic; false positives and false negatives are possible.",
      },
      { headers: { ...rl, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
