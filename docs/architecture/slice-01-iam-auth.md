# Slice 01 — IAM / Authentication / RBAC

**Implementation version:** 0.2.0  
**Status:** IMPLEMENTED — requires dependency install + PostgreSQL runtime UAT

## Scope delivered

### Backend

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/iam/users` — SUPERVISOR_ADMIN
- `POST /api/v1/iam/users` — SUPERVISOR_ADMIN
- `PATCH /api/v1/iam/users/:userId` — access/profile update
- `PATCH /api/v1/iam/users/:userId/status`
- `PATCH /api/v1/iam/users/:userId/scopes`
- `POST /api/v1/iam/users/:userId/reset-password`

### Authentication model

1. Username dinormalisasi lowercase.
2. Password baru minimal 12 karakter.
3. Password hash memakai `PasswordHasher` port; adapter awal menggunakan Argon2id + application pepper.
4. Browser menerima random opaque session token melalui HttpOnly cookie.
5. Database hanya menyimpan SHA-256 token hash, bukan raw session token.
6. Session mempunyai absolute expiry, default 8 jam.
7. `last_seen_at` di-touch periodik, tetapi tidak memperpanjang absolute expiry.
8. 5 login gagal berturut-turut mengunci akun selama 15 menit (configurable).
9. User `DEACTIVATED` tidak dapat login dan session yang ada direvoke.
10. Ganti/reset password merevoke session existing.

## Authorization model

Role final:

- `VENDOR`
- `CRUSHER_OPERATOR`
- `QC_ANALYST`
- `SUPERVISOR_ADMIN`

Scope policy:

- VENDOR → hanya `vendor_id` miliknya.
- CRUSHER_OPERATOR → hanya crusher pada `user_crusher_scopes`.
- QC_ANALYST → global QC/vendor/ crusher read domain sesuai route business berikutnya.
- SUPERVISOR_ADMIN → global administrative scope.

Frontend state bukan sumber authorization. Setiap business route berikutnya wajib memakai `app.auth.requireRoles(...)` dan scope guard yang sesuai.

## Cookie/deployment rule

Default deployment menggunakan:

- HttpOnly
- SameSite=Lax
- Secure=true pada production

Rekomendasi production: frontend dan API diekspos dalam same-site topology/custom domain, misalnya:

- `qc.example.com`
- `qc.example.com/api/*` → reverse proxy ke API

atau subdomain yang tetap berada pada site yang sama. `SameSite=None` hanya diaktifkan secara eksplisit bersama `Secure=true`.

## CSRF/origin protection

Semua request `POST/PUT/PATCH/DELETE` yang memiliki header `Origin` diverifikasi terhadap `API_CORS_ORIGIN` allowlist. Ini menjadi defense tambahan di samping SameSite cookie.

## Bootstrap administrator

Setelah migration pada database baru:

```bash
BOOTSTRAP_ADMIN_USERNAME=admin \
BOOTSTRAP_ADMIN_DISPLAY_NAME="Supervisor Admin" \
BOOTSTRAP_ADMIN_PASSWORD="<strong-password>" \
PASSWORD_PEPPER="<secret-pepper>" \
DATABASE_URL="<postgres-url>" \
pnpm bootstrap:admin
```

Bootstrap ditolak bila tabel `users` sudah berisi user.

## Database delta

Migration `0001_iam_auth_hardening.sql`:

- `users.password_changed_at`
- canonical lowercase username CHECK
- VENDOR wajib mempunyai `vendor_id`
- session expiry/index hardening
- audit action index

## Audit events

- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `LOGIN_FAILED_UNKNOWN_USER`
- `LOGIN_BLOCKED_DEACTIVATED`
- `LOGOUT`
- `LOGOUT_ALL`
- `PASSWORD_CHANGED`
- `USER_CREATED`
- `USER_ACCESS_CHANGED`
- `USER_STATUS_CHANGED`
- `USER_SCOPE_CHANGED`
- `USER_PASSWORD_RESET`
- `BOOTSTRAP_ADMIN_CREATED`

## Frontend delivered

- `/login`
- protected pathless route `_authenticated`
- Home/session summary
- role-aware module strip
- logout
- `/security` change-password page
- global `qc:auth-expired` event → redirect login

## Required UAT

1. Bootstrap first `SUPERVISOR_ADMIN`.
2. Login valid.
3. Login wrong password 5x → account locked.
4. Locked account rejected sebelum expiry.
5. Deactivate user → existing session tidak dapat dipakai.
6. `GET /auth/me` tanpa cookie → 401 `AUTH_REQUIRED/AUTH_EXPIRED`.
7. Change password → cookie cleared + all sessions revoked.
8. Vendor user tidak dapat menembus vendor scope.
9. Crusher operator hanya lolos untuk crusher scope miliknya.
10. QC_ANALYST tidak dapat membuka IAM admin endpoints.
11. SUPERVISOR_ADMIN dapat create/update/deactivate/reset user.
12. Browser reload mempertahankan session selama cookie/session masih valid.

## Explicit non-goals Slice 01

- Forgot-password via email.
- MFA/TOTP.
- SSO/Google Identity.
- User hard-delete.
- Fine-grained capability matrix beyond current role/scopes.

User removal dilakukan secara logical melalui `DEACTIVATED`, bukan destructive delete.
