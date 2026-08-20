# ADR-005 — Fastify REST API + OpenAPI


## Status
ACCEPTED

## Decision
Gunakan Fastify TypeScript sebagai HTTP API. Endpoints versioned di `/api/v1`. Request/response divalidasi dengan schema; OpenAPI dihasilkan dari contract/schema layer.

Error menggunakan normalized envelope dengan stable `code`, safe `message`, and request id. Internal stack traces tidak dikirim ke client production.
