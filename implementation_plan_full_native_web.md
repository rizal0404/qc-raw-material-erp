# IMPLEMENTATION PLAN — QC Raw Material Full Native Web

**Companion document:** `full_web_app_PRD.md`  
**Target:** React/Vite/TanStack frontend + Fastify API + portable PostgreSQL  
**Initial DB provider:** Supabase PostgreSQL  
**Repository:** GitHub monorepo  
**Deployment:** Vercel and/or VPS

---

# 1. Prinsip Implementasi

1. Jangan rewrite seluruh domain sekaligus.
2. Pindahkan fungsi existing melalui parity test.
3. Backend contract dibuat sebelum page mengandalkan data tersebut.
4. Frontend tidak mengakses database langsung.
5. Setiap feature dikembangkan sebagai vertical slice, tetapi workstream frontend dan backend dipisah.
6. Database migration selalu berada di Git.
7. UAT dilakukan per module sebelum cutover.

---

# 2. Workstream A — Frontend UI/UX

## A0. Bootstrap Frontend

### Scope

- React + TypeScript + Vite.
- TanStack Router file-based routing.
- TanStack Query provider.
- TanStack Form.
- TanStack Table.
- UI primitives/design system.
- app shell + responsive navigation.
- API client wrapper.
- auth bootstrap.
- global error boundary/toast/dialog.
- test skeleton.

### Deliverable

```text
apps/web
packages/ui
packages/contracts client types
```

### Exit Gate

- build pass;
- typecheck pass;
- login route render;
- protected route guard works with mocked API.

---

## A1. Authentication UI & Role Navigation

### Pages

- Login
- Change Password
- Session Expired
- Forbidden

### UX

- no user enumeration from login error;
- loading state;
- lockout feedback generic;
- navigation generated from role capability map;
- session refresh from `/auth/me`.

### Exit Gate

E2E mocked/real staging login for all four roles.

---

## A2. QC Core UI Parity

### Raw Sample

- sample list;
- create/edit/import flow;
- LS/CL filters.

### Workbench

- header;
- Load Samples;
- sample table;
- retase;
- Ton/Retase;
- mapped retase placeholder;
- quality values;
- New Mix;
- Recall/Edit;
- Save/Replace;
- oxide detail/edit dialog;
- audit history.

### UX parity requirements

- keyboard grid navigation;
- paste numeric data where useful;
- clear dirty state;
- route leave warning;
- save response hydrates canonical server state.

### Exit Gate

Business user can reproduce selected legacy Mix_ID result within parity tolerance.

---

## A3. Vendor Shift Report UI — IMPLEMENTED v0.5.0

### Page structure

- date/shift selector;
- status/version banner;
- fleet AM summary;
- fleet AA summary;
- assignment cards;
- searchable AM;
- searchable AA multi-select;
- source/block/material/crusher;
- draft/save/submit/revision.

### Critical implementation

Query key includes:

```text
vendor + operation_date + shift
```

After Save Draft:

- use server-returned report object;
- update query cache;
- retain `report_id` and `version`;
- refetch current report as consistency check in staging tests.

### Exit Gate

Save Draft → reload browser → same draft appears → edit → Submit.

---

## A4. Retase Counter UI — IMPLEMENTED v0.6.0

### Layout

- current operation context;
- crusher selector restricted by role;
- vendor groups;
- AM assignment cards;
- AA large buttons;
- confirmed count;
- pending count;
- latest event;
- search AA;
- Undo Last;
- Unlisted AA.

### State model

```text
confirmed from server
+
pending local mutation
```

### Exit Gate

- 1 tap 1 confirmed event;
- duplicate retry safe;
- network failure visible;
- reversal visible;
- no hidden count mutation.

---

## A5. Reconciliation UI — IMPLEMENTED v0.7.0

### Grid

- date/shift/crusher/vendor filters;
- assignment summary;
- observed/allocated/remaining;
- candidate sample;
- ambiguity badge;
- confirm allocation;
- event drilldown.

