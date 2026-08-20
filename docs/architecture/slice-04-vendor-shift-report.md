# Slice 04 — Vendor Shift Report Architecture

## Purpose

Replace semi-structured WhatsApp fleet reports with a canonical native workflow that becomes the authoritative assignment source for the Digital Retase Counter.

## Frontend

Route:

```text
/vendor-shift-report
```

Primary UI blocks:

1. Operation Date / Shift / Vendor context.
2. Fleet Summary AM.
3. Fleet Summary AA.
4. Loading Assignment repeater.
5. AA searchable multi-select.
6. Save Draft / Submit / Create Revision.
7. Version History.

Hydration is server-state driven through TanStack Query. The editor never assumes a saved draft from local state alone.

## Backend module

```text
apps/api/src/modules/vendor-operation/
  routes.ts
  service.ts
```

Business dependencies:

```text
VendorOperationService
  -> VendorShiftReportRepository
  -> MasterRepository
```

The service owns authorization-aware business validation. PostgreSQL repository owns persistence and transactional lifecycle changes.

## Current-report semantics

For business key:

```text
vendor_id + operation_date + shift_code
```

`getCurrent()` resolves:

1. highest/current `DRAFT`, else
2. effective `SUBMITTED`, else
3. null.

This is deliberately different from `getEffectiveSubmitted()` used by the Counter. The Counter must ignore a draft revision and continue using the active submitted version.

## Revision semantics

Creating a revision does **not** immediately supersede the existing submitted version.

On revision submit, one transaction executes:

```text
previous SUBMITTED -> SUPERSEDED
new DRAFT          -> SUBMITTED
```

This avoids an operational gap for counter users.

## Assignment validation

The API does not trust client material values.

From `source_id` server resolves:

- canonical material kind;
- material category;
- default block.

From `crusher_id` server verifies material compatibility.

From `am_id/aa_ids` server verifies:

- equipment type;
- vendor ownership;
- active status.

## Cross-midnight

Shift 3:

```text
22:30 -> 07:30
```

is normalized to one business timeline:

```text
22:30 = 1350
23:00 = 1380
01:00 = 1500
07:30 = 1890
```

Therefore `23:00 -> 01:00` is valid and overlap checks remain deterministic.

## Draft completeness

Drafts may be incomplete in fleet balance or have zero assignments so users can save work in progress.

Submit requires:

- AM balance;
- AA balance;
- >= 1 assignment;
- each active assignment has >= 1 AA;
- no AM overlap;
- no AA overlap.

## Regression contract

The previous Apps Script issue is now an architectural test requirement: persistence and hydration use one native PostgreSQL `date` business key and deterministic API endpoint. No Date-object/string conversion occurs in the browser-to-database contract.
