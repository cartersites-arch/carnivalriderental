import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCalendarDate } from "@/lib/calendar";
import { eventRequestInput } from "@/lib/access/service";
import * as database from "@/lib/requests/db";
import { handleCreateRequest } from "@/lib/requests/http";
import { internalActionSchema, runInternalAction } from "@/lib/requests/internal-actions";
import { dollarsToCents } from "@/lib/requests/money";
import { MAX_REQUEST_BYTES, protectedRequestRoute, readRequestBody, takeRequestSlot } from "@/lib/requests/protection";
import { createRequestSchema } from "@/lib/requests/schema";
import { memoryService, seedToCommitted, validBody } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("current-site calendar validation", () => {
  it.each(["2040-02-30", "2040-04-31", "2100-02-29", "0000-01-01", "2040-13-01", "2040-00-01", "2040-01-00", "2040-2-01"])("rejects %s in both request systems", date => {
    expect(isCalendarDate(date)).toBe(false);
    expect(createRequestSchema.safeParse(validBody({ eventDateStart: date })).success).toBe(false);
    expect(eventRequestInput.safeParse({ email: "test@example.com", eventDate: date, city: "Austin", state: "TX" }).success).toBe(false);
  });
  it.each(["2040-02-29", "2400-02-29", "2040-04-30"])("accepts real calendar date %s", date => {
    expect(isCalendarDate(date)).toBe(true);
    expect(eventRequestInput.safeParse({ email: "test@example.com", eventDate: date, city: "Austin", state: "TX" }).success).toBe(true);
  });
  it("validates end dates and US states without truncating input", () => {
    const { svc } = memoryService();
    for (const state of ["ZZ", "TXX", "Texas"]) expect(handleCreateRequest(validBody({ state }), svc).status).toBe(400);
    expect(handleCreateRequest(validBody({ state: " dc " }), svc).status).toBe(201);
    expect(handleCreateRequest(validBody({ eventDateStart: "2040-01-01", eventDateEnd: "2040-02-30" }), svc).status).toBe(400);
    expect(handleCreateRequest(validBody({ eventDateStart: "2040-01-02", eventDateEnd: "2040-01-01" }), svc).status).toBe(400);
  });
  it.each([false, true, [], [3], {}, "1e3", "0x10", "2.5"])("does not coerce malformed Event Access counts: %j", attendance => {
    expect(eventRequestInput.safeParse({ email: "test@example.com", eventDate: "2040-01-01", city: "Austin", state: "TX", attendance }).success).toBe(false);
  });
});

describe("saved decisions and submission recovery", () => {
  it("recovers only an identical saved brief after the event date passes", () => {
    const { svc } = memoryService();
    const body = validBody({ eventDateStart: "2040-02-29" });
    const first = handleCreateRequest(body, svc, new Date("2040-02-28T23:59:59Z"));
    const retry = handleCreateRequest(body, svc, new Date("2040-03-01T00:00:00Z"));
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.statusUrl).toBe(first.body.statusUrl);
    expect(handleCreateRequest({ ...body, brief: { ...body.brief, city: "Denver" } }, svc, new Date("2040-03-01")).status).toBe(409);
    expect(handleCreateRequest(validBody({ eventDateStart: "2040-02-29" }), svc, new Date("2040-03-01")).status).toBe(400);
    expect(svc.listRequests()).toHaveLength(1);
  });
  it("does not persist a new request when status-link signing is misconfigured", () => {
    const { svc } = memoryService();
    const secret = process.env.REQUEST_TOKEN_SECRET;
    try {
      delete process.env.REQUEST_TOKEN_SECRET;
      expect(handleCreateRequest(validBody(), svc).status).toBe(500);
      expect(svc.listRequests()).toHaveLength(0);
    } finally { process.env.REQUEST_TOKEN_SECRET = secret; }
  });
  it("replays accepted quotes without changing fulfilment, history or payment", () => {
    const { svc } = memoryService();
    const { request, quote } = seedToCommitted(svc);
    svc.recordDemoPayment(request.id, "payment_captured", null);
    svc.confirmBooking(request.id);
    const before = svc.getRequest(request.id);
    const events = svc.listEvents(request.id);
    expect(svc.acceptQuote(request.id, quote.id)).toEqual(before);
    expect(svc.listEvents(request.id)).toEqual(events);
    const other = svc.createRequest(validBody()).request;
    expect(() => svc.acceptQuote(other.id, quote.id)).toThrow(/not found/);
  });
  it("scopes candidate actions to the selected request", () => {
    const { svc } = memoryService();
    const { cand, request } = seedToCommitted(svc);
    const other = svc.createRequest(validBody()).request;
    expect(() => runInternalAction(svc, other.id, { action: "set_candidate_stage", candidateId: cand.id, stage: "declined" })).toThrow(/does not belong/);
    expect(svc.listCandidates(request.id)[0].stage).toBe("committed");
  });
});

