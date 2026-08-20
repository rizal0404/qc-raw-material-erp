# Architecture Decision Records

Status values: `PROPOSED`, `ACCEPTED`, `SUPERSEDED`, `REJECTED`.

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Modular monolith + pnpm monorepo | ACCEPTED |
| ADR-002 | API mid-layer; frontend never performs business CRUD directly to DB | ACCEPTED |
| ADR-003 | PostgreSQL portability with Supabase as initial provider | ACCEPTED |
| ADR-004 | Drizzle ORM + code-first migrations in Git | ACCEPTED |
| ADR-005 | Fastify REST API `/api/v1` + OpenAPI | ACCEPTED |
| ADR-006 | TanStack Router/Query/Table/Form frontend architecture | ACCEPTED |
| ADR-007 | Authentication session in application layer; role authorization server-side | ACCEPTED |
| ADR-008 | Operation date/time model for cross-midnight Shift 3 | ACCEPTED |
| ADR-009 | Retase event ledger is append-only with idempotency and reversal | ACCEPTED |
| ADR-010 | Repository ports/adapters isolate database implementation | ACCEPTED |
| ADR-011 | Deployment portability: Vercel or persistent VPS | ACCEPTED |
| ADR-012 | QC retase allocation uses exact event consumption | ACCEPTED |
