# Book a Carnival — development

Managed carnival ride rental marketplace. **Read [PROJECT_BRIEF.md](PROJECT_BRIEF.md) first**: we capture customer demand and manage the transaction, and we procure fulfillment from carnival operators. Operators do not need to list anything.

- Architecture, Sharetribe mapping and what's verified vs. assumed: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions needed before real transactions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Magic Patterns design source (reference, not shipped): [design/magic-patterns/](design/magic-patterns/) — editor: https://www.magicpatterns.com/c/epnrxvfjbkqzxxv162nzqs

## Run it locally

Requires Node 22.12+ (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local      # then set INTERNAL_USER and INTERNAL_PASSWORD (12+ chars)
npm run dev                     # http://127.0.0.1:3000
```

- Customer site: `/`, `/rides`, `/rides/ferris-wheel-rental`, `/locations/tx/austin`, `/locations/tx/austin/ferris-wheel-rental`, `/request`
- Customer status page: the link shown after submitting (`/requests/BAC-XXXXXX?t=…`)
- Internal team area: `/internal` (HTTP Basic auth with `INTERNAL_USER` / `INTERNAL_PASSWORD`; closed if unset)

The development database is `.data/dev.sqlite` (gitignored). Delete it to start fresh.

Before running a production build with `npm start`, configure `REQUEST_TOKEN_SECRET` with a random value of at least 32 characters. Keep it stable across restarts so existing customer status links keep working. This is a local application secret, not an API key; development generates its own automatically.

## Checks

```bash
npm run typecheck
npm test                         # unit + acceptance tests (vitest)
npm run build && npm run test:e2e   # browser end-to-end on a production build (needs Playwright/Chromium)
```

## Dependency security

Run `npm ci` to install the reviewed lockfile, then `npm audit` to check for new advisories.

Next 15 currently pins an older PostCSS release, so the scoped `overrides.next.postcss` entry uses our patched PostCSS 8 dependency. Keep this override until Next ships a safe version itself. Vitest 4 removes the vulnerable Tinypool dependency; Tailwind 4 removes the vulnerable v3 parser and glob dependency chain.

Tailwind 4 requires Safari 16.4+, Chrome 111+, or Firefox 128+. The existing theme is loaded explicitly from `tailwind.config.ts`.

## What works in session one

- Public pages from structured data: homepage, browse with category filter, category page, ride page, city service page, ride + city page. Canonicals, noindex, robots, sitemap and publication gates as described in ARCHITECTURE.md.
- Event request: 4-step form + review, "Not sure" for site questions, idempotent submission, server-side validation, confirmation rendered from the stored request, customer status page with separate fulfillment and payment status.
- Internal: request queue, request detail with brief, suppliers (researched/contacted/verified), per-event stages, versioned supplier quotes with cost breakdown (unknowns stay unknown), projected contribution with exclusions listed, versioned customer quotes, guarded status changes, history.
- Customer can accept the open quote; acceptance and all status changes are validated on the server.

## Mocked or not connected

- **Sharetribe: not connected.** The app runs on the labelled development adapter (`src/lib/marketplace/adapter.ts`). No listings, users or transactions exist in Sharetribe.
- **Payments: not connected.** No card fields exist anywhere. Payment status stays "No payment taken". Booking confirmation is disabled until a payment policy is approved.
- **Email/notifications: none.** Customers keep their status link; the team checks `/internal`.
- **Catalog content:** demo fixtures only (`src/data/fixtures`), with a placeholder price range clearly labelled. `src/data/production` is empty.
- **Supplier outreach:** none. Supplier records are entered by hand.

## Next small milestone

Connect a Sharetribe **test** marketplace and prove the seller-of-record mapping end to end: one company-owned provider account (Stripe test mode), one Ferris wheel listing on a regular price-negotiation listing type, and a test customer accepting an offer — before writing any payment UI. See open questions in ARCHITECTURE.md.

## Public request protection

The public submission endpoint accepts at most 32 KiB of JSON, enforced while reading the body even when Content-Length is absent or incorrect. It allows 60 POST attempts per minute across all visitors sharing the SQLite database, returning HTTP 429 with Retry-After when full. This database-wide safety cap survives process restarts and does not trust forwarding headers. Separate databases have separate budgets; a larger or distributed deployment should add gateway-level client limits and bot protection.

When a submission response is lost, the browser keeps the original brief and request key in session storage. “Check request status” safely retries that same submission and recovers its existing status link without creating another request. Until the result is known, editing is disabled. Browser storage must remain available to preserve recovery across reloads.
