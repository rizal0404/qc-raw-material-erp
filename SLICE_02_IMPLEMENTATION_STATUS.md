# Slice 02 Implementation Status — v0.3.0

## Implemented

### Database

- migration `0002_master_data_hardening.sql`;
- vendor normalized alias table/backfill;
- uniform master timestamps;
- case-insensitive unique indexes;
- active/query indexes;
- updated-at triggers.

### Domain / repository

- `MasterRepository` port;
- PostgreSQL/Drizzle adapter;
- Vendor, Plant, Crusher, Equipment, Source, Pile, Shift lookup functions;
- generic audit writes.

### Backend application/API

- master service canonicalization;
- uniqueness validation;
- referential validation;
- activation/deactivation reason rule;
- role-aware lookup bootstrap;
- vendor-scoped equipment lookup;
- admin CRUD/list routes;
- unit tests for key business rules.

### Frontend

- `/master-data` Supervisor/Admin workspace;
- TanStack Table data grid;
- filter/search/status controls;
- CRUD modal forms;
- dependent Vendor → Equipment workflow;
- material/plant dependent fields;
- `/user-management` page;
- Vendor scope and Crusher scope selection for IAM users;
- admin-only route guards/navigation.

### Slice 01 corrective fix

Implemented missing `authService.updateManagedUser()` which was already referenced by `PATCH /api/v1/iam/users/:userId` in Slice 01.

## Validation completed in this environment

- source tree/file integrity checks;
- TypeScript AST syntax parse;
- migration naming/order check;
- route-to-service/repository static reference check;
- transpiled runtime smoke test for vendor canonicalization/audit and status-change reason guard;
- no destructive DELETE master API introduced.

## Runtime validation still pending

The current environment does not provide installed workspace dependencies, pnpm, Docker, or PostgreSQL. Therefore these remain required in a real development/staging environment:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm dev
```

Then execute the UAT in `docs/architecture/slice-02-master-data.md`.

## Known deliberate deferrals

- Quality Target admin page/API: Slice 03 when QAF parity is implemented.
- Ton/Retase rule editor: Slice 03 because it belongs to QC calculation parity.
- Historical master import tooling: migration slice.
- Hard delete: intentionally not implemented.

## Next

**Slice 03 — Raw Samples + QC Core Parity.**
