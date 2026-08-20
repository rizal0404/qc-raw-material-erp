# Slice 04 Implementation Status — Vendor Shift Report

**Repository version:** 0.5.0  
**Status:** Implemented in source; runtime PostgreSQL/browser UAT still required.

## Scope implemented

- Native Vendor Shift Report API and frontend.
- Deterministic current report lookup by `vendor_id + operation_date + shift_code`.
- Draft create, reload, edit, submit.
- Revision draft from active submitted version.
- Previous submitted version becomes `SUPERSEDED` only when replacement revision is submitted.
- Version history.
- Fleet summary AM/AA with submit-time balance validation.
- Loading assignment AM → Source/Block → Material → Crusher → AA.
- Canonical material/category derived server-side from Source Master.
- Vendor/equipment/active reference validation.
- Source material ↔ crusher material validation.
- Assignment time validation including Shift 3 cross-midnight.
- AM overlap and AA overlap blocking.
- Vendor scope enforced server-side.
- QC Analyst read-only access; Vendor/Supervisor-Admin write access.
- Audit trail for draft create/update, submit, revision creation.
- Database hardening migration `0004_vendor_shift_report.sql`.
- Endpoint reserved for Slice 05: effective submitted report.

## Critical regression addressed

Legacy GAS failure mode:

`Save Draft -> row persisted -> frontend reload cannot find draft -> cannot edit/submit`

Native contract:

1. `POST /api/v1/vendor/shift-reports` persists PostgreSQL `date` business key.
2. Response returns the canonical persisted report.
3. Page invalidates current-report query.
4. `GET /api/v1/vendor/shift-reports/current?operationDate=YYYY-MM-DD&shiftCode=...` resolves a DRAFT first, otherwise active SUBMITTED.
5. Browser reload uses the same deterministic query key.
6. The same `report.id` and `version` are hydrated back into the editor.

## Lifecycle

```text
No report
  -> DRAFT V1
  -> SUBMITTED V1

SUBMITTED V1
  -> Create Revision
  -> DRAFT V2 while V1 remains effective SUBMITTED
  -> Submit V2 transaction:
       V1 -> SUPERSEDED
       V2 -> SUBMITTED
```

This ensures Slice 05 Counter never loses its last effective submitted assignment while a revision is still being drafted.

## Security

- VENDOR can only access own `vendor_id`.
- SUPERVISOR_ADMIN can create/update/submit for any selected vendor.
- QC_ANALYST can read/history but cannot mutate.
- CRUSHER_OPERATOR has no Shift Report page/API access in Slice 04.

## Not yet runtime-verified here

The execution environment does not contain project dependencies or PostgreSQL service. Required before staging acceptance:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm build
```

Then execute API integration/UAT against PostgreSQL/Supabase.

## Exit gate for Slice 04

- Draft survives browser reload with same ID/version.
- Draft can be edited after reload.
- Submit succeeds only when AM/AA totals balance and assignment is complete.
- Shift 3 assignment `23:00 -> 01:00` is accepted.
- Overlap conflict is rejected.
- Submitted V1 remains effective while V2 is DRAFT.
- Submitting V2 atomically supersedes V1.
- History retains all versions.

## Next

**Slice 05 — Digital Retase Counter**
