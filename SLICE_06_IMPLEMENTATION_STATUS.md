# Slice 06 Implementation Status — v0.7.0

## Overall status

| Area | Status |
|---|---|
| Source implementation | DONE |
| Database migration source | DONE |
| Reconciliation API | DONE |
| Exception resolution | DONE |
| Workbench mapped-retase integration | DONE |
| Exact event consumption / no-double-use controls | DONE |
| React reconciliation UI | DONE |
| Static syntax/import/structure validation | PASS |
| Runtime business-date/shift smoke tests | PASS |
| `pnpm install/typecheck/test/build` in full project runtime | PENDING |
| PostgreSQL/Supabase migration execution | PENDING |
| Browser/API staging UAT | PENDING |
| Production ready | NO — staging/UAT required |

## Delivered scope

### Backend / domain

- `ReconciliationRepository` domain port and PostgreSQL adapter.
- assignment reconciliation read model;
- Sample_ID candidate matching by authoritative Vendor;
- allocation create/update/confirm;
- server-derived exception assignment candidates;
- exception DUMP resolution without destructive event replacement;
- drift detection to `REVIEW_REQUIRED`;
- Workbench suggestion query;
- exact event consumption integrated into Mix Save/Replace transactions;
- controlled application errors for retase allocation conflicts.

### Database

Migration `0006_qc_reconciliation_retase_mapping.sql` adds:

- retase event resolution metadata;
- allocation review/consumption metadata;
- `qc_retase_allocation_events`;
- `mix_item_retase_allocations`;
- partial unique indexes for open allocation and active consumption integrity.

### Frontend

- `/reconciliation` page;
- assignment filters and KPI summary;
- observed/reserved/remaining reconciliation table;
- Map/Review modal;
- Sample_ID candidate detail;
- assignment event drill-down;
- unassigned/ambiguous exception table;
- exception resolution modal;
- Workbench Mapped Retase/Apply integration;
- mapped-retase override reason handling;
- WITA-native date defaults.

## Key integrity decisions

1. Counter events never auto-write directly to Mix.
2. QC confirmation is required before mapped retase is offered to Workbench.
3. Candidate matching currently follows OD-06: Vendor is authoritative.
4. One assignment may allocate retase to multiple Sample_IDs.
5. Mix Save consumes exact underlying DUMP events, not only an aggregate number.
6. An active DUMP event can be bound only once.
7. Final Retase below approved mapping requires reason; above approved mapping is rejected.
8. A confirmed mapping cannot be silently bypassed as manual Retase.
9. Vendor report revision or downstream-invalidating reversal does not rewrite history; it flags review.
10. Mix Replace releases and rebinds consumption inside a controlled transaction.

## Known runtime work before staging approval

The execution environment used to assemble this source does not contain project `node_modules`, pnpm runtime, or a PostgreSQL/Supabase instance. Therefore the following still must be executed in a real development/staging environment:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm build
```

Then run API/browser UAT against PostgreSQL/Supabase staging.

## Required UAT scenarios

1. one Vendor candidate → `SUGGESTED`;
2. zero candidate → `UNMAPPED`;
3. multiple candidates → `AMBIGUOUS`;
4. multiple-candidate confirm without reason → rejected;
5. split one assignment across two Sample_IDs;
6. approved total > remaining → rejected;
7. confirmed allocation appears in Workbench;
8. confirmed mapping bypassed as manual → rejected;
9. final Workbench Retase below approved without reason → rejected;
10. final Workbench Retase above approved → rejected;
11. two Mix saves cannot consume the same DUMP event;
12. Mix Replace releases/rebinds exact events correctly;
13. exception event can resolve only to backend candidate assignment;
14. Vendor report revision → allocation `REVIEW_REQUIRED`;
15. Crusher Operator reversal of consumed event → rejected;
16. Supervisor reversal of consumed event → downstream review flag;
17. Shift 3 cross-midnight event/candidate resolution;
18. recall saved Mix shows mapped consumption linkage.

## Next slice

**Slice 07 — Operational Reporting + Audit Explorer.**
