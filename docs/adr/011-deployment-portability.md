# ADR-011 — Vercel/VPS Deployment Portability


## Status
ACCEPTED

## Decision
Satu codebase mendukung:
1. Vercel web + serverless API + Supabase pooler;
2. Vercel web + persistent API di VPS + Supabase/direct PostgreSQL;
3. full VPS/container + PostgreSQL managed/self-hosted.

Database connection strategy ditentukan melalui environment/deployment profile. Tidak ada deployment-specific business logic di domain layer.
