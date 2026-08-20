# QC Raw Material — Native Web

Full native web replacement untuk QC Raw Material yang sebelumnya berjalan pada Google Apps Script/Google Sheets.

**Current implementation:** `v0.7.0` — Foundation + Slice 01 IAM/Auth + Slice 02 Master Data + Slice 03 QC Core Parity + Slice 04 Vendor Shift Report + Slice 05 Digital Retase Counter + Slice 06 QC Reconciliation & Retase Mapping.

## Target architecture

- **Frontend:** React + Vite + TypeScript + TanStack Router/Query/Table/Form
- **Backend:** Fastify + TypeScript, versioned REST API
- **Database:** PostgreSQL, initial provider Supabase
- **ORM/schema:** Drizzle ORM
- **Migrations:** reviewed SQL + checksum migration ledger
- **Repository style:** pnpm monorepo / modular monolith
- **Deployment:** Vercel dan/atau VPS/container
- **Timezone operasi:** Asia/Makassar

## Repository layout

```text
apps/
  web/                  React/Vite frontend
  api/                  Fastify API
packages/
  contracts/            API/domain contracts shared FE-BE
  domain/               business ports/policies; no DB dependency
  db/                   Drizzle schema, repository adapters, migrations
  ui/                   reusable UI primitives placeholder
  config/               shared config/types
  test-utils/           shared test fixtures placeholder
docs/
  adr/                   Architecture Decision Records
  prd/                   Source of truth product docs
  architecture/          implementation notes / slice status
infra/
  docker/                local PostgreSQL / deployment helpers
  vercel/                deployment notes
.github/workflows/       CI skeleton
```

## Implemented now

### Foundation

- PostgreSQL native schema;
- initial canonical shift/crusher seed;
- Fastify API shell `/api/v1`;
- React/Vite/TanStack shell;
- repository/domain boundaries;
- Docker PostgreSQL local setup;
- CI skeleton.

### Slice 01 — IAM/Auth

- username/password login;
- Argon2id password adapter + application pepper;
- active/deactivated user status;
- failed-login lock;
- last login;
- opaque HttpOnly session cookie;
- server-side RBAC;
- vendor scope;
- crusher scope;
- logout/logout-all/change-password;
- SUPERVISOR_ADMIN user-management API;
- login/session audit events;
- React login/protected route/security page.

Detailed implementation: `docs/architecture/slice-01-iam-auth.md`.

### Slice 02 — Master Data

- Vendor master + normalized vendor aliases;
- Equipment AM/AA per vendor;
- canonical Crusher master;
- Source / Block / Material Category;
- Plant and Pile;
- shared active lookup APIs for forms;
- server-side uniqueness and referential validation;
- ACTIVE/INACTIVE lifecycle without destructive delete;
- audit log for create/update/status changes;
- Supervisor/Admin Master Data workspace using TanStack Table;
- User Management UI integrated with Vendor and Crusher scopes.

Detailed implementation: `docs/architecture/slice-02-master-data.md`.


### Slice 03 — Raw Samples + QC Core Parity

- unified native Raw Samples for Limestone/Clay;
- chemistry formulas LSF/SM/AM/NaEq/R2O3;
- V2.8-compatible weighted chemistry aggregation;
- configurable Ton/Retase rule engine with legacy baseline seed;
- native QC Workbench: Load/New/Recall/Save/Replace;
- structured chemistry snapshot revision history;
- derived Mix Summary;
- Pile Cumulative;
- QAF daily view;
- parity fixture tests and migration `0003_qc_core_parity.sql`;
- React Raw Samples, Workbench, and QC Reports pages.

Detailed implementation: `docs/architecture/slice-03-qc-core-parity.md`.
API contract: `docs/architecture/qc-core-api-contract.md`.


### Slice 04 — Vendor Shift Report

- native Draft → Reload → Edit → Submit workflow;
- deterministic current report query by Vendor + Operation Date + Shift;
- fleet AM/AA balance validation;
- structured AM → AA loading assignments;
- Shift 3 cross-midnight assignment windows;
- revision versioning with previous SUBMITTED report retained until the new revision is submitted;
- Vendor scope enforcement and audit trail.

Detailed implementation: `docs/architecture/slice-04-vendor-shift-report.md`.
API contract: `docs/architecture/vendor-shift-report-api-contract.md`.


### Slice 05 — Digital Retase Counter

