# Slice 05 Validation Report — Digital Retase Counter

**Repository:** QC Raw Material Native Web  
**Version:** v0.6.0  
**Slice:** 05 — Digital Retase Counter  
**Validation date:** 2026-08-20

## 1. Scope validated

Validation covers the source changes introduced for:

- effective `SUBMITTED` Vendor Shift Report assignment loading;
- crusher-scoped counter context;
- one tap → one `DUMP +1` retase event;
- `request_id` idempotency and logical-key reuse protection;
- server-authoritative operation date / shift;
- Shift 3 cross-midnight behavior;
- Unlisted AA recording;
- append-only reversal / Undo;
- operator Undo window;
- retase event list and aggregate summary;
- React counter UI pending / confirmed / failed states;
- same-request-id retry behavior after a failed/uncertain response;
- migration `0005_digital_retase_counter.sql`.

## 2. Static source validation

| Check | Result |
|---|---|
| TS/TSX files scanned | 100 |
| TypeScript parser/syntax diagnostics | **PASS — 0 syntax diagnostics** |
| JSON files parsed | **PASS — 16/16** |
| Relative local imports | **PASS — 0 unresolved relative imports** |
| Retase route registration | **PASS** |
| Retase contracts exported | **PASS** |
| Retase repository exported | **PASS** |
| Slice 05 endpoint strings present | **PASS** |

A parser-oriented `tsc --noEmit --noResolve` run was used because project dependencies are not installed in this runtime. Missing package/type-resolution diagnostics are therefore expected and are not treated as full TypeScript validation.

## 3. Migration integrity

Existing migrations were checksum-compared against v0.5.0:

| Migration | Result |
|---|---|
| `0000_initial_native_schema.sql` | **PASS — unchanged** |
| `0001_iam_auth_hardening.sql` | **PASS — unchanged** |
| `0002_master_data_hardening.sql` | **PASS — unchanged** |
| `0003_qc_core_parity.sql` | **PASS — unchanged** |
| `0004_vendor_shift_report.sql` | **PASS — unchanged** |
| `0005_digital_retase_counter.sql` | **NEW** |

Structural checks on `0005` confirmed:

- report/version snapshot columns;
- source/material/block snapshots;
- AA/AM/vendor snapshots;
- actor/context indexes;
- status/context index;
- AA snapshot constraint.

The original schema already contains:

- unique `request_id`;
- unique non-null `reverses_event_id`;
- reversal shape constraint.

Those constraints remain the database-level protection for duplicate request and double reversal.

## 4. Business-time runtime smoke test

The isolated business-context module was transpiled and executed under Node.js.

| Scenario | Result |
|---|---|
| 02:15 WITA on 21-Aug maps to Shift 3 operation date 20-Aug | **PASS** |
| Exact 07:30 WITA starts Shift 1 | **PASS** |
| Exact 15:30 WITA starts Shift 2 | **PASS** |
| Assignment 23:00–01:00 active at 23:30 | **PASS** |
| Assignment 23:00–01:00 active at 00:30 | **PASS** |
| Assignment 23:00–01:00 inactive at 02:00 | **PASS** |

## 5. Idempotency hardening reviewed

The implementation uses a client-generated UUID before a counter mutation. The same `request_id` is retained by the frontend when a response is failed/uncertain and the operator retries that same logical action.

Server behavior:

1. look up existing event by `request_id`;
2. if the logical event matches, return the existing event (`idempotent=true`);
3. if the same key is reused for a different logical event, return `IDEMPOTENCY_KEY_REUSED`;
4. concurrent duplicate inserts are protected by the database unique index;
5. after a unique-race failure, the API reloads the existing event and performs the same logical-key validation.

This closes an important failure mode where a database commit succeeds but the browser loses the HTTP response.

## 6. Undo / reversal reviewed

Operator Undo rules implemented server-side:

- only `DUMP +1`;
- own event only;
- latest reversible event for that operator/context only;
- active operation-date/shift context only;
- reason mandatory;
- configurable `COUNTER_UNDO_MINUTES`, default 10 minutes;
- original event is retained and marked `REVERSED`;
- separate `REVERSAL -1` event is appended.

`SUPERVISOR_ADMIN` retains controlled broader reversal authority, with reason still mandatory.

## 7. Issues found during Slice 05 validation and fixed

### 7.1 `IsoDateSchema` compatibility gap

The existing contracts imported `IsoDateSchema`, while the date contract exposed only `OperationDateSchema`. A semantic backward-compatible alias was added:

```ts
export const IsoDateSchema = OperationDateSchema;
```

### 7.2 Counter retry initially generated a new UUID

The first frontend draft created a new `request_id` on retry after an uncertain network response. That could duplicate a retase if the first request had committed but its response was lost.

Fixed behavior:

- listed AA retry reuses the original failed/uncertain `request_id`;
- Unlisted AA retry reuses the same `request_id`;
- reversal retry reuses the same `request_id`.

### 7.3 Counter configuration wiring

The operator Undo duration is now configured through:

```env
COUNTER_UNDO_MINUTES=10
```

and passed from application configuration into the Retase Service.

## 8. Not yet executed in this environment

The following are **required before staging approval** and are not claimed as PASS here because this runtime does not contain the project dependency installation / live PostgreSQL test environment:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm build
```

Then run API integration and browser UAT against a staging PostgreSQL/Supabase instance.

## 9. Minimum staging UAT

1. Login as `CRUSHER_OPERATOR` scoped to one crusher.
2. Open current operation date/shift and scoped crusher.
3. Verify only effective `SUBMITTED` assignments appear.
4. Tap one listed AA once → exactly one confirmed event and count +1.
5. Retry the exact same request ID → count must not increase again.
6. Simulate uncertain/failed browser response and retry the same AA → same request ID must be reused.
7. Tap an AA outside its valid assignment time → write rejected.
8. Open a historical/non-current context → read-only; backend write rejected.
9. Record Unlisted AA → event stored as unresolved/exception and not automatically mapped to QC.
10. Undo latest own event within 10 minutes → original retained + reversal event appended, net count reduced by 1.
11. Attempt double reversal → rejected.
12. Attempt Undo after configured window → rejected.
13. Attempt Crusher Operator access to crusher outside assigned scope → rejected.
14. Compare hourly and per-AA summary with event ledger net totals.

## 10. Validation conclusion

**Source-level Slice 05 validation: PASS with limitations noted above.**

The implementation is ready for dependency-aware typecheck/test, database migration on staging, and browser/API UAT. It is **not yet classified as production-ready** until those runtime checks are completed.
