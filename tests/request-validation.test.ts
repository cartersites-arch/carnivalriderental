import { describe, expect, it } from "vitest";
import { validateEventRequest } from "@/lib/requests/input";
import { briefBody } from "./helpers";

const validate = (overrides: Record<string, unknown> = {}, today = "2030-01-01") =>
  validateEventRequest(briefBody({ dateStart: "2032-03-01", ...overrides }), { today, rideExists: () => true });

describe("event dates and states", () => {
  it.each(["2030-99-99", "2030-02-29", "2032-02-30", "2032-04-31", "2100-02-29", "0000-01-01", "2032-03-01extra", "2032-03-01T12:00:00Z", 20320301])("rejects invalid start date %s", (dateStart) => {
    expect(validate({ dateStart })).toMatchObject({ ok: false, errors: { dateStart: expect.any(String) } });
  });

  it.each(["2032-99-99", "2033-02-29", "2032-04-31", "2032-03-02extra", "2032-03-02T12:00:00Z", 20320302, {}])("rejects invalid end date %s", (dateEnd) => {
    expect(validate({ dateEnd })).toMatchObject({ ok: false, errors: { dateEnd: expect.any(String) } });
  });

  it.each(["ZZ", "TXextra", "Texas", "T", "T X", "", 123, {}])("rejects invalid state %s without truncating it", (state) => {
    expect(validate({ state })).toMatchObject({ ok: false, errors: { state: expect.any(String) } });
  });

  it.each(["tx", " TX ", "dc", "AK", "WY"])("accepts and normalizes supported code %s", (state) => {
    expect(validate({ state })).toMatchObject({ ok: true, value: { state: state.trim().toUpperCase() } });
  });

  it.each(["2032-02-29", "2400-02-29"])("accepts valid leap day %s", (dateStart) => {
    expect(validate({ dateStart, dateEnd: dateStart })).toMatchObject({ ok: true });
  });

  it("accepts today but rejects yesterday", () => {
    expect(validate({}, "2032-03-01")).toMatchObject({ ok: true });
    expect(validate({ dateStart: "2032-02-29" }, "2032-03-01")).toMatchObject({ ok: false, errors: { dateStart: expect.any(String) } });
  });

  it("rejects a real end date before the start", () => {
    expect(validate({ dateEnd: "2032-02-29" })).toMatchObject({ ok: false, errors: { dateEnd: expect.any(String) } });
  });

  it.each([undefined, null, "", "  "])("allows an omitted optional end date: %s", (dateEnd) => {
    expect(validate({ dateEnd })).toMatchObject({ ok: true, value: { dateEnd: null } });
  });
});
