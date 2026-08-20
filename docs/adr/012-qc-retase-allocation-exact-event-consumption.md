# ADR-012 — QC Retase Allocation Uses Exact Event Consumption

**Status:** ACCEPTED  
**Date:** 2026-08-20

## Context

Digital Counter produces an append-only event ledger where one valid `DUMP` represents one observed retase. QC Reconciliation then approves aggregate retase for a Sample_ID. A simple design could store only aggregate numbers such as `approved_retase = 14` and later mark that number as consumed by a Mix.

That approach is insufficient for end-to-end traceability and can allow the same physical dump to be represented by more than one downstream Mix when concurrent or revised workflows occur.

The application must support:

- assignment-level reconciliation;
- splitting one assignment across multiple Sample_IDs;
- controlled QC overrides;
- Mix Recall/Replace;
- upstream revision and reversal review;
- drill-down from Mix back to actual DUMP events;
- future migration to another PostgreSQL provider without changing business semantics.

## Decision

Retase mapping uses two levels:

1. **QC Allocation** — aggregate approval from one Loading Assignment to one Sample_ID (`qc_retase_allocations`).
2. **Exact Event Consumption** — when a Mix is saved, concrete valid DUMP event IDs are bound to the allocation/Mix item inside the same database transaction.

Bridge tables:

```text
qc_retase_allocation_events
mix_item_retase_allocations
```

An active DUMP event may have only one active consumption binding.

The database enforces this with a partial unique index on `event_id WHERE active=true`.

Mix replacement does not delete old bindings. It marks historical bindings inactive with release metadata, returns affected allocations to `CONFIRMED` or `REVIEW_REQUIRED`, and then creates new active bindings in the replacement transaction.

## Consequences

### Positive

- True Mix → Sample → Allocation → Assignment → DUMP-event traceability.
- Strong database-level double-consumption protection.
- Concurrent Mix saves cannot safely reuse the same event.
- Reversal and upstream revision impact can be detected against concrete consumed events.
- Historical replacement remains auditable.
- Aggregate allocation remains flexible while final consumption is precise.

### Negative / Cost

- More rows and joins than an aggregate-only model.
- Mix Save transaction is more complex.
- Event retention/archiving must preserve referential history.
- Reconciliation reporting must distinguish approved, consumed, released, and remaining retase.

## Alternatives rejected

### Aggregate-only `mix_id` on allocation
Rejected because it cannot prove which exact DUMP events were consumed and provides weaker concurrency protection.

### Direct Counter → Mix posting
Rejected because Counter knows operational assignment, not necessarily the correct QC Sample_ID/Mix context.

### Destructive transfer of event ownership during Mix Replace
Rejected because it erases operational history and weakens auditability.

## Related decisions

- ADR-002 — API mid-layer business boundary
- ADR-003 — PostgreSQL portability
- ADR-009 — append-only Retase Event Ledger
- ADR-010 — repository ports/adapters
- PRD OD-06 — Vendor is the current authoritative Sample_ID mapping field
