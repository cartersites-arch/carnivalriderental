import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** Inspect tracked exports, not private ignored working files or fictional test fixtures. */
export function privateArtifacts(files: string[], read: (file: string) => string): string[] {
  const identityKey = /"(?:companyId|companyName|companySlug|externalId|importExternalId|contactName|contactEmail|phoneNumber|website)"\s*:/;
  return files.filter((file) => {
    if (file.startsWith("imports/") && file !== "imports/README.md") return true;
    if (/^(?:reports|src\/lib\/inventory)\/.*\.(?:json|jsonl)$/.test(file)) return identityKey.test(read(file));
    return false;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const unsafe = privateArtifacts(files, (file) => fs.readFileSync(file, "utf8"));
  if (unsafe.length) {
    console.error(`Private operator artifacts must not be tracked:\n${unsafe.join("\n")}`);
    process.exitCode = 1;
  } else console.log("OK: no tracked import working files or identifying export fields.");
}
