# QC Reconciliation + Retase Mapping API Contract

**API prefix:** `/api/v1`  
**Release:** v0.7.0  
**Allowed roles:** `QC_ANALYST`, `SUPERVISOR_ADMIN`

All authorization is enforced server-side. Client-supplied role/vendor scope is never authoritative.

**Scope update — 2026-08-27:** workflow ini khusus Limestone. List `materialKind=CL` dan create/update/confirm allocation Clay ditolak dengan `CLAY_DIRECT_WORKFLOW`; suggestion legacy Clay mengembalikan daftar kosong. Clay memakai `/workbench/clay-retase` dan `items[].clayRetaseSources` langsung pada Save/Replace Mix (lihat `clay-shift-report-workflow.md` dan ADR-014). Data historis tidak dihapus.

## 1. List Reconciliation

### `GET /reconciliation`

Query:

```text
operationDate   required YYYY-MM-DD
shiftCode       optional SHIFT_1 | SHIFT_2 | SHIFT_3
crusherId       optional UUID
vendorId        optional UUID
materialKind    optional LS | CL
mappingStatus   optional UNMAPPED | SUGGESTED | AMBIGUOUS | CONFIRMED | CONSUMED | REVIEW_REQUIRED
search          optional
```

Response:

```json
{
  "ok": true,
  "items": [
    {
      "assignmentId": "uuid",
      "observedRetase": 50,
      "reservedRetase": 34,
      "consumedRetase": 0,
      "remainingRetase": 16,
      "candidateCount": 2,
      "mappingStatus": "AMBIGUOUS",
      "reviewRequired": false,
      "allocations": []
    }
  ],
  "exceptions": [],
  "summary": {
    "assignmentCount": 1,
    "observedRetase": 50,
    "reservedRetase": 34,
    "remainingRetase": 16,
    "reviewRequired": 0,
    "unassignedEvents": 0,
    "ambiguousEvents": 0
  }
}
```

The request triggers upstream drift detection before returning results.

## 2. Assignment Sample Candidates

### `GET /reconciliation/:assignmentId/candidates`

Candidate rule:

```text
Operation Date + Material Kind + Vendor
```

Response candidate includes:

- raw Sample UUID;
- `sampleId` business identifier;
- Vendor/source/block snapshots;
- chemistry;
- calculated LSF/SM/AM/NaEq;
- `matchMode = VENDOR_ID | VENDOR_TEXT`.

## 3. Assignment Event Drill-down

### `GET /reconciliation/:assignmentId/events`

Returns chronological retase ledger rows for traceability:

```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "eventTs": "2026-08-20T01:15:00.000Z",
      "aaUnitNo": "112",
      "delta": 1,
      "eventType": "DUMP",
      "status": "VALID",
      "createdByName": "Operator Crusher",
      "reason": null
    }
  ]
}
```

## 4. Create Mapping Allocation

### `POST /reconciliation/allocations`

Body:

```json
{
  "assignmentId": "uuid",
  "sampleId": "uuid",
  "approvedRetase": 14,
  "note": "Optional mapping note"
}
```

Server validates:

- assignment exists;
- upstream report remains effective `SUBMITTED`;
- observed retase > 0;
- selected Sample_ID is a current Vendor-based candidate;
- approved retase does not exceed assignment remaining retase;
- no duplicate open allocation for the same assignment + Sample_ID.

Possible errors:

- `UPSTREAM_REPORT_NOT_EFFECTIVE`
- `NO_OBSERVED_RETASE`
- `SAMPLE_NOT_CANDIDATE`
- `RETASE_EXCEEDS_REMAINING`
- `ALLOCATION_EXISTS`

## 5. Update Open Mapping

### `PATCH /reconciliation/allocations/:id`

Body may contain:

```json
{
  "sampleId": "uuid",
  "approvedRetase": 13,
  "note": "Adjusted after QC review"
}
```

`CONFIRMED` and `CONSUMED` allocations cannot be edited directly.

## 6. Confirm Mapping

### `POST /reconciliation/allocations/:id/confirm`

Body:

```json
{
  "approvedRetase": 14,
  "reason": "Candidate dipilih berdasarkan verifikasi QC"
}
```

