import { describe, expect, it, vi } from "vitest";
import { normalizeEvent, normalizeTimestamp } from "@/server/ingest/normalize";
import { detectFormat, parseInput } from "@/server/parsers";
import { parseCicTimestamp } from "@/server/parsers/cic-csv";
import { parseClfTime } from "@/server/parsers/access-log";
import { syslogTimestamp } from "@/server/parsers/auth-log";
import { eventSchema } from "@/server/schema/event";
import { maskIp, sanitizeString } from "@/server/security/sanitize";
import { bearerToken, requireToken, safeEqual } from "@/server/security/auth";
import { readBodyCapped } from "@/server/security/body";
import { ApiError } from "@/server/security/errors";
import { checkRateLimit, clientIp } from "@/server/security/rate-limit";
import { MemoryState, UpstashState } from "@/server/adapters/state";
import { MemoryEventStore } from "@/server/adapters/store";
import { summarize } from "@/server/services/stats";
import { runDetection } from "@/server/detection";
import { POST as detectPost } from "@/app/api/detect/route";
import { POST as ingestPost } from "@/app/api/ingest/route";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const opts = { source: "file" as const, maxRows: 1000, now: NOW };

const CIC = `Flow ID, Src IP, Src Port, Dst IP, Dst Port, Protocol, Timestamp, Flow Duration, Tot Fwd Pkts, Tot Bwd Pkts, TotLen Fwd Pkts, TotLen Bwd Pkts, SYN Flag Cnt, ACK Flag Cnt, Label
a,192.168.10.5,51000,10.0.0.1,22,6,07/03/2017 08:55:58 AM,2000000,3,2,120,80,1,1,BENIGN
b,192.168.10.5,51001,10.0.0.1,80,6,2018-02-14 08:31:01,500,1,0,0,0,1,0,PortScan
c,not-an-ip,1,10.0.0.1,80,6,2018-02-14 08:31:01,500,1,0,0,0,1,0,BENIGN`;

const ZEEK = `#separator \\x09
#unset_field\t-
#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\torig_pkts\tresp_pkts
1780000000.5\tC1\t10.0.0.5\t40000\t10.0.0.9\t445\ttcp\t-\t0.5\t100\t200\tSF\t3\t2
1780000001.0\tC2\t10.0.0.5\t40001\t10.0.0.9\t3389\ttcp\t-\t-\t-\t-\tS0\t1\t0`;

const AUTH = `Oct  6 10:15:01 web1 sshd[1234]: Failed password for invalid user admin from 203.0.113.7 port 50122 ssh2
Oct  6 10:15:03 web1 sshd[1234]: Invalid user admin from 203.0.113.7 port 50122
Oct  6 10:15:09 web1 sshd[1240]: Accepted publickey for deploy from 198.51.100.4 port 40022 ssh2
Oct  6 10:15:10 web1 CRON[1]: pam_unix(cron:session): session opened`;

const ACCESS = `203.0.113.9 - - [06/Oct/2026:10:00:00 +0000] "GET /index.php?id=1%27%20OR%201=1 HTTP/1.1" 200 512 "-" "sqlmap/1.7"
198.51.100.2 - bob [06/Oct/2026:10:00:01 +0300] "POST /login HTTP/1.1" 401 0
garbage line`;

