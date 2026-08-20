# ADR-001 — Modular Monolith + pnpm Monorepo


## Status
ACCEPTED

## Context
Aplikasi mencakup QC core, vendor operations, retase, reconciliation, reporting, IAM, dan administration. Memecahnya menjadi microservices pada fase awal meningkatkan distributed-system overhead tanpa kebutuhan scaling yang terukur.

## Decision
Gunakan **modular monolith** dalam satu repository pnpm workspace. Runtime utama hanya dua deployable: `apps/web` dan `apps/api`. Domain business dipisah melalui package/module boundaries.

## Consequences
- transaksi lintas domain masih dapat dilakukan atomik di satu PostgreSQL;
- deployment sederhana;
- module dapat diekstrak menjadi service terpisah jika profiling/operational need membuktikan kebutuhan;
- coupling antar module harus melalui public service/repository contract, bukan import internal acak.
