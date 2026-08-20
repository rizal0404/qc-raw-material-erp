# Slice 06 — QC Reconciliation + Retase Mapping

**Release:** v0.7.0  
**Status:** Source implementation complete; runtime staging/UAT pending  
**Scope:** reconciliation event/assignment, Sample_ID mapping, QC-approved retase allocation, Workbench suggestion, exact event consumption, revision/reversal review.

## 1. Objective

Slice 06 closes the controlled data chain between Digital Retase Counter and QC Workbench:

```text
RETASE_EVENT
   ↓
Loading Assignment aggregate
   ↓
Observed Retase
   ↓
Sample candidate by Vendor
   ↓
QC allocation / confirmation
   ↓
Workbench mapped-retase suggestion
   ↓
Mix save
   ↓
Exact DUMP event binding + CONSUMED
```

The module deliberately does **not** auto-write counter totals directly into Mix Detail. QC remains the final control point before retase becomes part of a Mix.

## 2. Roles

Only:

- `QC_ANALYST`
- `SUPERVISOR_ADMIN`

may access reconciliation and mapped-retase APIs. Vendor and Crusher Operator do not receive mapping authority.

## 3. Reconciliation Aggregate

The principal reconciliation unit is `loading_assignment`.

For each assignment the backend derives:

- Operation Date
- Shift
- Crusher
- Vendor
- AM
- Source / Block / Material
- assigned AA count
- AA with valid dump count
- `observed_retase`
- `reserved_retase`
- `consumed_retase`
- `remaining_retase`
- Sample_ID candidate count
- mapping status
- review/exception state

Definitions:

```text
Observed Retase = count of valid DUMP events on the assignment

Reserved Retase =
  approved retase for open CONFIRMED/REVIEW_REQUIRED allocations
  + actual consumed retase for CONSUMED allocations

Remaining Retase = Observed Retase − Reserved Retase
```

Historical assignments from superseded reports are hidden when they have no events/allocation/review state. A superseded assignment with operational history remains visible for traceability and is marked for review.

## 4. Sample Candidate Rule — OD-06

Current authoritative mapping rule is intentionally conservative:

```text
Operation Date
+ Material Kind
+ Vendor
```

Candidate matching uses:

1. `raw_samples.vendor_id` when available; otherwise
2. normalized raw Vendor snapshot matched to the canonical Vendor name/code/aliases.

Source/Block/Crusher may be displayed as context but are **not** authoritative Sample_ID matching keys in this release.

Derived initial state:

```text
candidate = 0  → UNMAPPED
candidate = 1  → SUGGESTED
candidate > 1  → AMBIGUOUS
```

If multiple candidates exist, QC must make an explicit choice and provide a mapping reason before confirmation.

## 5. Allocation Model

`qc_retase_allocations` is the QC control record connecting one loading assignment to one `raw_sample`.

Important fields:

- `assignment_id`
- `sample_id`
- `mapping_status`
- `observed_retase`
- `approved_retase`
- `consumed_retase`
- `candidate_count`
- `review_required`
- `review_reason`
- `mix_id`
- confirm/consume actors and timestamps

One assignment may be split across multiple Sample_IDs, for example:

```text
Assignment observed = 50 retase

Sample LS001 → approved 34
Sample LS002 → approved 16
```

The partial unique index prevents two simultaneous open allocations for the same `assignment_id + sample_id`.

## 6. Mapping State Model

```text
UNMAPPED
   ├─ one candidate ───────────────→ SUGGESTED
   └─ multiple candidates ────────→ AMBIGUOUS

SUGGESTED / AMBIGUOUS
   ↓ QC saves selection/retase
SUGGESTED / AMBIGUOUS allocation
   ↓ QC confirm
CONFIRMED
   ↓ Workbench applies + Mix save
CONSUMED

Any upstream integrity drift
   ↓
REVIEW_REQUIRED
```

`REVIEW_REQUIRED` takes display priority over normal open/consumed status so operational inconsistencies are not silently hidden.

## 7. Exception Event Resolution

Counter events with:

- `EXCEPTION_UNASSIGNED`, or
- `AMBIGUOUS`

are listed separately.

The server derives candidate assignments using the same:

- operation date,
- shift,
- crusher,
- vendor where known,
- assignment time window,

and marks whether the AA is listed on that assignment.

QC may resolve an exception only to one of these server-derived candidates. Resolution:

- does not delete/recreate the original DUMP event;
- changes classification to `VALID`;
- attaches report/assignment/AM/source/material snapshots;
- records `resolved_by`, `resolved_at`, `resolution_reason`;
- writes an application audit entry.

An event already bound to an allocation cannot be re-resolved.

## 8. Workbench Integration

Endpoint `GET /workbench/retase-suggestions` returns only allocations that are:

- `CONFIRMED`,
- not `review_required`,
- not linked to a Mix,
- matching Operation Date and Material Kind.

Suggestions are grouped by Sample_ID and may contain several allocations.

The frontend exposes:

- Mapped Retase
- Retase Source
- Apply per Sample
- Apply All Mapped Retase

Applying a suggestion copies the allocation IDs into Workbench state. It does **not** write Mix Detail yet.

### Manual deviation

If final Workbench Retase differs from mapped approved Retase:

- allocation IDs remain attached;
- a reason is mandatory;
- final retase cannot exceed the total approved mapped retase.

