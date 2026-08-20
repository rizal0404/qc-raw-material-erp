# Slice 05 — Digital Retase Counter

**Implementation version:** v0.6.0  
**Status:** Source implemented; PostgreSQL/API/browser UAT pending.

## Objective

Replace paper tally with an append-only digital event ledger while consuming only effective `SUBMITTED` Vendor Shift Report assignments from Slice 04.

Operational chain:

```text
Effective SUBMITTED Shift Report
        ↓
Loading Assignment AM → AA → Crusher
        ↓
Crusher Operator Counter
        ↓
1 tap AA = DUMP +1 event
        ↓
Retase Event Ledger
        ↓
Hourly / AA / Vendor summary
        ↓
Slice 06 Reconciliation
```

## Core invariants

1. Server/database timestamp is authoritative.
2. `operation_date` is business date, including Shift 3 cross-midnight handling.
3. Crusher Operator can write only to assigned crusher scope.
4. A normal operator write is accepted only for the current server business context.
5. Each client tap gets a UUID `request_id` before sending.
6. `request_id` is unique in PostgreSQL; retry returns the existing event.
7. No historical DUMP row is deleted.
8. Undo creates a second `REVERSAL -1` row and marks the original row `REVERSED`.
9. Operator Undo is restricted to own **latest reversible event** within 10 minutes and requires reason.
10. Supervisor/Admin can reverse a DUMP with mandatory reason for controlled correction.
11. Unlisted AA is still recorded as observed dump but is `EXCEPTION_UNASSIGNED` when no effective assignment can be resolved.
12. More than one active assignment candidate produces `AMBIGUOUS`; it is not guessed.

## Business context

Canonical shift seed:

```text
SHIFT_1  07:30–15:30
SHIFT_2  15:30–22:30
SHIFT_3  22:30–07:30
```

At 02:15 WITA on 21 Aug 2026, the business context is:

```text
local_date      = 2026-08-21
shift_code      = SHIFT_3
operation_date  = 2026-08-20
```

Write endpoints reject stale/wrong date-shift selection with `COUNTER_CONTEXT_NOT_CURRENT`.

## Assignment resolution

### Listed button

The AA button carries only `assignment_aa_id`. Backend independently checks:

- assignment AA exists and active;
- parent assignment active;
- parent report is currently `SUBMITTED`;
- date, shift, crusher match request;
- assignment time window contains current server local time.

Client metadata is never trusted to establish Vendor/AM/Source identity.

### Unlisted flow

Input:

- AA unit number or known AA ID;
- Vendor when known;
- mandatory reason.

Backend attempts to resolve canonical Equipment and effective assignment. Result:

- exactly 1 active candidate → `VALID`;
- 0 candidates → `EXCEPTION_UNASSIGNED`;
- >1 candidates → `AMBIGUOUS`.

## Event ledger

`retase_events` remains append-oriented. Slice 05 adds historical snapshots:

- report ID + version;
- source ID;
- material kind/category;
- block snapshot;
- Vendor name snapshot;
- AM unit snapshot;
- AA unit snapshot.

This makes event traceability resilient to later display-name/master changes.

## Counter UI

Route:

```text
/retase-counter
```

Primary layout:

```text
Vendor BATARA · AM BX05 · B9 Tengah · PILE

[ AA 02 | 4 ] [ AA 10 | 3 ] [ AA 12 | 7 ]
```

Button count:

```text
confirmed server count + local pending count
```

States:

- confirmed;
- pending sync;
- failed;
- disabled outside assignment window;
- read-only when selected context is not current.

The page auto-refreshes server data every 10 seconds without using browser count as final source of truth.

## Undo semantics

Operator:

```text
DUMP +1 (own latest event)
        ↓ <= 10 minutes
Undo + mandatory reason
        ↓
original status = REVERSED
new REVERSAL event = -1
```

No delete is performed.

## Summary

`GET /retase-summary` produces:

- total net retase;
- dump count;
- reversal count;
- unassigned count;
- ambiguous count;
- net retase by Vendor;
- net retase by AM;
- net retase by AA;
- hourly net retase using Asia/Makassar.

## Database migration

`0005_digital_retase_counter.sql` adds event snapshots and indexes for:

- recent event / Undo Last lookup;
- report traceability;
- context/status query path;
- AA snapshot traceability.

Existing migrations `0000`–`0004` are not modified.

## Scope deliberately deferred

Not implemented in Slice 05:

- browser offline queue / service worker;
- manual historical dump correction workflow;
- QC Sample_ID mapping;
- allocation/consumption into Mix;
- event-to-allocation reconciliation;
- operations management dashboard.

These belong to Slice 06+.

## UAT minimum

1. Submit a Vendor Shift Report for current date/shift/Crusher.
2. Login as operator scoped to that Crusher.
3. Counter loads effective submitted assignment.
4. Tap AA once → exactly one DUMP +1.
5. Retry same `request_id` → total remains unchanged.
6. Tap another AA → independent count increments.
7. Undo latest own event with reason within 10 min → net count decreases by one; original remains visible.
8. Attempt undo older own event → blocked with `UNDO_LAST_ONLY`.
9. Attempt undo after 10 minutes → blocked with `UNDO_WINDOW_EXPIRED`.
10. Record Unlisted AA → event visible and unresolved status preserved.
11. Select historical/noncurrent context → page is read-only; write rejected backend-side.
12. Operator opens Crusher outside scope → `FORBIDDEN`.

## Configuration

- `COUNTER_UNDO_MINUTES=10` — default operator undo window; enforced server-side.
