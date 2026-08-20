# Next Implementation Slices

## Slice 0 — Foundation validation
**Status: IMPLEMENTED in skeleton; runtime environment validation pending.**

- repository/monorepo structure;
- PostgreSQL schema + migration baseline;
- Fastify health/version API;
- React/Vite/TanStack shell;
- CI skeleton.

## Slice 1 — IAM
**Status: IMPLEMENTED v0.2.0; DB/browser UAT pending.**

Backend:
- Argon2id adapter behind `PasswordHasher` port;
- login/logout/logout-all/me/change-password;
- opaque session cookie;
- account lock + active/deactivated status + last login;
- server-side role/vendor/crusher guards;
- administrative user lifecycle without hard delete;
- audit events;
- bootstrap first SUPERVISOR_ADMIN.

Frontend:
- login page;
- protected route;
- role navigation shell;
- session-expired redirect;
- logout;
- change password.

See `slice-01-iam-auth.md`.

## Slice 2 — Master data
**Status: IMPLEMENTED v0.3.0; DB/browser UAT pending.**

Backend:
- Vendor + normalized aliases;
- Equipment AM/AA;
- Crusher;
- Source/Block/Material Category;
- Plant;
- Pile;
- lookup endpoints optimized for forms;
- activation/deactivation + audit;
- case-insensitive uniqueness and referential validation.

Frontend:
- Supervisor/Admin Master Data workspace;
- TanStack Table + filter/search;
- create/edit dialogs;
- dependent vendor → equipment filtering;
- IAM User Management integrated with vendor/ crusher scopes.

See `slice-02-master-data.md`.

## Slice 3 — Raw Samples + QC Core parity
**Status: IMPLEMENTED v0.4.0; PostgreSQL/API/browser UAT pending.**

Backend/database:
- unified Raw Samples for LS/CL;
- legacy sample fields and import API;
- LSF/SM/AM/NaEq/R2O3 parity formulas;
- ordered Ton/Retase rule engine;
- native Workbench New/Load/Recall/Save/Replace;
- immutable Raw chemistry + structured Mix chemistry revisions;
- Mix Summary derived view;
- Pile Cumulative and QAF APIs;
- legacy parity fixtures.

Frontend:
- Raw Samples workspace;
- QC Workbench with keyboard/paste UX;
- chemistry snapshot editor/revision history;
- Mix Summary / Pile Cumulative / QAF views.

See `slice-03-qc-core-parity.md` and `qc-core-api-contract.md`.

## Slice 4 — Vendor Shift Report — DONE (v0.5.0)
Implemented:
- deterministic current-report query key `(vendor, operation_date, shift)`;
- draft save/reload/edit;
- submit;
- revision history;
- effective submitted version retained while revision draft exists;
- AM/AA overlap validation;
- Shift 3 cross-midnight window handling.

See `slice-04-vendor-shift-report.md` and `vendor-shift-report-api-contract.md`.

## Slice 5 — Digital Counter — DONE (v0.6.0)
Implemented:
- effective SUBMITTED assignments;
- scoped Crusher context;
- server business-date/shift resolution;
- idempotent DUMP +1 event;
- optimistic pending + server-confirmed counter UI;
- operator Undo Last within 10 minutes;
- append-only REVERSAL -1;
- Unlisted AA exception/ambiguity handling;
- hourly and entity summaries.

See `slice-05-digital-retase-counter.md` and `retase-counter-api-contract.md`.

## Slice 6 — QC Reconciliation + Retase Mapping — DONE (v0.7.0)
Implemented:
- assignment-level observed/reserved/remaining reconciliation;
- Vendor-based Sample_ID candidates for the same Operation Date + Material Kind;
- UNMAPPED/SUGGESTED/AMBIGUOUS/CONFIRMED/CONSUMED/REVIEW_REQUIRED lifecycle;
- QC allocation + confirm with server-side capacity locking;
- reason mandatory when confirming one of multiple sample candidates;
- manual resolution of EXCEPTION_UNASSIGNED/AMBIGUOUS DUMP events to valid effective assignments;
- confirmed allocation suggestions in QC Workbench;
- exact retase-event binding inside the Mix Save transaction;
- event/allocation active-link uniqueness to prevent double consumption;
- controlled Mix Replace release/rebind without destructive history loss;
- reversal/upstream-revision drift → REVIEW_REQUIRED;
- server-side prevention of bypassing confirmed mapped retase in Workbench;
- WITA business-date defaults in QC frontend pages.

See `slice-06-qc-reconciliation-retase-mapping.md` and `reconciliation-api-contract.md`.

## Slice 7 — Operational Reporting + Audit Explorer — NEXT
Backend:
- cross-domain operations dashboard read models;
- Vendor submission status, AM/AA availability, retase, exception, mapping, and consumption metrics;
- Mix → Sample → Allocation → Assignment → AM/AA → DUMP event trace endpoint;
- generic audit explorer filters and entity history;
- export contracts and report-query performance indexes.

Frontend:
- operations dashboard;
- traceability explorer;
- audit explorer;
- export/download actions;
- role-aware management views.

After Slice 7: staging migration, legacy-data import validation, parallel-run UAT, performance/security hardening, and production deployment preparation.
