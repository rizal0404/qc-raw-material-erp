# ADR-008 — Operation Date and Time Semantics


## Status
ACCEPTED

## Decision
- `operation_date`: PostgreSQL `date`, canonical API `YYYY-MM-DD`.
- timestamps: `timestamptz`.
- shift start/end: `time` + cross-midnight rule.
- timezone bisnis: `Asia/Makassar`.
- Shift 3 22:30–07:30 memakai tanggal awal shift sebagai `operation_date`.

Backend, bukan browser, menentukan authoritative mapping timestamp → operation date/shift bila event dibuat dari current-time context.
