/**
 * Sliding-window / counter state. In-memory per instance by default; Upstash
 * Redis REST when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 */
export interface StateAdapter {
  readonly kind: "memory" | "upstash";
  /** Atomically increments `key`, setting a TTL on first increment. */
  incr(key: string, ttlSeconds: number): Promise<{ count: number; ttlMs: number }>;
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryState implements StateAdapter {
  readonly kind = "memory" as const;
  private map = new Map<string, { value: string; expires: number }>();
  constructor(private readonly clock: () => number = Date.now, private readonly maxKeys = 50_000) {}

  private live(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expires <= this.clock()) {
      this.map.delete(key);
      return null;
    }
    return e;
  }

  private evict() {
    if (this.map.size < this.maxKeys) return;
    const now = this.clock();
    for (const [k, e] of this.map) if (e.expires <= now) this.map.delete(k);
    while (this.map.size >= this.maxKeys) {
      const first = this.map.keys().next().value;
      if (first === undefined) break;
      this.map.delete(first);
    }
  }

  async incr(key: string, ttlSeconds: number) {
    const e = this.live(key);
    if (e) {
      e.value = String(Number(e.value) + 1);
      return { count: Number(e.value), ttlMs: e.expires - this.clock() };
    }
    this.evict();
    const expires = this.clock() + ttlSeconds * 1000;
    this.map.set(key, { value: "1", expires });
    return { count: 1, ttlMs: ttlSeconds * 1000 };
  }

  async getJson<T>(key: string): Promise<T | null> {
    const e = this.live(key);
    return e ? (JSON.parse(e.value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    this.evict();
    this.map.set(key, { value: JSON.stringify(value), expires: this.clock() + ttlSeconds * 1000 });
  }
}

type Fetch = typeof fetch;

export class UpstashState implements StateAdapter {
  readonly kind = "upstash" as const;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await this.fetchImpl(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`upstash status ${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: string }[];
    return data.map((d) => {
      if (d.error) throw new Error("upstash command error");
      return d.result;
    });
  }

  async incr(key: string, ttlSeconds: number) {
    const [count, , pttl] = await this.pipeline([
      ["INCR", key],
      ["EXPIRE", key, ttlSeconds, "NX"],
      ["PTTL", key],
    ]);
    return { count: Number(count), ttlMs: Math.max(0, Number(pttl)) };
  }

  async getJson<T>(key: string): Promise<T | null> {
    const [v] = await this.pipeline([["GET", key]]);
    return typeof v === "string" ? (JSON.parse(v) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.pipeline([["SET", key, JSON.stringify(value), "EX", ttlSeconds]]);
  }
}

const g = globalThis as unknown as { __aegisState?: StateAdapter };

export function getState(): StateAdapter {
  if (!g.__aegisState) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    g.__aegisState = url && token ? new UpstashState(url, token) : new MemoryState();
  }
  return g.__aegisState;
}
