# Current-site fixes: preserve the existing website

This change is based on the sanitized fork main at 15f5a8ec39e1d1e4ca0a21c871a20898be68dbc2, whose public website code matches Derek's main at efe22d7a78dc09966004c30641b7c2839b117cf4. It does not use the restored older prototype as its base.

## Scope

- Preserve Carnival Ride Rental branding, public pages, navigation, photos, styles, and the direct-operator Event Access business model. No public page, public component, pricing configuration, or image asset is changed.
- Validate real calendar dates in Event Access and the legacy request API. Validate actual US states in legacy requests. Reject booleans, arrays and non-decimal strings as optional attendance/budget counts.
- Parse internal dollar inputs exactly; reject invalid or unsafe cents at server boundaries. Show validation errors and preserve quote scope and entered prices for correction.
- Recover exact saved submissions after their event date passes, without disclosing another request through a reused key. Check status-link signing configuration before creating a record.
- Make quote acceptance repeatable without rewinding fulfilment or duplicating history. Scope candidate-stage actions to the selected request.
- Protect both legacy public request mutation routes with streaming 32 KiB body limits and a shared database budget of 60 attempts per minute. Responses are non-cacheable; rate limits include Retry-After. This is a per-database budget, not a distributed global rate limiter across separate SQLite files.
- Update Next to 15.5.28, Vitest to the patched 4.1 line, and Next's PostCSS to the patched 8.5 line. Keep the existing Tailwind 4 setup.

The old prototype's public request form/draft recovery and operator-management actions are not present in this version; their replacement pages are not imported into this change. Existing transactional service methods remain in place.

## Validation

On Node 24.19.0:

- TypeScript checks: passed.
- Production build: passed (208 generated pages).
- Unit tests: 396 passed; 2 optional private spreadsheet-extract tests skipped because the private source files are absent.
- Browser suite: 54 passed, covering mobile layouts, ride search, Event Access, test checkout, privacy, chat fallback and legacy internal workflows.
- Additional browser regression checks: invalid supplier/customer amounts show errors, retain entered scope and allow a corrected amount to be saved (3 workflow tests passed).
- Repository privacy check: passed. No operator import mappings are added.
- npm audit: zero known vulnerabilities at verification time.
- Compared public design sources against Derek's main: unchanged. Runtime catalog content may vary with each project's configured data source.

No real payment, email or model API call was made. These fixes require no new API keys; the existing website integrations retain their own configuration requirements. No deployment is included.

## Applying to another project

Review the targeted patch against that project's current main. Do not replace the project with the older lucid-goodall prototype. Keep its public pages, styles, branding, assets, prices and environment configuration. Run the same checks against the resulting application before any deployment.

This review branch belongs to cartersites-arch/carnivalriderental. Neither main branch nor Derek's repository is modified. The fork's sanitized ancestry is retained so removed operator mappings are not brought back through upstream history.
