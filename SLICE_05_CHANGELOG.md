# Slice 05 Changelog — v0.6.0

## Added

- `packages/contracts/src/retase.ts`
- retase business-context utilities + tests
- full `RetaseEventRepository` port/adapter
- `0005_digital_retase_counter.sql`
- Fastify Digital Counter/Retase service + routes
- React `/retase-counter` page
- optimistic pending UI with server-confirmed counts
- Unlisted AA flow
- operator Undo Last / append-only reversal
- hourly, AA, Vendor, AM summary endpoints
- report/version/source/equipment snapshots on retase events
- Counter navigation for Crusher Operator and Supervisor/Admin
- Slice 05 architecture and API contract documentation

## Changed

- application version `0.5.0` → `0.6.0`
- API composition now registers Retase module
- Drizzle Retase schema aligned with Slice 05 event snapshots
- source of truth progression updated: Slice 06 Reconciliation is next

## Preserved

- migrations `0000`–`0004`
- Vendor Shift Report lifecycle and effective submitted behavior
- QC Core parity from Slice 03
- API mid-layer / PostgreSQL portability architecture

- Added configurable server-side undo window via `COUNTER_UNDO_MINUTES` (default 10 minutes).