describe("safe quote amounts", () => {
  it("parses decimal dollars exactly and keeps unknown distinct from zero", () => {
    expect(dollarsToCents(" ")).toBeNull();
    expect(dollarsToCents("0")).toBe(0);
    expect(dollarsToCents("0.29")).toBe(29);
    expect(dollarsToCents("1.01")).toBe(101);
    expect(dollarsToCents("12000.50")).toBe(1200050);
  });
  it.each(["NaN", "Infinity", "1e3", "0x10", "-1", "1.001", "9007199254740992"])("rejects invalid dollars %s", value => expect(() => dollarsToCents(value)).toThrow());
  it("rejects unsafe cents at both the HTTP and service boundary", () => {
    const { svc } = memoryService();
    const request = svc.createRequest(validBody()).request;
    for (const amountCents of [true, [], Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(internalActionSchema.safeParse({ action: "create_quote", amountCents, scope: "scope" }).success).toBe(false);
      expect(() => svc.createQuoteDraft(request.id, amountCents as number, "scope")).toThrow();
    }
  });
});

describe("legacy public API protection", () => {
  it("bounds bytes even without a truthful Content-Length, including UTF-8", async () => {
    for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
      const req = new Request("https://example.com", { method: "POST", headers, body: JSON.stringify({ note: "é".repeat(MAX_REQUEST_BYTES) }) });
      await expect(readRequestBody(req)).rejects.toMatchObject({ status: 413 });
    }
    await expect(readRequestBody(new Request("https://example.com", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400 });
    await expect(readRequestBody(new Request("https://example.com", { method: "POST", body: "{}" }))).resolves.toEqual({});
  });
  it("shares the rate budget across database connections and resets after a minute", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "current-limit-"));
    const one = database.openDb(path.join(dir, "limit.sqlite"));
    const two = database.openDb(path.join(dir, "limit.sqlite"));
    try {
      for (let i = 0; i < 60; i++) expect(takeRequestSlot(i % 2 ? one : two, 1000)).toBe(0);
      expect(takeRequestSlot(two, 1000)).toBe(60);
      expect(takeRequestSlot(one, 61000)).toBe(0);
    } finally { one.close(); two.close(); fs.unlinkSync(path.join(dir, "limit.sqlite")); fs.rmdirSync(dir); }
  });
  it("returns no-store and Retry-After on the actual route wrapper without running a mutation", async () => {
    const { db } = memoryService();
    vi.spyOn(database, "getDb").mockReturnValue(db);
    const mutation = vi.fn(() => ({ status: 201, body: { ok: true } }));
    const route = protectedRequestRoute(mutation);
    const invalid = await route(new Request("https://example.com", { method: "POST", body: "{" }));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    const oversized = await route(new Request("https://example.com", { method: "POST", body: "x".repeat(MAX_REQUEST_BYTES + 1) }));
    expect(oversized.status).toBe(413);
    expect(mutation).not.toHaveBeenCalled();
    for (let i = 0; i < 58; i++) takeRequestSlot(db);
    const response = await route(new Request("https://example.com", { method: "POST", headers: { "x-forwarded-for": "new-ip" }, body: "{}" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mutation).not.toHaveBeenCalled();
  });
});
