import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eventSchema, type NormalizedEvent } from "@/server/schema/event";

/**
 * Event store. Default: capped in-memory ring buffer per instance with a
 * best-effort JSON snapshot in the OS temp dir (/tmp on Vercel), so warm
 * restarts keep recent data. The interface is what a Postgres adapter
 * (Neon/Supabase/Drizzle) implements later.
 */
export interface EventStore {
  readonly kind: string;
  readonly capacity: number;
  append(events: NormalizedEvent[]): Promise<number>;
  recent(limit: number): Promise<NormalizedEvent[]>;
  size(): Promise<number>;
  counters(): Promise<StoreCounters>;
}

export interface StoreCounters {
  totalIngested: number;
  bySource: Record<string, number>;
}

interface Snapshot {
  v: 1;
  events: NormalizedEvent[];
  counters: StoreCounters;
}

export class MemoryEventStore implements EventStore {
  readonly kind: string;
  private buf: (NormalizedEvent | undefined)[];
  private head = 0;
  private count = 0;
  private stats: StoreCounters = { totalIngested: 0, bySource: {} };
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly capacity: number, private readonly persistPath: string | null = null) {
    this.kind = persistPath ? "memory+tmp" : "memory";
    this.buf = new Array(capacity);
    if (persistPath) this.load();
  }

  private load() {
    try {
      const snap = JSON.parse(readFileSync(this.persistPath!, "utf8")) as Snapshot;
      if (snap?.v !== 1 || !Array.isArray(snap.events)) return;
      const valid = snap.events.filter((e) => eventSchema.safeParse(e).success);
      this.push(valid);
      if (snap.counters && typeof snap.counters.totalIngested === "number") this.stats = snap.counters;
    } catch {
      // No snapshot yet or unreadable: start empty.
    }
  }

  private scheduleFlush() {
    if (!this.persistPath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 500);
    this.flushTimer.unref?.();
  }

  flushNow() {
    if (!this.persistPath) return;
    try {
      const tmp = `${this.persistPath}.tmp`;
      const snap: Snapshot = { v: 1, events: this.ordered(), counters: this.stats };
      writeFileSync(tmp, JSON.stringify(snap));
      renameSync(tmp, this.persistPath);
    } catch {
      // Persistence is best-effort; memory remains authoritative.
    }
  }

  private push(events: NormalizedEvent[]) {
    for (const e of events) {
      this.buf[this.head] = e;
      this.head = (this.head + 1) % this.capacity;
      if (this.count < this.capacity) this.count++;
    }
  }

  /** Oldest -> newest. */
  private ordered(): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) out.push(this.buf[(start + i) % this.capacity]!);
    return out;
  }

  async append(events: NormalizedEvent[]) {
    this.push(events);
    this.stats.totalIngested += events.length;
    for (const e of events) this.stats.bySource[e.source] = (this.stats.bySource[e.source] ?? 0) + 1;
    this.flushNow();
    return events.length;
  }

  async recent(limit: number) {
    const all = this.ordered();
    return all.slice(Math.max(0, all.length - limit)).reverse();
  }

  async size() {
    return this.count;
  }

  async counters() {
    return { totalIngested: this.stats.totalIngested, bySource: { ...this.stats.bySource } };
  }
}

const g = globalThis as unknown as { __aegisStore?: EventStore };

export function getStore(): EventStore {
  if (!g.__aegisStore) {
    const capacity = Math.min(Math.max(Number(process.env.STORE_CAPACITY) || 5000, 100), 50_000);
    const persist = process.env.STORE_PERSIST === "false" ? null : join(tmpdir(), "aegis-store-v1.json");
    g.__aegisStore = new MemoryEventStore(capacity, persist);
  }
  return g.__aegisStore;
}
