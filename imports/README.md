# Private import working files

Company, listing and photo mappings, source workbooks, ledgers, claim records and exception
reports belong in private storage. All generated data beneath `imports/` is ignored by Git,
including Test marketplace outputs. Only this guide is versioned.

Keep existing private working files when updating a checkout. A fresh clone intentionally lacks
them: restore a trusted private backup before running import, claim, anonymisation or migration
operations. Do not create empty replacement mappings or run imports to reconstruct them blindly.
Follow `docs/COMPANY_IMPORT.md` and the relevant import runbook for reconciliation and deduplication.
The application build and its fixture-based tests do not need these private working files.

Run `npm run privacy:check` before pushing. CI checks that import working files and identifying
fields in public exports have not been committed. Public Test-to-Live listing redirects remain
in `src/lib/inventory/test-to-live.json`; that file contains only opaque listing IDs.

## Existing exposure

The cleanup removes identifying artifacts from the current branch only. Old commits, other
branches, the public upstream repository and existing clones may retain them. This is containment,
not a complete removal of public operator identity. Coordinated upstream cleanup and a decision
about history removal or a separate private repository are still required. Do not rewrite history
or remove branches without a separate, explicit decision.
