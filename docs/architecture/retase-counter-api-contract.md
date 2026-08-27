# Digital Retase Counter — API Contract v0.6.0

Base path: `/api/v1`

## Authorization

Counter mutation:

- `CRUSHER_OPERATOR`
- `SUPERVISOR_ADMIN`

Retase read:

- `CRUSHER_OPERATOR`
- `QC_ANALYST`
- `SUPERVISOR_ADMIN`

Crusher scope is enforced server-side for `CRUSHER_OPERATOR`.

---

## GET `/counter/context`

Query:

```text
crusherId=<uuid>
operationDate=YYYY-MM-DD   optional
shiftCode=SHIFT_1|SHIFT_2|SHIFT_3 optional
```

When date/shift are omitted, server returns current business context.

Response contains:

- timezone;
- current server business context;
- requested context;
- `canRecord`;
- canonical Crusher;
- submitted report count;
- active assignment count.

---

## GET `/counter/assignments`

Query:

```text
crusherId=<uuid>
operationDate=YYYY-MM-DD
shiftCode=SHIFT_n
```

Returns only assignments whose parent Shift Report is effective `SUBMITTED` and assignment status is ACTIVE.

Each AA item includes:

- `assignmentAaId`;
- canonical AA ID/unit;
- confirmed net count;
- last server event timestamp.

Assignment contains `activeNow` based on current server local time and assignment window.

---

## POST `/retase-events`

### Listed AA request

```json
{
  "requestId": "uuid",
  "operationDate": "2026-08-20",
  "shiftCode": "SHIFT_1",
  "crusherId": "uuid",
  "assignmentAaId": "uuid",
  "clientTs": "2026-08-20T01:12:31.000Z"
}
```

`assignmentAaId` is the only assignment reference accepted from the button. Backend resolves Vendor/AM/AA/Source/Report independently.

### Unlisted AA request

```json
{
  "requestId": "uuid",
  "operationDate": "2026-08-20",
  "shiftCode": "SHIFT_1",
  "crusherId": "uuid",
  "vendorId": "uuid",
  "unlistedUnitNo": "112",
  "reason": "Unit pengganti belum masuk assignment",
  "clientTs": "2026-08-20T01:15:00.000Z"
}
```

`reason` is mandatory for Unlisted AA.

### Direct Clay column request

```json
{
  "requestId": "uuid",
  "operationDate": "2026-08-26",
  "shiftCode": "SHIFT_2",
  "crusherId": "uuid",
  "clayReportColumnId": "uuid",
  "clientTs": "2026-08-26T08:15:00.000Z"
}
```

Backend resolves Vendor/Source/Pile snapshots from the active `DRAFT` Clay report column. Vendor Shift Report, AM, AA, unlisted unit, and reason are not required for this shape.

Response:

```json
{
  "ok": true,
  "idempotent": false,
  "item": { "...": "canonical saved event" }
}
```

If the same `requestId` is retried, response returns the already persisted event with `idempotent=true`.

---

## POST `/retase-events/:id/reverse`

```json
{
  "requestId": "uuid",
  "reason": "Salah tap unit"
}
```

Operator rules:

- own event only;
- latest reversible event only;
- maximum 10 minutes;
- current business context only.

Supervisor/Admin may perform controlled reversal of an unreversed DUMP.

The API never deletes the original event.

---

## GET `/retase-events`

Query:

```text
operationDate
shiftCode
crusherId
vendorId optional
aaId optional
limit
 offset
```

Returns recent append-only ledger rows. `canReverse` is calculated for the authenticated principal.

---

## GET `/retase-summary`

Query:

```text
operationDate
shiftCode
crusherId
```

Returns:

- `totalNet`;
- `dumpEvents`;
- `reversalEvents`;
- `unassignedEvents`;
- `ambiguousEvents`;
- `byVendor`;
- `byAm`;
- `byAa`;
- `hourly`.

---

## Error codes

Important Slice 05 codes:

- `FORBIDDEN`
- `COUNTER_CONTEXT_NOT_CURRENT`
- `ASSIGNMENT_CONTEXT_MISMATCH`
- `ASSIGNMENT_NOT_ACTIVE`
- `AA_VENDOR_MISMATCH`
- `EVENT_NOT_REVERSIBLE`
- `EVENT_ALREADY_REVERSED`
- `UNDO_LAST_ONLY`
- `UNDO_WINDOW_EXPIRED`
- `IDEMPOTENCY_KEY_REUSED`
- `UNIQUE_CONSTRAINT`

`request_id` duplicate is normally handled as idempotent success rather than surfaced as conflict.

## Runtime configuration

`COUNTER_UNDO_MINUTES` defaults to `10`; the API is authoritative for undo eligibility.
