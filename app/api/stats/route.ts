import { getStore } from "@/server/adapters/store";
import { toErrorResponse } from "@/server/security/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { ipMaskingEnabled } from "@/server/security/sanitize";
import { buildStats } from "@/server/services/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rl = await enforceRateLimit(request, RATE_LIMITS.read);
    const masking = ipMaskingEnabled();
    const stats = await buildStats(getStore(), masking);
    return Response.json({ ...stats, ip_masking: masking, scope: getStore().kind === "supabase" ? "shared-store" : "instance" }, { headers: { ...rl, "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
