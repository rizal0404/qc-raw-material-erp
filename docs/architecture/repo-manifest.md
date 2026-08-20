# Repository Skeleton Manifest

## Deployables

- `apps/web` — React/Vite SPA, TanStack Router file-based routing, Query provider, API client.
- `apps/api` — Fastify HTTP API `/api/v1`, health/version endpoint, DB bootstrap, OpenAPI plugin skeleton.

## Shared packages

- `packages/contracts` — shared API/role/date schemas.
- `packages/domain` — business ports/domain contracts; no database dependency.
- `packages/db` — PostgreSQL/Drizzle adapter and initial migration.
- `packages/ui` — reserved reusable design system package.
- `packages/config` — reserved shared configuration package.
- `packages/test-utils` — reserved fixtures/test helpers.

## Initial schema domains

1. IAM: `users`, `sessions`, `user_crusher_scopes`
2. Master: `vendors`, `vendor_aliases`, `plants`, `crushers`, `equipment`, `sources`, `piles`, `shifts`, `quality_targets`
3. Raw QC: `raw_samples`
4. Vendor operations: `vendor_shift_reports`, `loading_assignments`, `loading_assignment_aas`
5. Retase/Reconciliation: `retase_events`, `qc_retase_allocations`, `qc_retase_allocation_events`, `mix_item_retase_allocations`
6. Mixing: `mixes`, `mix_items`, `mix_item_chemistry_revisions`
7. Audit: `audit_logs`

## Canonical seed

- SHIFT_1 07:30–15:30
- SHIFT_2 15:30–22:30
- SHIFT_3 22:30–07:30, cross-midnight
- CR_LS_23, CR_LS_4, CR_LS_5
- CR_CY_4, CR_CY_5


## Slice 01 implementation

IAM/Auth is implemented in v0.2.0. See `slice-01-iam-auth.md`.

## Slice 02 implementation

Master Data is implemented in v0.3.0 with CRUD/list APIs, role-aware lookups, normalized vendor aliases, audit lifecycle, admin UI, and IAM scope integration. See `slice-02-master-data.md`.

## Slice 03 implementation

QC Core Parity is implemented in v0.4.0:
- Raw Sample LS/CL model/import;
- chemistry formula and weighted aggregation parity;
- Ton/Retase rule engine;
- Workbench Load/New/Recall/Save/Replace;
- structured chemistry revision audit;
- Mix Summary, Pile Cumulative, and QAF reports;
- React QC pages and parity fixtures.

See `slice-03-qc-core-parity.md` and `qc-core-api-contract.md`.


## Slice 04 implementation

Vendor Shift Report is implemented in v0.5.0 with draft reload, submit/revision lifecycle, effective SUBMITTED semantics, overlap validation, and cross-midnight assignment windows. See `slice-04-vendor-shift-report.md`.

## Slice 05 implementation

Digital Retase Counter is implemented in v0.6.0 with idempotent DUMP events, append-only reversal, Unlisted AA exceptions, server business context, and hourly/entity summaries. See `slice-05-digital-retase-counter.md`.

## Slice 06 implementation

QC Reconciliation + Retase Mapping is implemented in v0.7.0 with assignment reconciliation, Vendor-based Sample_ID candidates, QC allocations, exception resolution, Workbench suggestions, exact event consumption, double-use protection, and review-on-drift. See `slice-06-qc-reconciliation-retase-mapping.md`.
