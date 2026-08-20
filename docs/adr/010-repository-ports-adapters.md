# ADR-010 — Repository Ports and Database Adapters


## Status
ACCEPTED

## Decision
Business/application services bergantung pada repository interfaces/ports, bukan query Drizzle langsung. Implementasi awal berada di `packages/db/src/repositories/postgres`.

Fastify route → application/domain service → repository port → Drizzle/PostgreSQL adapter.

Ini bukan abstraksi untuk mengganti SQL dengan database non-relasional; tujuannya membatasi coupling pada provider/ORM dan menjaga testability.