- effective SUBMITTED Vendor Shift Report assignments as counter source;
- current business date/shift derived server-side in Asia/Makassar;
- role + Crusher-scope enforcement;
- one AA tap = one DUMP +1 event;
- UUID `request_id` idempotency;
- large touch-card UI with pending/confirmed/failed states;
- Unlisted AA exception flow;
- append-only reversal with operator Undo Last <= 10 minutes;
- hourly / AA / AM / Vendor retase summaries;
- migration `0005_digital_retase_counter.sql`.

Detailed implementation: `docs/architecture/slice-05-digital-retase-counter.md`.
API contract: `docs/architecture/retase-counter-api-contract.md`.


### Slice 06 — QC Reconciliation + Retase Mapping

- assignment-level observed / reserved / remaining retase reconciliation;
- Sample_ID candidate rule based on Operation Date + Material Kind + authoritative Vendor;
- UNMAPPED / SUGGESTED / AMBIGUOUS / CONFIRMED / CONSUMED / REVIEW_REQUIRED lifecycle;
- QC allocation and confirmation with ambiguity reason requirement;
- manual resolution of EXCEPTION_UNASSIGNED / AMBIGUOUS DUMP events to a valid effective assignment;
- Workbench mapped-retase suggestion and controlled Apply;
- exact DUMP-event binding when Mix is saved;
- double-consumption protection through active-event bridge uniqueness;
- controlled Mix Replace releases old event bindings transactionally and preserves history;
- upstream report/reversal drift detection;
- Asia/Makassar browser business-date defaults.

Detailed implementation: `docs/architecture/slice-06-qc-reconciliation-retase-mapping.md`.
API contract: `docs/architecture/reconciliation-api-contract.md`.
Migration: `packages/db/migrations/0006_qc_reconciliation_retase_mapping.sql`.

## First local bootstrap

1. Install Node.js and pnpm.
2. Copy `.env.example` → `.env`.
3. Set at minimum:
   - `DATABASE_URL`
   - `PASSWORD_PEPPER`
   - `BOOTSTRAP_ADMIN_PASSWORD`
4. Start PostgreSQL, for example:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

5. Install dependencies:

```bash
pnpm install
```

6. Apply migrations:

```bash
pnpm db:migrate
```

7. Create first administrator. Example Linux/macOS:

```bash
BOOTSTRAP_ADMIN_USERNAME=admin \
BOOTSTRAP_ADMIN_DISPLAY_NAME="Supervisor Admin" \
BOOTSTRAP_ADMIN_PASSWORD="<strong-password>" \
pnpm bootstrap:admin
```

On Windows/PowerShell, set environment variables first or configure them in the process environment before running the command.

8. Start API + web:

```bash
pnpm dev
```

Default local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- API docs: `http://localhost:3000/docs`

## Migration policy

`pnpm db:migrate` applies numbered SQL files atomically and records SHA-256 checksums in `app_schema_migrations`. `pnpm db:verify` confirms the complete ledger, RLS coverage, protected view configuration, and closed Supabase Data API access.

A migration that has already been applied must never be edited. Create a new migration instead.

For a managed Supabase deployment, keep one application codebase and select the database through environment variables. Use `MIGRATION_DATABASE_URL` for controlled schema deployment, set `MIGRATION_DATABASE_SSL=true`, and set `MIGRATION_EXPECTED_PROJECT_REF` so a command cannot target a different Supabase project accidentally. See `docs/deployment/supabase-managed-postgres.md`.

## Security notes

- Password plaintext is never stored.
- Raw session token is never stored in PostgreSQL; only its SHA-256 hash is persisted.
- `PASSWORD_PEPPER` must remain outside repository/source control.
- Browser code never receives `DATABASE_URL`, Supabase secret/service-role keys, or direct access to application tables.
- Production should use HTTPS + `SESSION_COOKIE_SECURE=true`.
- Prefer frontend/API deployment under a same-site domain/reverse proxy.
- User removal uses `DEACTIVATED`; no destructive user delete in the MVP.

## Source of truth

- `docs/prd/full_web_app_PRD.md`
- `docs/prd/implementation_plan_full_native_web.md`
- `docs/adr/`
- `docs/architecture/next-implementation-slices.md`

Any architecture change that alters these boundaries should be accompanied by an ADR or explicit PRD revision.

## Next slice

**Slice 07 — Operational Reporting + Audit Explorer:** consolidate Vendor/Counter/Reconciliation/QC traceability into management and operational views, then prepare staging migration/UAT hardening.
