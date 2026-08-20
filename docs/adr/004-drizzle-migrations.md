# ADR-004 — Drizzle ORM + Git-Tracked SQL Migrations


## Status
ACCEPTED

## Decision
Drizzle TypeScript schema adalah application schema source. Perubahan schema menghasilkan migration SQL yang direview dan disimpan di Git. `push` tidak digunakan untuk production schema management.

Initial migration disediakan sebagai reviewed SQL bootstrap. Future change: edit Drizzle schema → `drizzle-kit generate` → review SQL → migration check → apply staging → production.