Rules:

- Sample_ID must still be a valid candidate;
- approved retase > 0;
- if candidate count > 1, `reason` is mandatory;
- approved total must not exceed current remaining observed retase;
- upstream report must remain effective `SUBMITTED`.

Resulting state is normally `CONFIRMED`.

## 7. List Exception Assignment Candidates

### `GET /reconciliation/exceptions/:eventId/assignment-candidates`

Returns only assignments considered valid candidates by backend context matching.

Fields include:

- assignment/report/version;
- Vendor;
- AM;
- Source/Block/Material;
- Crusher;
- `aaListed`.

The client must not invent an arbitrary assignment ID for resolution.

## 8. Resolve Exception Event

### `POST /reconciliation/exceptions/:eventId/resolve`

Body:

```json
{
  "assignmentId": "uuid",
  "reason": "Unit pengganti, dikonfirmasi ke AM 12"
}
```

Rules:

- reason min. 3 characters;
- selected assignment must be in server-derived candidate list;
- event must still be an exception DUMP;
- event must not already be allocated;
- report must be effective `SUBMITTED`;
- operation date/shift/crusher/vendor/time window must remain compatible.

Resolution updates event metadata/status and audit fields. It never deletes the original event.

Possible errors:

- `ASSIGNMENT_NOT_CANDIDATE`
- `EVENT_NOT_RECONCILABLE`
- `UPSTREAM_REPORT_NOT_EFFECTIVE`
- `ASSIGNMENT_CONTEXT_MISMATCH`
- `RETASE_EVENT_ALREADY_ALLOCATED`

## 9. Workbench Retase Suggestions

### `GET /workbench/retase-suggestions`

Query:

```text
materialKind   required LS | CL
operationDate  required YYYY-MM-DD
```

Only current, confirmed, non-review, non-consumed allocations are returned.

Example:

```json
{
  "ok": true,
  "items": [
    {
      "sampleId": "raw-sample-uuid",
      "sampleCode": "LS001",
      "mappedRetase": 14,
      "allocationIds": ["allocation-uuid"],
      "allocationCount": 1,
      "sources": [
        {
          "allocationId": "allocation-uuid",
          "assignmentId": "assignment-uuid",
          "approvedRetase": 14,
          "vendorName": "Vendor A",
          "crusherName": "CR LS 5",
          "amUnitNo": "12",
          "sourceName": "B9 Tengah",
          "blockSnapshot": "B9 Tengah"
        }
      ]
    }
  ]
}
```

## 10. Mix Save Contract Extension

Workbench Mix item payload now supports:

```json
{
  "sampleId": "uuid",
  "retase": 13,
  "tonPerRetase": 25,
  "retaseAllocationIds": ["uuid"],
  "retaseOverrideReason": "1 retase dikeluarkan setelah QC review"
}
```

Rules enforced by QC service/repository:

- mapped Sample_ID must match allocation Sample_ID;
- allocation must be confirmed/current/not review/not consumed;
- final retase cannot exceed approved total;
- final retase below approved total requires override reason;
- exact underlying DUMP events are locked and bound transactionally;
- active event binding unique index prevents double consumption;
- if a confirmed mapping exists, silently omitting allocation IDs is rejected (`MAPPED_RETASE_REQUIRED`).

## 11. Controlled Error Codes

Important codes exposed by the application layer include:

```text
MAPPED_RETASE_REQUIRED
RETASE_ALLOCATION_NOT_AVAILABLE
RETASE_SAMPLE_MISMATCH
RETASE_EXCEEDS_APPROVED
RETASE_OVERRIDE_REASON_REQUIRED
RETASE_EVENT_NOT_AVAILABLE
RETASE_EXCEEDS_REMAINING
SAMPLE_NOT_CANDIDATE
MAPPING_REASON_REQUIRED
UPSTREAM_REPORT_NOT_EFFECTIVE
RETASE_EVENT_ALREADY_ALLOCATED
```

HTTP semantics follow the existing API error contract (`400` validation, `401/403` auth, `404` missing entity, `409` state/integrity conflict).
