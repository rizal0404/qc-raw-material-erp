# Slice 03 Validation Report

**Version:** v0.4.0  
**Date:** 2026-08-20

## Static checks executed

- PASS: 80 TS/TSX files scanned; generated import exemptions = 1.
- PASS: 16 JSON files parsed.
- PASS: legacy chemistry and weighted-mix fixture values verified independently.
- PASS: migration `0003_qc_core_parity.sql` structural markers and safe location constraint present.
- PASS: migration files `0000`–`0002` are byte-identical to v0.3.0 (immutable migration policy preserved).
- PASS: 15 QC route → service calls resolved in source.
- PASS: 17 QC repository port methods resolved in the PostgreSQL adapter source.
- PASS: TypeScript parser found 0 syntax diagnostics. Dependency-resolution diagnostics are expected because `node_modules` is not installed in this workspace.

## Runtime checks not executed

The workspace does not currently contain installed project dependencies or a PostgreSQL runtime. Therefore these remain mandatory staging gates:

- `pnpm install`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:migrate` against PostgreSQL/Supabase staging
- Fastify API integration tests
- Vite/TanStack build and generated route tree
- Browser UAT

A `routeTree.gen` relative import is intentionally exempt from the source-file existence scan because TanStack Router generates that file during the normal toolchain step.
