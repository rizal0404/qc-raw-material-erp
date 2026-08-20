# Slice 01 Implementation Status — IAM/Auth v0.2.0

## Completed

- Shared auth/IAM contracts.
- Domain IAM ports, principal types, vendor/ crusher scope policy.
- Drizzle/PostgreSQL IAM repository adapter.
- `0001_iam_auth_hardening.sql`.
- Checksum SQL migration runner.
- Argon2id password hasher adapter with application pepper.
- Opaque session token + SHA-256 token persistence.
- Login/me/logout/logout-all/change-password APIs.
- Account lock, ACTIVE/DEACTIVATED, last login, session revoke.
- SUPERVISOR_ADMIN user administration APIs.
- Fastify role/vendor/crusher guards.
- Auth audit events.
- First-admin bootstrap CLI.
- React login page.
- Protected TanStack Router layout.
- Role-aware shell.
- Session-expiry redirect.
- Change-password page.
- Unit-test source for auth service and scope policies.
- IAM architecture/API documentation.

## Validation performed in this environment

- TypeScript/TSX syntax parse: PASS (50 source files parsed).
- `package.json` JSON parse: PASS.
- Source tree/diff review: PASS.

## Validation not executable in this environment

The runtime sandbox cannot download npm/pnpm dependencies or start the target PostgreSQL/Supabase environment. Therefore these remain UAT requirements after checkout:

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm db:migrate` against development PostgreSQL
5. `pnpm bootstrap:admin`
6. browser/API integration test
7. Vercel/VPS packaging check for the native Argon2 adapter

The password algorithm is behind a `PasswordHasher` port, so a runtime-specific adapter can be swapped without changing auth business logic if native packaging becomes a deployment constraint.

## Next slice

Slice 02 — Master Data:

- Vendor
- Equipment AM/AA
- Crusher
- Source/Block/Material Category
- Plant
- Pile
- lookup APIs
- admin tables/forms
- activation/deactivation and audit
