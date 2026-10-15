# Carnival Ride Rental

A national ride discovery and operator-access platform. Visitors browse inventory for free;
Event Access purchases unlock contacts for matching independent operators. Customers arrange
and pay for the rental directly with the operator. Read [the business model](docs/PROJECT_BRIEF.md).

This fork belongs to **cartersites-arch**; its working and default branch is **main**.
Changes here do not update `derekbowen/carnivalriderental` or transfer its hosted services.

## Local development

Requires Node 22.13 or later. Node 22 is used in CI.

```sh
npm ci
npm run setup
npm run dev
```

Local setup generates development secrets in ignored `.env.local`. Do not copy upstream live
credentials into a fork. Browse `/`, `/rides`, `/s`, and `/connect`. Event Access requires its
own configured ledger, catalog and payment integrations; production activation is separate
from cloning this repository. See `.env.example` and [the access architecture](docs/PAID_ACCESS_ARCHITECTURE.md).

## Verification

```sh
npm run privacy:check
npm run typecheck
npm test
npm run build
npm run inventory:validate
npm run pseo:report
npm run pseo:duplicates
npx playwright install chromium
npm run test:e2e
```

Browser tests use Playwright's installed Chromium, or `CHROMIUM_PATH` when explicitly provided.
They use fictional operators, an isolated SQLite database, fake payments and no email provider.
CI runs these checks on pull requests and pushes to `main`, without production credentials.

## Private data and deployment

Import mappings and logs can identify anonymous operators. They are private working files;
see [imports/README.md](imports/README.md) for backup and restoration requirements and the limits
of removing previously public files. Keep the opaque Test-to-Live redirects intact.

Email defaults to test mode and redirects mail to the QA inbox. Before accepting live purchases
on a fork-owned deployment, configure and verify its email provider, `EMAIL_MODE=live`, pass
delivery and recovery in a fresh browser. Do not change the upstream deployment's settings.
Outreach still requires separately approved campaigns and the existing safeguards.

[Launch status](docs/LAUNCH_STATUS.md) records the upstream deployment's history, not proof of
this fork's deployment or current environment settings. [CLAUDE.md](CLAUDE.md) contains the
project's development rules; [docs](docs/) contain import, payment, privacy and indexing runbooks.