If a confirmed mapping exists for a Sample/Operation Date, backend prevents silent save as unrelated manual retase (`MAPPED_RETASE_REQUIRED`).

## 9. Exact Event Consumption

Consumption is deliberately event-level, not aggregate-only.

When `wbSaveMix()` equivalent inserts Mix items inside a transaction:

1. lock selected allocations;
2. verify status `CONFIRMED`, same Sample_ID, no review/previous consumption;
3. verify final retase ≤ total approved retase;
4. select oldest still-unallocated valid DUMP events from each assignment using row locks;
5. create active `qc_retase_allocation_events` bindings;
6. create `mix_item_retase_allocations` bindings;
7. mark allocations `CONSUMED` with actual `consumed_retase`, Mix reference, and timestamp.

Database defense:

```text
UNIQUE active qc_retase_allocation_events(event_id)
```

ensures one DUMP event cannot be consumed by two Mixes.

## 10. Partial Consumption

QC may consume less than the approved amount only with a reason.

Example:

```text
Approved mapping = 14
Final Mix retase  = 13
Reason            = required
Consumed events   = 13
```

Allocation becomes `CONSUMED` with `consumed_retase = 13`. The unused observed capacity remains available at assignment level for a subsequent controlled allocation.

## 11. Mix Replacement

Replacement runs in one controlled transaction:

1. release active event/allocation bindings from old Mix;
2. retain historical bridge rows as inactive with release metadata;
3. reset affected allocation to `CONFIRMED` or `REVIEW_REQUIRED`;
4. mark old Mix replaced;
5. insert replacement Mix;
6. consume newly selected exact events.

This preserves traceability while preventing double use during Recall/Replace.

## 12. Drift / Review Detection

`markReviewRequiredForDrift()` checks at reconciliation/workbench read boundaries.

Current triggers include:

### Upstream report revision
If an allocation points to an assignment whose Vendor Shift Report is no longer effective `SUBMITTED`:

```text
review_required = true
review_reason   = UPSTREAM_REPORT_SUPERSEDED
```

### Reversal after mapping/consumption
If a linked DUMP event is reversed, the related allocation is flagged for review.

Crusher Operator is blocked from reversing a consumed event. `SUPERVISOR_ADMIN` may perform the correction, but the downstream mapping becomes review-required rather than silently remaining valid.

### Observed total drops below reserved
If observed retase becomes smaller than reserved/consumed retase, mapping is flagged for review.

## 13. Database Additions — Migration 0006

Migration `0006_qc_reconciliation_retase_mapping.sql` adds:

### `retase_events`
- `resolved_by`
- `resolved_at`
- `resolution_reason`

### `qc_retase_allocations`
- `consumed_retase`
- `candidate_count`
- `override_reason`
- `review_required`
- `review_reason`
- `created_by`
- `updated_by`

### `qc_retase_allocation_events`
Exact allocation ↔ retase-event bindings.

### `mix_item_retase_allocations`
Mix item ↔ allocation consumption bindings.

The legacy singular `source_retase_allocation_id` remains for compatibility, but v0.7 native code uses the bridge model.

## 14. Frontend UI/UX

Route:

```text
/reconciliation
```

Primary areas:

1. filter bar;
2. reconciliation KPI cards;
3. assignment reconciliation table;
4. Map/Review modal;
5. Sample candidate detail;
6. event drill-down;
7. unassigned/ambiguous event table;
8. exception-resolution modal.

Status badges prioritize operational attention:

- Green: `CONFIRMED`, `CONSUMED`
- Amber: `UNMAPPED`, `AMBIGUOUS`, `REVIEW_REQUIRED`
- Neutral: `SUGGESTED`

## 15. API Surface

See `reconciliation-api-contract.md` for detailed endpoint contracts.

Core endpoints:

```text
GET  /api/v1/reconciliation
GET  /api/v1/reconciliation/:assignmentId/candidates
GET  /api/v1/reconciliation/:assignmentId/events
POST /api/v1/reconciliation/allocations
PATCH /api/v1/reconciliation/allocations/:id
POST /api/v1/reconciliation/allocations/:id/confirm
GET  /api/v1/reconciliation/exceptions/:eventId/assignment-candidates
POST /api/v1/reconciliation/exceptions/:eventId/resolve
GET  /api/v1/workbench/retase-suggestions
```

## 16. Acceptance Focus

Minimum Slice 06 acceptance:

- exact one candidate → SUGGESTED;
- multiple candidates → AMBIGUOUS and explicit reason required on confirm;
- zero candidate → UNMAPPED;
- allocation cannot exceed remaining observed retase;
- exception can only resolve to server-derived assignment candidate;
- confirmed mappings appear in Workbench;
- mapped retase cannot be silently bypassed as manual input;
- final retase > approved is rejected;
- final retase < approved requires reason;
- exact DUMP events cannot be double-consumed;
- Vendor report revision flags mappings for review;
- consumed event reversal is blocked for operator and review-triggering for supervisor correction;
- Mix replacement releases/rebinds mappings transactionally.

## 17. Deliberate Non-Goals

Not implemented in Slice 06:

- automatic Sample_ID confirmation without QC;
- source/block as authoritative matching keys;
- automated approval workflow above QC;
- billing/payment calculations from retase;
- full operations dashboard and audit explorer;
- notification/escalation engine.

Those remain separate future slices.