describe("schema v1 + normalizer", () => {
  it("accepts a minimal valid event and fills defaults", () => {
    const r = normalizeEvent({ ts: "2026-10-06T10:00:00Z", src_ip: "1.2.3.4" }, "api", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(eventSchema.safeParse(r.event).success).toBe(true);
      expect(r.event).toMatchObject({ v: 1, proto: "other", action: "unknown", bytes_in: 0, dst_ip: null });
    }
  });
  it("rejects missing ts, bad ip, non-object", () => {
    expect(normalizeEvent({ src_ip: "1.2.3.4" }, "api", NOW).ok).toBe(false);
    expect(normalizeEvent({ ts: NOW, src_ip: "999.1.1.1" }, "api", NOW).ok).toBe(false);
    expect(normalizeEvent("x", "api", NOW).ok).toBe(false);
    expect(normalizeEvent([1], "api", NOW).ok).toBe(false);
  });
  it("normalizes epoch s/ms, rejects future and pre-2000", () => {
    expect(normalizeTimestamp(1780000000, NOW)).toBe(new Date(1780000000000).toISOString());
    expect(normalizeTimestamp(1780000000000, NOW)).toBe(new Date(1780000000000).toISOString());
    expect(normalizeTimestamp(NOW + 3 * 86400000, NOW)).toBeNull();
    expect(normalizeTimestamp("1999-01-01T00:00:00Z", NOW)).toBeNull();
  });
  it("maps protocol numbers, clamps counters, invalid ports become null", () => {
    const r = normalizeEvent({ ts: NOW, src_ip: "::ffff:10.0.0.1", proto: 17, bytes_out: -5, packets: 1e20, dst_port: 70000 }, "api", NOW);
    expect(r.ok && r.event).toMatchObject({ src_ip: "10.0.0.1", proto: "udp", bytes_out: 0, packets: 1e12, dst_port: null });
  });
  it("strips control chars (log injection) and truncates hostile strings", () => {
    const r = normalizeEvent({ ts: NOW, src_ip: "1.1.1.1", user: "root\r\nFAKE LOG LINE\u001b[31m", http: { method: "get", path: "/" + "a".repeat(5000), user_agent: "x\u202Eevil" } }, "api", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.user).not.toMatch(/[\r\n\u001b]/);
      expect(r.event.http?.path.length).toBe(1024);
      expect(r.event.http?.method).toBe("GET");
      expect(r.event.http?.user_agent).not.toContain("\u202E");
    }
  });
  it("schema rejects unknown keys (strict)", () => {
    const r = normalizeEvent({ ts: NOW, src_ip: "1.1.1.1" }, "api", NOW);
    if (r.ok) expect(eventSchema.safeParse({ ...r.event, extra: 1 }).success).toBe(false);
  });
});

describe("parsers", () => {
  it("CIC CSV: maps columns, day-first timestamps, µs durations, flags", () => {
    const r = parseInput(CIC, "cic-csv", opts);
    expect(r.events).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ src_ip: "192.168.10.5", dst_port: 22, proto: "tcp", duration_ms: 2000, packets: 5, bytes_out: 120, bytes_in: 80, tcp_flags: "SA", ts: "2017-03-07T08:55:58.000Z" });
    expect(r.events[1]!.tcp_flags).toBe("S");
    expect(parseCicTimestamp("7/7/2017 8:55")).toBe("2017-07-07T08:55:00.000Z");
  });
  it("Zeek conn.log: unset fields, conn_state mapping", () => {
    const r = parseInput(ZEEK, "zeek-conn", opts);
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toMatchObject({ dst_port: 445, bytes_out: 100, bytes_in: 200, duration_ms: 500, action: "allow", raw_ref: "zeek:C1" });
    expect(r.events[1]).toMatchObject({ tcp_flags: "S", action: "failure", bytes_in: 0 });
  });
  it("auth.log: one event per attempt, ignores non-sshd lines", () => {
    const r = parseInput(AUTH, "auth-log", opts);
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toMatchObject({ src_ip: "203.0.113.7", action: "failure", user: "admin", dst_port: 22 });
    expect(r.events[1]).toMatchObject({ action: "success", user: "deploy" });
  });
  it("auth.log: syslog year rolls back when in the future", () => {
    expect(syslogTimestamp("Dec", "31", "23:00:00", Date.UTC(2026, 0, 2))).toBe("2025-12-31T23:00:00.000Z");
  });
  it("access log: combined + common, timezone, raw path kept, bad lines reported", () => {
    const r = parseInput(ACCESS, "access-log", opts);
    expect(r.events).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.events[0]!.http).toMatchObject({ method: "GET", status: 200, user_agent: "sqlmap/1.7", path: "/index.php?id=1%27%20OR%201=1" });
    expect(r.events[1]).toMatchObject({ user: "bob", action: "failure", ts: "2026-10-06T07:00:01.000Z" });
    expect(parseClfTime("bad")).toBeNull();
  });
  it("JSON array, wrapped object and NDJSON with a bad line", () => {
    const e = { ts: NOW, src_ip: "1.2.3.4" };
    expect(parseInput(JSON.stringify([e, e]), "json", opts).events).toHaveLength(2);
    expect(parseInput(JSON.stringify({ events: [e] }), "json", opts).events).toHaveLength(1);
    expect(parseInput("{bad", "json", opts).errors[0]!.error).toBe("invalid JSON");
    const nd = parseInput(`${JSON.stringify(e)}\nnot json\n${JSON.stringify(e)}`, "ndjson", opts);
    expect(nd.events).toHaveLength(2);
    expect(nd.errors[0]).toMatchObject({ line: 2 });
  });
  it("row cap truncates", () => {
    const lines = Array.from({ length: 10 }, () => JSON.stringify({ ts: NOW, src_ip: "1.2.3.4" })).join("\n");
    const r = parseInput(lines, "ndjson", { ...opts, maxRows: 3 });
    expect(r.events).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });
  it("format sniffing", () => {
    expect(detectFormat(CIC)).toBe("cic-csv");
    expect(detectFormat(ZEEK)).toBe("zeek-conn");
    expect(detectFormat(AUTH)).toBe("auth-log");
    expect(detectFormat(ACCESS)).toBe("access-log");
    expect(detectFormat("[]")).toBe("json");
    expect(detectFormat('{"a":1}\n{"a":2}')).toBe("ndjson");
    expect(detectFormat("hello world")).toBeNull();
  });
});