### Exit Gate

QC can resolve ambiguous sample and prepare mapped retase without editing DB manually.

---

## A6. Reporting + Administration UI

### Reporting

- Mix Summary
- Pile Cumulative
- QAF
- operations dashboard
- hourly retase
- traceability drawer/page

### Administration

- users
- vendors
- equipment
- crushers
- sources
- plants/piles
- quality targets
- Ton/Retase rules
- audit

### Exit Gate

All existing routine spreadsheet report needs have native page/export equivalent.

---

## A7. Frontend Hardening

- WCAG/accessibility review;
- responsive/mobile review;
- performance profiling;
- query caching policy review;
- route-level code splitting;
- large table virtualization only where required;
- offline/PWA counter queue P1;
- Playwright regression suite.

---

# 3. Workstream B — Backend/API/Database

## B0. Repository + Runtime Foundation

### Setup

- pnpm workspace;
- `apps/api` Fastify;
- config validation;
- request ID;
- logger;
- normalized errors;
- OpenAPI;
- health/version;
- Docker local PostgreSQL;
- Drizzle migrations.

### Exit Gate

`pnpm dev`, migration, API health, CI all pass.

---

## B1. IAM & Security

### Database

- users;
- user_crusher_scopes;
- sessions;
- audit.

### API

- login;
- logout;
- me;
- password change;
- user admin.

### Controls

- Argon2id;
- HttpOnly sessions;
- disabled user;
- failed login lock;
- role guard;
- vendor scope;
- crusher scope;
- rate limit.

### Exit Gate

Security negative tests pass.

---

## B2. Master Data

Implement:

- vendor + aliases;
- equipment;
- crusher;
- source;
- plant;
- pile;
- shifts;
- Ton/Retase rules;
- quality targets.

Seed canonical crushers and shift rules.

### Exit Gate

Admin CRUD + integrity constraints pass.

---

## B3. Raw Samples + Mixing Core

### Database

- raw_samples;
- mixes;
- mix_items;
- mix_item_chemistry_revisions.

### Domain

- LSF;
- SM;
- AM;
- NaEq;
- R2O3;
- tonnage;
- weighted chemistry;
- Mix_ID builder;
- LS Batch_No / CL Tiang_ke rules.

### Reporting core

- mix summary query/view;
- pile cumulative;
- QAF grouping.

### Exit Gate

Automated parity suite against exported legacy dataset passes.

---

## B4. Vendor Shift Report Backend — IMPLEMENTED v0.5.0

### Database

- vendor_shift_reports;
- loading_assignments;
- loading_assignment_aas.

### Services

- get current report;
- save draft;
- submit;
- create revision;
- fleet balance;
- overlap validation;
- overnight assignment handling.

### Critical tests

- Date as PostgreSQL `date`;
- Shift 3 business date;
- draft load after save;
- submitted report lookup.

### Exit Gate

API integration test reproduces previous issue scenario and proves it fixed by design.

---

## B5. Retase Ledger Backend — IMPLEMENTED v0.6.0

### Database

- retase_events.

### Services

- counter bootstrap;
- assignment lookup;
- record dump;
- idempotent retry;
- reversal;
- unlisted AA;
- hourly aggregation.

### Concurrency

- unique request ID;
- transaction;
- no destructive update.

### Exit Gate

Concurrent duplicate tests and reversal tests pass.

---

## B6. Reconciliation Backend — IMPLEMENTED v0.7.0

### Database

- qc_retase_allocations.

### Logic

- assignment resolution;
- vendor-based Sample_ID candidate;
- ambiguous/unmapped;
- observed/allocated/remaining;
- confirmation;
- review required;
- consumption transaction.

### Exit Gate

Double consumption impossible under concurrent test.

---

## B7. Reporting/Audit Backend

- mix summary endpoint;
- QAF;
- pile cumulative;
- operations KPIs;
- hourly retase;
- audit explorer;
- traceability endpoint;
- CSV export support.

