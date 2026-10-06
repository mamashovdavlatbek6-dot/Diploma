import { getState } from "@/server/adapters/state";
import { getStore } from "@/server/adapters/store";
import { SCHEMA_VERSION } from "@/server/schema/event";
import { runDetection } from "@/server/detection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  const store = getStore();
  return Response.json(
    {
      status: "ok",
      time: new Date().toISOString(),
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      schema_version: SCHEMA_VERSION,
      adapters: { store: store.kind, store_capacity: store.capacity, state: getState().kind },
      auth: {
        ingest: (process.env.INGEST_TOKEN?.length ?? 0) >= 16 ? "configured" : "disabled",
        admin: (process.env.ADMIN_TOKEN?.length ?? 0) >= 16 ? "configured" : "disabled",
      },
      detection: runDetection([]).engine,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