describe("security", () => {
  it("safeEqual and bearer parsing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(bearerToken("Bearer xyz")).toBe("xyz");
    expect(bearerToken("Basic xyz")).toBeNull();
  });
  it("requireToken: 503 when unset, 401 when wrong, passes when right", () => {
    const req = (h?: string) => new Request("http://x/api", { headers: h ? { authorization: h } : {} });
    vi.stubEnv("INGEST_TOKEN", "");
    expect(() => requireToken(req("Bearer x"), "INGEST_TOKEN")).toThrow(expect.objectContaining({ status: 503 }));
    vi.stubEnv("INGEST_TOKEN", "s3cret-token-0123456789");
    expect(() => requireToken(req("Bearer wrong-token-0123456789"), "INGEST_TOKEN")).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => requireToken(req("Bearer s3cret-token-0123456789"), "INGEST_TOKEN")).not.toThrow();
    vi.unstubAllEnvs();
  });
  it("body cap rejects by content-length and by streamed size", async () => {
    await expect(readBodyCapped(new Request("http://x", { method: "POST", body: "x".repeat(20), headers: { "content-length": "20" } }), 10)).rejects.toBeInstanceOf(ApiError);
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8)); c.enqueue(new Uint8Array(8)); c.close(); } });
    await expect(readBodyCapped(new Request("http://x", { method: "POST", body: stream, duplex: "half" } as RequestInit), 10)).rejects.toMatchObject({ status: 413 });
    expect(await readBodyCapped(new Request("http://x", { method: "POST", body: "ok" }), 10)).toBe("ok");
  });
  it("sanitize + IP masking", () => {
    expect(sanitizeString("a\nb\u0000c", 10)).toBe("a b c");
    expect(sanitizeString("я".repeat(5), 3)).toBe("яяя");
    expect(maskIp("203.0.113.77")).toBe("203.0.113.0");
    expect(maskIp("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1::");
  });
  it("rate limiter blocks after limit and reports remaining", async () => {
    const state = new MemoryState();
    const rule = { name: "t", limit: 2, windowSeconds: 60 };
    expect((await checkRateLimit("1.1.1.1", rule, state)).remaining).toBe(1);
    expect((await checkRateLimit("1.1.1.1", rule, state)).allowed).toBe(true);
    expect((await checkRateLimit("1.1.1.1", rule, state)).allowed).toBe(false);
    expect((await checkRateLimit("2.2.2.2", rule, state)).allowed).toBe(true);
  });
  it("clientIp ignores spoofed garbage", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "<script>" } }))).toBe("unknown");
  });
});

