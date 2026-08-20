# v0.3.0 — Slice 02 Master Data

## Added

- Master contracts, domain ports/types, PostgreSQL repository adapter.
- Vendor/Equipment/Crusher/Source/Plant/Pile CRUD + filtered list API.
- Role-aware master/equipment lookup API.
- `vendor_aliases` normalized table.
- Migration `0002_master_data_hardening.sql`.
- Admin Master Data React workspace.
- Admin User Management React page with Vendor/Crusher scopes.
- TanStack Table reusable component + modal primitive.
- Master service unit tests.
- Slice 02 architecture/API/UAT documentation.

## Changed

- app/package versions → `0.3.0`.
- IAM service: added missing `updateManagedUser()` implementation.
- API error handler: PostgreSQL integrity errors mapped to stable HTTP contracts.
- master tables: timestamps, active indexes, case-insensitive business-key indexes, updated-at triggers.
- authenticated navigation: Master Data + Users for `SUPERVISOR_ADMIN`.

## Next

Slice 03 — Raw Samples + QC Core parity.
