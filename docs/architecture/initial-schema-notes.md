# Initial Database Schema Notes

## Important invariants represented in migration

- Vendor user must have `vendor_id`.
- Vendor fleet AM/AA summary must balance before row is valid.
- Retase `request_id` unique.
- One original retase event can only have one reversal.
- Reversal is `-1`, requires original event and reason.
- Mix item retase/tonnage/ton-per-retase must be positive.
- One QC allocation can only be linked to one mix item through a unique source allocation reference.
- `operation_date` is PostgreSQL `date`; operational timestamps are `timestamptz`.
- Shift and crusher canonical seed values match approved V3 business decisions.

## Intentionally deferred

- overlap prevention for AA across time segments requires transactional application validation and, if needed, PostgreSQL exclusion constraints after exact time-range representation is finalized;
- Pile Cumulative/QAF are not copied as redundant tables in initial schema; they should first be implemented as deterministic query/read models, then materialized only if performance requires it;
- authentication hashing algorithm implementation is deferred to IAM slice; database stores only hash, never plaintext;
- Supabase RLS is not required for core browser access because browser does not directly query business tables. Database roles/RLS can be added as defense in depth later.
