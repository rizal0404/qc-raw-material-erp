# Database migrations

Migration SQL disimpan sebagai file immutable berurutan (`0000_...sql`, `0001_...sql`, dst.).

## Runtime migration command

`pnpm db:migrate` menjalankan `src/migrate.ts`, mengambil advisory lock, membuat tabel ledger `app_schema_migrations`, memverifikasi SHA-256 checksum, lalu menerapkan hanya file yang belum pernah dijalankan. Isi migration dan pencatatan ledger berada dalam transaksi yang sama.

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
