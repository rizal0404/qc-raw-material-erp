# Slice 04 Changelog — v0.5.0

## Added
- Vendor operation contracts.
- Vendor shift domain types, ports, timeline validation.
- PostgreSQL vendor-operation repository.
- Fastify vendor shift service/routes.
- React/TanStack Vendor Shift Report page.
- Migration `0004_vendor_shift_report.sql`.
- Draft/reload/submit/revision lifecycle.
- Version history and audit actions.
- Shift 3 cross-midnight overlap engine.
- Effective submitted endpoint for Slice 05.

## Changed
- `shift_report_status` adds `SUPERSEDED`.
- Vendor report schema adds revision/supersede/update actor metadata.
- Authenticated navigation exposes Shift Report to VENDOR/QC/SUPERVISOR_ADMIN.
- Package versions bumped to 0.5.0.

## Preserved
- Slice 01 IAM.
- Slice 02 Master Data.
- Slice 03 QC Core parity.
- Migrations 0000–0003 remain unchanged.
