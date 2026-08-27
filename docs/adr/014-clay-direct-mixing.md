# ADR-014 — Clay langsung dari laporan crusher + sampel lab ke mixing

Status: ACCEPTED · 2026-08-27

## Context

Kolom dinamis laporan crusher menjadi sumber retase Clay. Rekonsiliasi berbasis loading assignment/vendor tidak dibutuhkan dan tidak membaca event direct-column. Bisnis meminta laporan crusher dan sampel lab langsung digunakan pada Workbench.

## Decision

- Hapus tahap rekonsiliasi Clay; pertahankan alur Limestone ADR-012.
- Workbench menampilkan counter per kolom tanggal/shift terpilih. QC memilih kolom dan sampel secara eksplisit; tidak menebak nama manual/vendor.
- Gunakan `mix_item_clay_retase_sources` sebagai ledger **kuantitas per kolom**, bukan allocation vendor atau binding exact-event. Signed event dijumlahkan sebagaimana laporan, termasuk koreksi negatif.
- Satu item boleh memakai beberapa kolom, dan kolom dapat dibagi selama saldo cukup. Sampel lab menentukan chemistry snapshot.
- Counter tersimpan dari laporan DRAFT/SUBMITTED/APPROVED tersedia untuk kolom CONFIRMED. Input lokal belum tersimpan dan kolom PROVISIONAL belum dapat dikonsumsi.
- FK, validasi konteks, lock kolom, trigger saldo, release atomik saat Replace, RLS dan closed Data API melindungi integritas. Tidak ada assignment/equipment sintetis.

## Consequences

Retase Clay terlihat dan bisa dipakai tanpa approval mapping tambahan. Counter tidak boleh dikoreksi di bawah jumlah consumed; pengguna mengurangi pemakaian mix dahulu. Identitas kolom historis tetap. Mix manual lama tidak direkonstruksi secara spekulatif. Input mix Clay baru/replace wajib referensi kolom.

Migrasi: `0017_clay_direct_mixing.sql`. Melengkapi ADR-013 dan menggantikan boundary Clay ADR-012; exact-event Limestone tidak berubah.
