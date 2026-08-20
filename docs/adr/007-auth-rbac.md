# ADR-007 — Application Session + Server-Side RBAC


## Status
ACCEPTED

## Context
Legacy V3 menggunakan username/password dan empat roles: VENDOR, CRUSHER_OPERATOR, QC_ANALYST, SUPERVISOR_ADMIN.

## Decision
Pertahankan business identity model tersebut pada MVP native web. Password disimpan sebagai strong salted password hash; application pepper berasal dari secret environment. Session memakai opaque random token, hash token disimpan di database, browser menerima secure HttpOnly cookie.

Authorization selalu server-side. Role/capability client hanya untuk navigation rendering. Vendor and crusher scope diverifikasi ulang pada setiap protected write/read operation.

## Implementation note — v0.2.0

- Password algorithm is exposed through a `PasswordHasher` domain port. Initial adapter: `@node-rs/argon2` Argon2id. This avoids coupling the domain/service to one native package and permits replacement if a future runtime has packaging constraints.
- Raw opaque session token is never persisted; only SHA-256 token hash is stored.
- Hard delete for application users is intentionally excluded; `DEACTIVATED` is the operational removal mechanism.
- Production topology should prefer same-site frontend/API routing. Cross-site cookie mode is configuration, not the default architecture.
