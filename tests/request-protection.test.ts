import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db";
import { freshDb, briefBody } from "./helpers";
import { MAX_REQUEST_BYTES, REQUESTS_PER_MINUTE, readRequestBody, takeRequestSlot } from "@/lib/requests/protection";
const source = vi.hoisted(() => ({ db: null as ReturnType<typeof import("@/lib/db")["openDb"]> | null }));
vi.mock("@/lib/db", async (original) => ({ ...await original<typeof import("@/lib/db")>(), getDb: () => source.db! }));
import { POST } from "@/app/api/requests/route";
import { POST as ACCEPT } from "@/app/api/requests/[reference]/accept-quote/route";
afterEach(() => { source.db?.close(); source.db = null; vi.unstubAllEnvs(); });
const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/api/requests", { method: "POST", body, headers });

it("accepts a bounded Unicode JSON body and rejects malformed JSON", async () => {
  expect(await readRequestBody(request(JSON.stringify({ notes: "🎡".repeat(2000) })))).toEqual({ notes: "🎡".repeat(2000) });
  await expect(readRequestBody(request("{"))).rejects.toMatchObject({ status: 400 });
});
it("enforces the actual byte limit without trusting Content-Length", async () => {
  const exact = '"' + "a".repeat(MAX_REQUEST_BYTES - 2) + '"';
  expect(await readRequestBody(request(exact))).toHaveLength(MAX_REQUEST_BYTES - 2);
  for (const headers of [{}, { "content-length": "1" }] as Record<string, string>[]) {
    await expect(readRequestBody(request(exact + " ", headers))).rejects.toMatchObject({ status: 413 });
  }
  await expect(readRequestBody(request('"' + "🎡".repeat(MAX_REQUEST_BYTES / 4) + '"'))).rejects.toMatchObject({ status: 413 });
});
it("cancels an oversized stream before reading the remainder", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1)); }, cancel() { cancelled = true; } });
  const req = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await expect(readRequestBody(req)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});
it("rejects an excessive declared length without reading", async () => {
  await expect(readRequestBody(request("{}", { "content-length": String(MAX_REQUEST_BYTES + 1) }))).rejects.toMatchObject({ status: 413 });
});
it("resets the bounded database-wide rate window after its deadline", () => {
  const db = source.db = freshDb();
  for (let i = 0; i < REQUESTS_PER_MINUTE; i++) expect(takeRequestSlot(db, 1000)).toBe(0);
  expect(takeRequestSlot(db, 1001)).toBe(60);
  expect(takeRequestSlot(db, 60_999)).toBe(1);
  expect(takeRequestSlot(db, 61_000)).toBe(0);
  expect(db.prepare("SELECT COUNT(*) AS n FROM public_request_limit").get()).toEqual({ n: 1 });
});
it("shares the budget between connections and preserves it across restarts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bac-limit-"));
  const file = path.join(dir, "test.sqlite");
  let first = openDb(file); const second = openDb(file);
  try {
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) expect(takeRequestSlot(i % 2 ? first : second, 1000)).toBe(0);
    first.close(); first = openDb(file);
    expect(takeRequestSlot(first, 1001)).toBe(60);
    expect(takeRequestSlot(second, 1001)).toBe(60);
  } finally { first.close(); second.close(); fs.rmSync(file); fs.rmdirSync(dir); }
});
it("returns HTTP errors without saving requests or trusting spoofed IP headers", async () => {
  source.db = freshDb();
  vi.stubEnv("SHOW_FIXTURES", "on");
  vi.stubEnv("REQUEST_TOKEN_SECRET", "rate-test-secret-rate-test-secret-1234");
  const oversized = await POST(request("x".repeat(MAX_REQUEST_BYTES + 1)));
  expect(oversized.status).toBe(413);
  expect((await POST(request("{"))).status).toBe(400);
  for (let i = 2; i < REQUESTS_PER_MINUTE; i++) takeRequestSlot(source.db);
  const limited = await POST(request(JSON.stringify(briefBody()), { "x-forwarded-for": "198.51.100.42" }));
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(limited.headers.get("Cache-Control")).toBe("no-store");
  expect((await POST(request("{}", { "x-forwarded-for": "198.51.100.43" }))).status).toBe(429);
  expect(source.db.prepare("SELECT COUNT(*) AS n FROM event_requests").get()).toEqual({ n: 0 });
});

it("protects quote acceptance with bounded parsing and the shared rate budget", async () => {
  source.db = freshDb();
  const ctx = { params: Promise.resolve({ reference: "BAC-ABC234" }) };
  expect((await ACCEPT(request("x".repeat(MAX_REQUEST_BYTES + 1)), ctx)).status).toBe(413);
  expect((await ACCEPT(request("{"), ctx)).status).toBe(400);
  for (let i = 2; i < REQUESTS_PER_MINUTE; i++) takeRequestSlot(source.db);
  const limited = await ACCEPT(request("{}", { "x-forwarded-for": "198.51.100.99" }), ctx);
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect((await POST(request("{}"))).status).toBe(429);
  expect(source.db.prepare("SELECT COUNT(*) AS n FROM customer_quotes").get()).toEqual({ n: 0 });
});
