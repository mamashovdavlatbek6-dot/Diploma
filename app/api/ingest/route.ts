import { getStore } from "@/server/adapters/store";
import { requireToken } from "@/server/security/auth";
import { toErrorResponse } from "@/server/security/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { LIMITS } from "@/server/services/limits";
import { parseRequest } from "@/server/services/parse-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  try {
    requireToken(request, "INGEST_TOKEN");
    const rl = await enforceRateLimit(request, RATE_LIMITS.ingest);
    const parsed = await parseRequest(request, { source: "api", ...LIMITS.ingest });
    const source = request.headers.get("x-aegis-source") === "agent" ? "agent" as const : "api" as const;
    const events = source === "agent" ? parsed.events.map((e) => ({ ...e, source })) : parsed.events;
    const accepted = await getStore().append(events);
    return Response.json(
      {
        format: parsed.format,
        records: parsed.records,
        accepted,
        rejected: parsed.records - accepted - (parsed.truncated ? 1 : 0),
        truncated: parsed.truncated,
        errors: parsed.errors,
      },
      { status: accepted > 0 ? 202 : 422, headers: { ...rl, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