### Exit Gate

Reports agree with validated migration dataset.

---

## B8. Migration Tooling

### Extract

- Google Sheet/export files;
- V3 operational sheets;
- master;
- users metadata.

### Transform

- dates;
- aliases;
- vendor IDs;
- equipment IDs;
- plant/pile IDs;
- chemistry precision.

### Load

- staging database;
- validation reports;
- repeatable scripts.

### User migration

Default force password reset unless legacy hash compatibility is explicitly verified.

### Exit Gate

Migration can be rerun from clean database with deterministic result.

---

## B9. Production Hardening

- query/index profiling;
- backup/restore drill;
- connection pool profile for Vercel/VPS;
- load test counter;
- dependency/security scan;
- audit retention;
- production migration runbook;
- rollback runbook.

---

# 4. Cross-Workstream Vertical Delivery

## Slice 1 — Platform

Backend B0/B1 + Frontend A0/A1.

## Slice 2 — QC Core

Backend B2/B3 + Frontend A2.

This harus selesai sebelum Vendor/Counter dianggap production-ready karena menjadi target akhir retase.

## Slice 3 — Vendor

Backend B4 + Frontend A3.

## Slice 4 — Counter

Backend B5 + Frontend A4.

## Slice 5 — Reconciliation

Backend B6 + Frontend A5.

## Slice 6 — Reports/Admin

Backend B7 + Frontend A6.

## Slice 7 — Migration/Cutover

Backend B8/B9 + Frontend A7.

---

# 5. Git Branch / Delivery Rules

Recommended:

```text
main          production-ready
feature/*     short-lived feature branches
fix/*         bug fixes
chore/*       infra/tooling
```

PR mandatory for production-affecting changes.

Required checks:

- lint;
- typecheck;
- tests;
- build;
- migration check.

---

# 6. Environment Strategy

## Local

- Docker Postgres;
- local API;
- local Vite.

## Staging

- separate Supabase project/database;
- staging web/api deployment;
- seeded non-production data.

## Production

- separate credentials;
- controlled migration;
- backup before migration;
- production monitoring.

---

# 7. Recommended First Coding Sprint

Do **not** start with dashboard.

Start with:

1. monorepo;
2. local Postgres;
3. migration framework;
4. API health/OpenAPI;
5. user/session schema;
6. login endpoint;
7. React app shell;
8. login page;
9. `/auth/me` route guard;
10. seed roles/shifts/crushers;
11. CI pipeline.

Second sprint should implement raw sample + mix calculation parity.

---

# 8. Exit Criteria Before Production Cutover

- all P0 acceptance criteria in PRD pass;
- parity test signed off;
- selected pilot completed;
- no unresolved critical security finding;
- backup/restore verified;
- rollback documented;
- staging → production deployment rehearsed;
- business owner approves native app as authoritative source.


## Slice 05 Native Counter Status

**Implemented in source v0.6.0.** Frontend A4 + Backend B5 are now represented by:

- `/retase-counter`;
- `/counter/context`;
- `/counter/assignments`;
- `POST /retase-events`;
- reversal endpoint;
- event list + summary;
- migration `0005_digital_retase_counter.sql`.

## Slice 06 Reconciliation + Retase Mapping Status

**Implemented in source v0.7.0.** Frontend A5 + Backend B6 are now represented by:

- `/reconciliation`;
- assignment observed/reserved/remaining read model;
- Vendor-based Sample_ID candidates;
- exception-event resolution;
- retase allocation create/update/confirm;
- Workbench mapped-retase suggestions and Apply;
- event-level consumption bridge tables;
- atomic Mix save/replace consumption protection;
- drift/reversal `REVIEW_REQUIRED` handling;
- migration `0006_qc_reconciliation_retase_mapping.sql`.

Next delivery slice is **Operational Reporting + Audit Explorer**, followed by migration/cutover hardening.
