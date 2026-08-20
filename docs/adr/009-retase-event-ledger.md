# ADR-009 — Append-Only Retase Event Ledger


## Status
ACCEPTED

## Decision
Satu successful dump tap menghasilkan satu immutable event delta `+1`. Koreksi tidak menghapus event; dibuat reversal `-1` yang mereferensikan original event. `request_id` unique menjadi idempotency key.

Aggregate retase selalu berasal dari sum valid ledger events. Event yang assignment-nya ambiguous/unassigned tidak boleh auto-consume ke mix.
