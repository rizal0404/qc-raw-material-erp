# ADR-013 — Clay report is an independent shift aggregate

**Status:** ACCEPTED  
**Date:** 2026-08-26

## Context

Workflow Limestone berpusat pada Vendor Shift Report dan loading assignment AM/AA. Form harian Clay Crusher justru berpusat pada crusher/shift dan mempunyai kolom vendor/sumber yang dinamis, termasuk label tulisan tangan yang belum tentu ada pada master.

Memaksa Clay memakai aggregate Limestone membuat report vendor, AM, dan AA menjadi dependency palsu serta menghilangkan bentuk asli matriks jam × sumber.

## Decision

1. Gunakan `clay_shift_reports` sebagai aggregate root Clay.
2. Simpan header dinamis pada `clay_report_columns` dengan canonical foreign key opsional dan immutable-at-event snapshot.
3. Izinkan operator membuat kolom `PROVISIONAL`; QC/Supervisor mengonfirmasi sebelum submit.
4. Catat live counter dan backfill sebagai `retase_events` yang menunjuk report/column, bukan overwrite total.
5. Jangan otomatis membuat master dari input teks manual.
6. Pisahkan scope master Vendor/Equipment/Plant per material dan pertahankan single material kind untuk Source/Crusher/Pile.

## Consequences

- Clay dapat beroperasi tanpa Vendor Shift Report maupun loading assignment.
- Form digital tetap dapat merepresentasikan perubahan header seperti `TOP / BONTOA` dan `BUFFER / TRASS`.
- QC tetap memegang submission, koreksi, dan approval boundary.
- Query downstream harus membedakan event berbasis Loading Assignment dan event berbasis Clay Report Column.
- Reconciliation v0.7 tidak boleh menciptakan assignment atau equipment sintetis. Sejak ADR-014, Clay memakai ledger kuantitas kolom langsung ke Mix; exact-event consumption tetap untuk Limestone.
