# ADR-003 — Portable PostgreSQL, Supabase Initial Provider


## Status
ACCEPTED

## Decision
Gunakan feature PostgreSQL standar yang tersedia luas. Hindari ketergantungan wajib pada Supabase-specific Data API/Edge Functions untuk core business path. UUID, JSONB, timestamptz, constraints, indexes, and transactional SQL diperbolehkan.

Supabase digunakan pertama sebagai managed PostgreSQL. Provider-specific infrastructure boleh digunakan hanya di adapter/infrastructure layer dan harus memiliki fallback/exit plan.
