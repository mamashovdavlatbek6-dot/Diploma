import { runDetection } from "@/server/detection";
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
    const detection = runDetection(parsed.events);
    return Response.json(
      {
        format: parsed.format,
        records: parsed.records,
        normalized: parsed.events.length,
        truncated: parsed.truncated,
        errors: parsed.errors,
        alerts: detection.alerts,
        engine: detection.engine,
        note: "Detectors ship in phase 3; zero alerts here means detection is not yet implemented, not that traffic is clean.",
      },
      { headers: { ...rl, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
