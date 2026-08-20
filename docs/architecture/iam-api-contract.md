# IAM API Contract — v0.2.0

Base URL: `/api/v1`

## POST `/auth/login`

Request:

```json
{"username":"qc.user","password":"************"}
```

Success `200`: session cookie + current user.

Important errors:

- `INVALID_CREDENTIALS`
- `USER_DEACTIVATED`
- `AUTH_LOCKED`

## GET `/auth/me`

Requires session cookie.

Success payload contains:

- user id/username/display name
- role
- vendor scope
- crusher scopes
- last login
- session expiry

## POST `/auth/logout`

Revokes current session and clears cookie.

## POST `/auth/logout-all`

Revokes all sessions for current user.

## POST `/auth/change-password`

```json
{"currentPassword":"...","newPassword":"..."}
```

All sessions are revoked; client must re-authenticate.

## IAM Admin

All endpoints below require `SUPERVISOR_ADMIN`.

### GET `/iam/users`

List user + active/deactivated status + last login + lock state + scopes.

### POST `/iam/users`

```json
{
  "username":"crusher.op1",
  "displayName":"Crusher Operator 1",
  "password":"<12+ chars>",
  "role":"CRUSHER_OPERATOR",
  "vendorId":null,
  "crusherIds":["<crusher-uuid>"]
}
```

### PATCH `/iam/users/:userId`

Change display name / role / access scope. Reason mandatory.

### PATCH `/iam/users/:userId/status`

Activate/deactivate user. Deactivation revokes sessions.

### PATCH `/iam/users/:userId/scopes`

Scope-only update. Sessions are revoked so new authorization takes effect on next login.

### POST `/iam/users/:userId/reset-password`

Administrator sets a replacement password. All target-user sessions are revoked.

## Standard error envelope

```json
{
  "ok": false,
  "code": "FORBIDDEN",
  "message": "Anda tidak memiliki akses untuk aksi ini.",
  "requestId": "..."
}
```
