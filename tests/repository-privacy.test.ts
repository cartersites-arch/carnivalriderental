import { describe, expect, it } from "vitest";
import { privateArtifacts } from "../scripts/check-repository-privacy";

describe("repository privacy gate", () => {
  it("rejects Test and Live mappings, ledgers and source files regardless of content", () => {
    const files = ["imports/company-accounts/carnivalrental-test/mapping.json", "imports/photos/carnivalrental/ledger.jsonl", "imports/listings/held-for-review.json", "imports/company-accounts/source/source.xlsx"];
    expect(privateArtifacts(files, () => "{}")).toEqual(files);
  });
  it("rejects identity joins moved into reports or public inventory", () => {
    const data: Record<string, string> = {
      "reports/operator-export.json": '{"companyId":"fixture-company"}',
      "src/lib/inventory/accidental-export.json": '{"externalId":"fixture-company--ride"}',
      "src/lib/inventory/test-to-live.json": '{"map":{"test-id":"live-id"}}',
    };
    expect(privateArtifacts(Object.keys(data), (file) => data[file])).toEqual(Object.keys(data).slice(0, 2));
  });
  it("allows instructions and fictional test fixtures", () => {
    expect(privateArtifacts(["imports/README.md", "tests/fixtures/company.json"], () => '{"companyId":"fixture"}')).toEqual([]);
  });
});
