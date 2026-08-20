# ADR-002 — API Mid-Layer as Business Boundary


## Status
ACCEPTED

## Context
Target database awal Supabase PostgreSQL, tetapi aplikasi harus dapat pindah ke PostgreSQL managed/self-hosted lain. Browser-to-database CRUD akan mengikat frontend ke provider/schema dan menyebarkan business rules ke client.

## Decision
Frontend hanya berkomunikasi dengan versioned HTTP API `/api/v1`. API menjadi authoritative boundary untuk validation, authorization, transactions, audit, idempotency, and business rules. Tidak ada direct business CRUD dari browser ke Supabase tables.

## Consequences
- database provider dapat diganti di backend;
- RBAC dan audit terpusat;
- frontend contracts lebih stabil;
- terdapat tambahan runtime hop, tetapi trade-off diterima.
