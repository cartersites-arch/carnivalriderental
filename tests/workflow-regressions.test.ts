import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { briefBody, freshDb } from "./helpers";
import { handleCreateRequest, handleAcceptQuote, handleGetPublic } from "@/lib/requests/handlers";
import { addSupplierToRequest, assignments, createSupplier, createSupplierForRequest, customerQuotes, dollarsToCents, getRequestByReference, recordSupplierQuote, requestHistory, sendCustomerQuote, setNextAction, transition } from "@/lib/requests/repo";
import { toPublicRequest } from "@/lib/requests/public";

beforeEach(() => {
  vi.stubEnv("SHOW_FIXTURES", "on");
  vi.stubEnv("REQUEST_TOKEN_SECRET", "regression-secret-regression-secret-1234");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
function setup() {
  const db = freshDb(); const body = briefBody(); const response = handleCreateRequest(db, body);
  const reference = response.body.reference as string;
  const token = new URL(response.body.statusUrl as string, "http://test").searchParams.get("t")!;
  const row = getRequestByReference(db, reference)!;
  return { db, body, response, reference, token, row };
}

describe("saved submission recovery", () => {
  it("recovers an exact saved brief after midnight and catalog removal, but rejects new past events", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T23:59:00Z"));
    const db = freshDb(); const body = briefBody({ dateStart: "2026-10-15" });
    const first = handleCreateRequest(db, body); expect(first.status).toBe(201);
    vi.setSystemTime(new Date("2026-10-16T00:01:00Z")); vi.stubEnv("SHOW_FIXTURES", "off");
    const retry = handleCreateRequest(db, body);
    expect(retry.status).toBe(200); expect(retry.body.statusUrl).toBe(first.body.statusUrl);
    expect(handleCreateRequest(db, { ...body, city: "Changed city" }).status).toBe(409);
    expect(handleCreateRequest(db, { ...body, idempotencyKey: crypto.randomUUID() }).status).toBe(422);
    expect(handleCreateRequest(db, { idempotencyKey: body.idempotencyKey }).body.statusUrl).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM event_requests").get()).toEqual({ n: 1 }); db.close();
  });
  it("does not permit a new request for an unpublished ride", () => {
    const { db, body } = setup(); vi.stubEnv("SHOW_FIXTURES", "off");
    expect(handleCreateRequest(db, { ...body, idempotencyKey: crypto.randomUUID() }).status).toBe(422); db.close();
  });
});

describe("idempotent quote decisions", () => {
  it("repeats acceptance without changing timestamps, history, or later request state", () => {
    const { db, row, reference, token } = setup(); transition(db, row.id, "sourcing", "test");
    sendCustomerQuote(db, row.id, { priceCents: 10000, scope: "Scope" }, "test");
    const quoteId = toPublicRequest(db, row).quote!.id;
    expect(handleAcceptQuote(db, reference, { token, quoteId }).status).toBe(200);
    const acceptedAt = customerQuotes(db, row.id)[0].accepted_at;
    const count = requestHistory(db, row.id).length;
    expect(handleAcceptQuote(db, reference, { token, quoteId }).status).toBe(200);
    expect(customerQuotes(db, row.id)[0].accepted_at).toBe(acceptedAt);
    expect(requestHistory(db, row.id)).toHaveLength(count);
    expect(handleAcceptQuote(db, reference, { token: "wrong", quoteId }).status).toBe(404);
    expect(handleAcceptQuote(db, reference, { token, quoteId: "wrong" }).status).toBe(409);
    transition(db, row.id, "cancelled", "test");
    expect(handleAcceptQuote(db, reference, { token, quoteId }).status).toBe(200);
    expect(getRequestByReference(db, reference)!.fulfillment_status).toBe("cancelled"); db.close();
  });
});

describe("safe prices", () => {
  it.each([1e16, Infinity, -1, 0.1, true, [], {}, "1e3", "1.5"])("rejects an invalid amount without replacing a readable quote: %j", (price) => {
    const { db, row, reference, token } = setup(); transition(db, row.id, "sourcing", "test");
    sendCustomerQuote(db, row.id, { priceCents: 12345, scope: "Original" }, "test");
    expect(() => sendCustomerQuote(db, row.id, { priceCents: price, scope: "Invalid" }, "test")).toThrow();
    expect(customerQuotes(db, row.id)).toHaveLength(1);
    expect((handleGetPublic(db, reference, token).body.request as ReturnType<typeof toPublicRequest>).quote?.priceCents).toBe(12345);
    const supplier = createSupplier(db, { name: "Example" }); addSupplierToRequest(db, row.id, supplier.id, "test");
    expect(() => recordSupplierQuote(db, assignments(db, row.id)[0].id, { supplierQuoteCents: price }, "test")).toThrow(); db.close();
  });
  it("keeps the safe-integer boundary readable", () => {
    const { db, row } = setup(); transition(db, row.id, "sourcing", "test");
    sendCustomerQuote(db, row.id, { priceCents: Number.MAX_SAFE_INTEGER, scope: "Boundary" }, "test");
    expect(toPublicRequest(db, row).quote?.priceCents).toBe(Number.MAX_SAFE_INTEGER); db.close();
  });
  it.each([["1.15", 115], ["$ 1,234.50", 123450], ["0.01", 1], ["25", 2500], ["", null]] as const)("parses dollar input %s exactly", (input, expected) => {
    expect(dollarsToCents(input)).toBe(expected);
  });
  it.each(["1.001", "1e6", "1,,2", "-1", "99999999999999999", true])("rejects invalid dollar input %s", (input) => {
    expect(() => dollarsToCents(input)).toThrow();
  });
});

describe("atomic internal changes", () => {
  const failHistory = (db: ReturnType<typeof freshDb>) => db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON request_history BEGIN SELECT RAISE(ABORT, 'history failure'); END");
  it("rolls back the next action if its history fails", () => {
    const { db, row } = setup(); failHistory(db);
    expect(() => setNextAction(db, row.id, "New action", "test")).toThrow(/history failure/);
    expect(getRequestByReference(db, row.reference)!.next_action).toBe(row.next_action); db.close();
  });
  it("rolls back an existing supplier assignment if its history fails", () => {
    const { db, row } = setup(); const supplier = createSupplier(db, { name: "Example" }); failHistory(db);
    expect(() => addSupplierToRequest(db, row.id, supplier.id, "test")).toThrow(/history failure/);
    expect(assignments(db, row.id)).toHaveLength(0); db.close();
  });
  it("rolls back supplier creation as well as assignment when history fails", () => {
    const { db, row } = setup(); failHistory(db);
    expect(() => createSupplierForRequest(db, row.id, { name: "Example" }, "test")).toThrow(/history failure/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM suppliers").get()).toEqual({ n: 0 });
    expect(assignments(db, row.id)).toHaveLength(0); db.close();
  });
  it("does not leave a new supplier behind for an invalid event", () => {
    const { db } = setup();
    expect(() => createSupplierForRequest(db, "missing", { name: "Example" }, "test")).toThrow(/Request not found/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM suppliers").get()).toEqual({ n: 0 }); db.close();
  });
});
