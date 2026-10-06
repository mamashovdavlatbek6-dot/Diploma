import type { NormalizedEvent } from "@/server/schema/event";

/**
 * Detection entry point. Detectors are implemented in phase 3; until then this
 * honestly returns no alerts and reports the engine status. No fake detections.
 */
export interface DetectionOutput {
  alerts: never[];
  engine: { status: "not_implemented"; detectors: 0; available_from_phase: 3 };
}

export function runDetection(events: readonly NormalizedEvent[]): DetectionOutput {
  void events;
  return { alerts: [], engine: { status: "not_implemented", detectors: 0, available_from_phase: 3 } };
}
