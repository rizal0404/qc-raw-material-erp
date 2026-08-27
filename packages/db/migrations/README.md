# Database migrations

Migration SQL disimpan sebagai file immutable berurutan (`0000_...sql`, `0001_...sql`, dst.).

## Runtime migration command

`pnpm db:migrate` menjalankan `src/migrate.ts`, mengambil advisory lock, membuat tabel ledger `app_schema_migrations`, memverifikasi SHA-256 checksum, lalu menerapkan hanya file yang belum pernah dijalankan. Isi migration dan pencatatan ledger berada dalam transaksi yang sama.

Checksum baru dikanonikalisasi ke line ending LF agar ledger portable lintas Windows/Linux. Runner tetap menerima checksum raw legacy selama isi SQL hanya berbeda pada line ending.

`pnpm db:verify` memastikan seluruh file tercatat, semua tabel `public` memakai RLS, `v_mix_summary` memakai `security_invoker`, dan role Data API Supabase tidak memiliki akses ke schema aplikasi.

## Policy

1. edit Drizzle schema di `src/schema/`;
2. gunakan `pnpm db:generate` sebagai alat bantu menghasilkan diff SQL bila dependency tersedia;
3. review dan simpan migration final sebagai SQL bernomor di folder ini;
4. migration yang sudah pernah diterapkan **tidak boleh diedit** — buat file migration baru;
5. jalankan `pnpm db:migrate` di development/staging;
6. jalankan regression/parity tests;
7. apply production melalui controlled deployment, bukan dari request aplikasi.

Custom runner dipakai agar bootstrap migration yang telah direview tetap portable pada Supabase PostgreSQL maupun PostgreSQL biasa tanpa bergantung pada state lokal Drizzle Kit.

### 0003_qc_core_parity.sql
Raw sample legacy columns, configurable Ton/Retase rules, QAF baseline targets, controlled mix replacement history, chemistry revision numbering, and `v_mix_summary`.

## 0005_digital_retase_counter.sql
Slice 05 hardening for the append-only digital crusher counter: report/source snapshots, AA/AM/vendor snapshots, recent-actor index for Undo Last, context/status indexes, and AA traceability constraint.

## 0009_supabase_api_security.sql

Portable backend-only security baseline: enables RLS on every application table, makes `v_mix_summary` a `security_invoker` view, and removes Data API privileges when Supabase roles exist.

## 0010_secure_function_search_path.sql

Locks the `touch_updated_at()` trigger function search path to the trusted PostgreSQL catalog.

## 0011_index_foreign_keys.sql

Adds covering indexes for foreign-key columns that were not already the leading part of an existing index.

## 0014_material_master_scopes.sql

Memisahkan scope LS/CL untuk Vendor, Equipment, dan Plant; menambahkan `material_kind` pada Vendor Shift Report dan AA assignment; serta menegakkan referensi material dengan composite foreign keys. Source/Pile code menjadi unik per material. Historical mixed-material Vendor Shift Report dipertahankan dengan constraint report/material `NOT VALID`, sementara row baru tetap ditegakkan.

## 0015_clay_shift_report.sql

Menambahkan aggregate laporan harian Clay, kolom dinamis master/manual, operation logs, serta linkage retase ledger ke report/column. Tabel baru memakai RLS dan tidak diekspos ke role Data API Supabase.

## 0016_clay_retase_event_constraints.sql

Memperbaiki constraint retase legacy yang belum mengakomodasi kolom Clay langsung: AA tidak wajib untuk event `CL` yang memiliki pasangan report/column; koreksi `-1` hanya diperbolehkan sebagai `MANUAL_CORRECTION` / `QC_BACKFILL` dengan batch ID, alasan, dan tanpa `reverses_event_id`. Aturan AA untuk alur lain serta reversal existing tetap berlaku. `retase_aa_snapshot_ck` mempertahankan kebijakan `NOT VALID` untuk data historis dari migrasi 0005; insert/update baru tetap diperiksa. Tidak mengubah data, RLS, atau grants.

### Uji integrasi Clay pada Supabase (PowerShell)

```powershell
$env:MIGRATION_DATABASE_TARGET = 'supabase'
$env:MIGRATION_EXPECTED_PROJECT_REF = 'tejxcxlpoksittppontc'
$env:CLAY_DB_PREVIEW_ONLY = '0'
pnpm --filter @qc/db test:clay-db
```

Memakai `SUPABASE_DATABASE_URL` dari `.env` tanpa mencetak kredensial. Semua fixture berada dalam transaksi yang sengaja di-rollback; laporan operasional tidak diubah. Suite lengkap memerlukan migrasi 0016–0017. `CLAY_DB_PREVIEW_ONLY='1'` melewati fixture backfill lama; khusus sebelum 0017 diterapkan, tambahkan `CLAY_MIX_PREVIEW='1'` untuk memasang DDL 0017 dalam transaksi uji lalu rollback. Jangan mengaktifkan preview tersebut setelah 0017 sudah terpasang. Suite opt-in ini tidak dijalankan oleh `pnpm test` biasa.

## 0017_clay_direct_mixing.sql

Ledger `mix_item_clay_retase_sources` menghubungkan kuantitas kolom laporan crusher langsung ke mix item. Fungsi saldo memasukkan signed counter dan pemakaian aktif; trigger/lock mencegah over-consumption serta koreksi/reversal di bawah consumed. Replace melepas/memasang pemakaian dalam satu transaksi; histori identitas kolom dipertahankan. Semua tabel/fungsi baru backend-only, RLS aktif, Data API tidak diberi akses. Tidak mengubah event, sample, mix historis, atau alur exact-event Limestone.