describe("adapters", () => {
  it("memory state expires keys", async () => {
    let t = 0;
    const s = new MemoryState(() => t);
    await s.setJson("k", { a: 1 }, 1);
    expect(await s.getJson("k")).toEqual({ a: 1 });
    t = 2000;
    expect(await s.getJson("k")).toBeNull();
  });
  it("upstash state sends a pipeline and parses results", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ result: 3 }, { result: 1 }, { result: 59000 }]));
    const s = new UpstashState("https://redis.example", "tok", fetchMock as unknown as typeof fetch);
    expect(await s.incr("k", 60)).toEqual({ count: 3, ttlMs: 59000 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://redis.example/pipeline");
    expect(JSON.parse(String(init.body))[0]).toEqual(["INCR", "k"]);
  });
  it("ring buffer caps size, returns newest first, persists to tmp", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "aegis-")), "s.json");
    const store = new MemoryEventStore(3, path);
    const evs = [1, 2, 3, 4, 5].map((i) => {
      const r = normalizeEvent({ ts: NOW - i * 1000, src_ip: `10.0.0.${i}` }, "api", NOW);
      if (!r.ok) throw new Error(r.error);
      return r.event;
    });
    await store.append(evs);
    expect(await store.size()).toBe(3);
    expect((await store.recent(10)).map((e) => e.src_ip)).toEqual(["10.0.0.5", "10.0.0.4", "10.0.0.3"]);
    store.flushNow();
    const reloaded = new MemoryEventStore(3, path);
    expect(await reloaded.size()).toBe(3);
    expect((await reloaded.counters()).totalIngested).toBe(5);
  });
});

describe("services and APIs", () => {
  it("stats summarize with masking", () => {
    const r = normalizeEvent({ ts: NOW, src_ip: "8.8.8.8", dst_port: 53, proto: "udp" }, "api", NOW);
    if (!r.ok) throw new Error();
    const s = summarize([r.event, r.event], true);
    expect(s.top_src_ips[0]).toEqual({ ip: "8.8.8.0", count: 2 });
    expect(s.top_dst_ports[0]).toEqual({ port: 53, count: 2 });
  });
  it("detection reports not-implemented honestly (phase 3)", () => {
    expect(runDetection([])).toEqual({ alerts: [], engine: { status: "not_implemented", detectors: 0, available_from_phase: 3 } });
  });
  it("POST /api/detect normalizes an auth.log batch and returns zero alerts", async () => {
    const res = await detectPost(new Request("http://x/api/detect", { method: "POST", body: AUTH, headers: { "content-type": "text/plain", "x-real-ip": "7.7.7.7" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ format: "auth-log", normalized: 2, alerts: [], engine: { status: "not_implemented" } });
  });
  it("POST /api/detect rejects unsupported media and unknown format", async () => {
    const r1 = await detectPost(new Request("http://x/api/detect", { method: "POST", body: "x", headers: { "content-type": "image/png" } }));
    expect(r1.status).toBe(415);
    const r2 = await detectPost(new Request("http://x/api/detect?format=exe", { method: "POST", body: "x" }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error.code).toBe("bad_request");
  });
  it("POST /api/ingest requires the token", async () => {
    vi.stubEnv("INGEST_TOKEN", "s3cret-token-0123456789");
    const body = JSON.stringify([{ ts: Date.now(), src_ip: "1.2.3.4" }]);
    const bad = await ingestPost(new Request("http://x/api/ingest", { method: "POST", body, headers: { "content-type": "application/json" } }));
    expect(bad.status).toBe(401);
    const ok = await ingestPost(new Request("http://x/api/ingest", { method: "POST", body, headers: { "content-type": "application/json", authorization: "Bearer s3cret-token-0123456789" } }));
    expect(ok.status).toBe(202);
    expect(await ok.json()).toMatchObject({ accepted: 1, rejected: 0 });
    vi.unstubAllEnvs();
  });
});
