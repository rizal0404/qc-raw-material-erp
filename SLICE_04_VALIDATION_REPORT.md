# Slice 04 Validation Report — v0.5.0

## Automated static checks executed

### TypeScript/TSX syntax
- 88 `.ts/.tsx` files scanned with TypeScript `transpileModule`.
- Syntax diagnostics: **PASS**.

### Relative imports
- Relative source imports resolved against repository tree.
- Generated `routeTree.gen` intentionally excluded because TanStack Router creates it during Vite build.
- JSON fixture import intentionally handled as asset.
- Result: **PASS**.

### JSON
- All repository `.json` files parsed successfully.
- Result: **PASS**.

### Migration immutability
SHA-256 comparison against v0.4.0:
- `0000_initial_native_schema.sql` — PASS
- `0001_iam_auth_hardening.sql` — PASS
- `0002_master_data_hardening.sql` — PASS
- `0003_qc_core_parity.sql` — PASS
- `0004_vendor_shift_report.sql` — NEW

### Slice 04 structural contract
Verified source presence for:
- current report endpoint;
- draft create/update;
- submit;
- revision;
- effective submitted query;
- VendorOperationService;
- PostgreSQL repository adapter;
- React Vendor Shift Report page;
- Save Draft / Create Revision / Version History UI;
- `SUPERSEDED` lifecycle;
- unique active DRAFT and SUBMITTED indexes.

Result: **PASS**.

## Business rule tests added

- Fleet balance calculation.
- Shift 3 `23:00 -> 01:00` normalization.
- AM overlap detection.
- AA overlap detection.
- Sequential assignment touching boundary is allowed.
- Critical service regression: saved `2026-08-20` draft reloads by the exact same business-date query key.

## Runtime tests still required

This environment does not have repository `node_modules` or a running PostgreSQL instance, therefore these commands were not falsely reported as passed:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm build
```

Required staging UAT is documented in `docs/architecture/slice-04-vendor-shift-report.md`.
