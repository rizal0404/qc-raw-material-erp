# Supabase Managed PostgreSQL Deployment

## Scope

Supabase is used as managed PostgreSQL. The React browser application continues to call the Fastify API; it does not query Supabase Data API directly and does not use Supabase Auth for the application IAM model.

One codebase and one ordered migration stream support all environments:

| Environment | Database | Purpose |
| --- | --- | --- |
| Local | Docker PostgreSQL 17 | Development and automated tests |
| Staging | Supabase `qc-rawmterial-codex` | Migration rehearsal and UAT |
| Production | A separately approved Supabase project | Controlled release after staging |

`qc-rawmaterial-erp` is explicitly out of scope because another application uses it.

## Connection variables

- `DATABASE_URL`: runtime Fastify connection.
- `DATABASE_TARGET`: `local` by default; set to `supabase` to select `SUPABASE_DATABASE_URL` without editing the local URL.
- `DATABASE_SSL`: set to `true` for Supabase.
- `DB_POOL_MAX`: per-process runtime pool limit. Start with `1` for serverless or a small value for a persistent API and tune against project connection limits.
- `SUPABASE_DATABASE_URL`: staging runtime/migration connection, kept alongside the local URL.
- `SUPABASE_DATABASE_SSL`: defaults to `true` in Supabase mode.
- `SUPABASE_DB_POOL_MAX`: defaults to `2` in Supabase mode.
- `SUPABASE_PROJECT_REF`: expected project-ref guard; staging uses `tejxcxlpoksittppontc`.
- `SUPABASE_API_PORT`: local staging API port; defaults to `3137` so Docker/local API can keep port `3000`.
- `SUPABASE_WEB_PORT`: local staging web port; defaults to `5174` so the local web app can keep port `5173`.
- `MIGRATION_DATABASE_URL`: direct or session-pooler connection used only by migration commands. Falls back to `DATABASE_URL` for local development.
- `MIGRATION_DATABASE_SSL`: set to `true` for Supabase migrations.
- `MIGRATION_EXPECTED_PROJECT_REF`: required operational guard for remote work. For the staging project, use `tejxcxlpoksittppontc`.

Use the direct connection for migrations when IPv6 is available. Use the Supabase session pooler on an IPv4-only network. Reserve the transaction pooler for serverless runtime traffic. Prepared statements are disabled by the database client for pooler compatibility.

## Staging migration procedure

Do not store the connection string or password in Git. In PowerShell, provide secrets through the process environment or a local ignored `.env` file:

```powershell
$env:MIGRATION_DATABASE_URL = '<Supabase direct or session-pooler connection string>'
$env:MIGRATION_DATABASE_SSL = 'true'
$env:MIGRATION_EXPECTED_PROJECT_REF = 'tejxcxlpoksittppontc'
pnpm db:migrate
pnpm db:verify
```

The runner prints only the host, port, database, and inferred project ref. It never prints credentials. A project-ref mismatch stops the command before any SQL is executed.

With the Supabase variables present in the ignored `.env`, use the target-specific commands:

```powershell
pnpm db:migrate:supabase
pnpm db:verify:supabase
pnpm dev:supabase
```

These commands select `SUPABASE_DATABASE_URL` only for their child process. The ordinary `pnpm dev`, `pnpm db:migrate`, and `pnpm db:verify` commands continue to use local Docker PostgreSQL.

`pnpm dev:supabase` starts the complete staging-connected app at `http://localhost:5174` with its API at `http://localhost:3137`. Use `pnpm dev:api:supabase` when only the API is needed.

After migration verification:

1. run Supabase security and performance advisors;
2. bootstrap a staging administrator with staging-only credentials;
3. start the API with the staging runtime connection;
4. run API smoke tests and UAT;
5. record backup and rollback steps before approving production.

## Staging deployment record

Staging project `qc-rawmterial-codex` (`tejxcxlpoksittppontc`) was bootstrapped on 2026-08-20. The application ledger contains all 12 reviewed migrations from `0000` through `0011`; the Supabase migration ledger contains the atomic bootstrap plus the two post-advisor hardening migrations.

On 2026-08-21, `SUPABASE_DATABASE_URL` was validated as the project Session Pooler connection, the first active `SUPERVISOR_ADMIN` was bootstrapped, and login plus `logout-all` passed through the Fastify API. The verification left zero active staging sessions. Credentials and session tokens are intentionally not recorded here.

Verification result:

- 26 application tables exist and all 26 have RLS enabled;
- `v_mix_summary` uses `security_invoker`;
- `touch_updated_at()` has a fixed `pg_catalog` search path;
- `anon`, `authenticated`, and `service_role` have no schema, relation, column, sequence, or function access to the application schema;
- Security Advisor has no warning/error findings;
- Performance Advisor has no unindexed-foreign-key findings.

The remaining advisor notices are expected for this architecture: RLS has no policies because the Data API is intentionally deny-all, and indexes are reported unused because the staging database has not received workload yet. Reassess unused indexes only after representative UAT traffic and query statistics exist.

The local `.env` remains configured for Docker PostgreSQL. Do not uncomment a remote `DATABASE_URL` there just to switch environments. Use `pnpm bootstrap:admin:supabase` only after configuring staging-only `BOOTSTRAP_ADMIN_*` values.

## Security model

Migration `0009_supabase_api_security.sql` enables RLS on all application tables, changes `v_mix_summary` to `security_invoker`, and removes privileges from `anon`, `authenticated`, and `service_role` when those roles exist. This keeps the migration portable on ordinary PostgreSQL while closing Supabase Data API access.

Migration `0010_secure_function_search_path.sql` fixes the trigger function search path. Migration `0011_index_foreign_keys.sql` adds covering indexes to foreign keys that were not already covered by an existing leading index.

If direct browser access is introduced later, do not simply restore broad grants. Define the exact Data API surface and add table-specific grants plus ownership-aware RLS policies in a new reviewed migration.
