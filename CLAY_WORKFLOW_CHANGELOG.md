# Clay Workflow Changelog — 2026-08-26

## Clay langsung ke Mixing Workbench — 2026-08-27

- Rekonsiliasi Retase dihilangkan dari navigasi Clay; URL lama `material=CL` diarahkan ke Workbench. Limestone tetap memakai rekonsiliasi. API menolak pembuatan/konfirmasi allocation Clay baru; data historis tidak dihapus.
- Workbench memuat sampel lab dan counter laporan langsung. Endpoint QC `GET /workbench/clay-retase?operationDate=...&shiftCode=...` menampilkan kolom dinamis/master/manual, crusher, status, total, terpakai, dan sisa.
- QC memilih sumber pada baris sampel lab dan jumlahnya, tanpa mapping/confirm terpisah. Mendukung beberapa sumber per sampel dan pembagian satu sumber ke beberapa sampel. Nama/vendor tidak dicocokkan secara spekulatif.
- Save/Replace menerima `items[].clayRetaseSources: [{columnId, retase}]`; jumlah harus sama dengan retase item. Sumber harus sesuai tanggal/shift/material dan `CONFIRMED`. Draft laporan yang sudah tersimpan boleh dipakai tanpa kewajiban submit/approve/vendor report.
- Migrasi `0017_clay_direct_mixing.sql`: ledger kuantitas per kolom, lock transaksi, pengaman saldo counter/koreksi/reversal, serta release saat Replace. Tidak membuat assignment/vendor/AM/AA sintetis; ini bukan binding exact-event Limestone.
- Migrasi diterapkan ke Supabase `tejxcxlpoksittppontc`. Tidak ada rewrite/delete data operasional; RLS aktif dan akses Data API tertutup.
- Pengujian PostgreSQL rollback-only mencakup konsumsi parsial, recall, saldo habis, koreksi/reversal, replace berhasil/gagal, mismatch tanggal/shift, kolom provisional, dan histori identitas. UI fixture terisolasi menguji pemilihan, pembagian/gabungan sumber, serta pergantian shift.
- Hasil akhir: `pnpm typecheck` dan build lulus; 95 tests reguler + 30 tests PostgreSQL lulus. Verifier Supabase mencatat 18 migrasi, seluruh tabel public memakai RLS, dan Data API tertutup. Pembacaan data operasional tanggal 27/08/2026 Shift 1 menemukan Buffer/Trass 9 dan TOP/Bontoa 8 retase tersedia tanpa mengubah data tersebut.

## Hotfix integritas backfill — 2026-08-27

- Log PostgreSQL mengonfirmasi `hourly-backfill` ditolak oleh `retase_aa_snapshot_ck`: aturan lama mewajibkan AA/snapshot unit walaupun event berasal dari kolom Clay langsung. Migrasi `0016_clay_retase_event_constraints.sql` memperbolehkan pengecualian hanya untuk material `CL` dengan pasangan report/column lengkap; requirement AA pada alur lain tetap berlaku.
- Constraint `retase_reversal_shape_ck` juga disesuaikan agar koreksi negatif Clay dapat memakai `MANUAL_CORRECTION`, `QC_BACKFILL`, batch ID, dan alasan tanpa menyamar sebagai reversal event tunggal. Reversal biasa dan larangan delta negatif di alur lain tetap dipertahankan.
- Drizzle schema diselaraskan; migrasi lama tidak diubah. Tidak ada rewrite/delete event atau perubahan izin database.
- Migrasi `0016` telah diterapkan melalui runner/checksum repository ke Supabase `tejxcxlpoksittppontc`. Verifier: 17 file migrasi tercatat, RLS aktif, Data API tertutup.
- Ditambahkan uji PostgreSQL opt-in `pnpm --filter @qc/db test:clay-db`: 17 tests lulus, termasuk constraint positif/negatif/live, aturan Limestone/reversal, NULL material, dan repository backfill/retry dengan FK nyata. Seluruh fixture di-rollback. Uji UI fixture sebelumnya tidak menjalankan constraint PostgreSQL, sehingga tidak menangkap regresi ini.
- Jika draft masih terbuka dan terkunci menunggu retry, tekan **Simpan Draft** kembali tanpa refresh. Request/batch ID yang sama aman dikirim ulang; submit dilakukan setelah penyimpanan berhasil. Jangan refresh sebelum perubahan lokal tersimpan.

## UI form harian — 2026-08-27

- Halaman Clay mengikuti susunan form kertas/referensi UI: tiga tab **Ringkasan**, **Distribusi Material**, dan **Gangguan & Catatan**, dengan field berlabel Bahasa Indonesia dan unit yang jelas.
- Matriks jam × material menampilkan seluruh jam shift, kolom dinamis, total per jam/kolom, total trip, dan sumber dominan. QC/Supervisor klik untuk menambah, Shift+klik atau mode Kurangi untuk mengoreksi; pengurangan wajib alasan audit. Operator tetap memakai trip live pada jam/shift aktif.
- Ringkasan/catatan utama autosave setelah jeda 1,2 detik. Trip backfill dan gangguan baru disimpan dengan **Simpan Draft**. Indikator membedakan data tersimpan, perubahan tertunda, dan kegagalan; navigasi memperingatkan saat draft belum tersimpan. Draft tertunda belum disimpan di local storage.
- Retry backfill mempertahankan request/batch ID agar respons terputus tidak menggandakan trip. Query refresh hanya mengirim business context, bukan seluruh objek report.
- Gangguan baru diisi melalui baris mulai/selesai/kategori/keterangan. Gangguan tersimpan tetap arsip read-only sesuai API create-only. Downtime dihitung dari interval stop/mekanik/perawatan dalam shift, dengan interval tumpang tindih dihitung sekali.
- Running time aktual tetap input menit; estimasi durasi penuh shift minus downtime diberi label terpisah dan tidak otomatis dianggap waktu operasi aktual. Stok gudang tetap persen sesuai kontrak existing; kondisi basah/kering ditulis pada catatan shift.
- Form responsif, tabel dapat digeser horizontal dengan kolom jam tetap terlihat, tombol sentuh, navigasi tab keyboard, dialog konfirmasi submit/approve/reopen, serta empty/error/loading state.
- Tidak ada perubahan schema atau migrasi tambahan untuk redesign ini. Integrasi exact Mix/stockpile tetap mengikuti batas kompatibilitas di bawah.
- Verifikasi: `pnpm typecheck`, `pnpm test` (77 tests: 3 launcher + 25 domain + 13 web + 4 DB + 32 API), `pnpm build`. Browser QA memakai API fixture in-memory terisolasi, bukan mutasi data Supabase; UAT workflow live tetap diperlukan.

## Added

- Laporan utama Clay Crusher yang berdiri sendiri berdasarkan `Operation Date + Shift + Clay Crusher`.
- Lifecycle laporan `DRAFT → SUBMITTED → APPROVED`, dengan controlled reopen oleh Supervisor/Admin.
- Kolom dinamis seperti form fisik: header dua baris, Vendor/Source/Pile master opsional, serta snapshot nama manual.
- Kolom yang dibuat operator berstatus `PROVISIONAL` sampai dikonfirmasi QC Analyst atau Supervisor/Admin.
- Retase live langsung ke `clay_report_column_id`, tanpa kewajiban Vendor Shift Report, AM, atau AA assignment.
- Backfill/koreksi per jam oleh QC sebagai event ledger `QC_BACKFILL`, bukan overwrite aggregate.
- Log gangguan operasi dan field header/KPI/kimia/kehadiran laporan Clay.
- Halaman React `/clay-report` untuk operator, QC Analyst, dan Supervisor/Admin.
- Scope material LS/CL terpisah untuk Vendor, Equipment, dan Plant; Source, Crusher, dan Pile tetap mempunyai satu `material_kind` eksplisit.
- Filter `materialKind` pada master/list/lookup API dan pada Vendor Shift Report.
- Migrasi `0014_material_master_scopes.sql` dan `0015_clay_shift_report.sql` dengan RLS serta revocation Data API.

## Changed

- Vendor Shift Report menjadi input upstream opsional bagi workflow Clay dan tetap dapat digunakan sebagai helper fleet/assignment.
- Vendor Shift Report sekarang mempunyai `material_kind`; satu report hanya boleh berisi assignment material yang sama.
- Source dan Pile code unik per material, sehingga code LS dan CL tidak saling mengunci.
- Loading Assignment memvalidasi scope material Vendor, AM, AA, Source, Crusher, Plant, dan Pile di API serta foreign key PostgreSQL.
- Raw Sample create/update/import memvalidasi Vendor dan Plant terhadap material sample.
- Master Data UI dapat memilih satu atau kedua scope material untuk Vendor, Equipment, dan Plant.

## Fixed

- Endpoint `GET /clay-reports/current` tidak lagi gagal pada report yang sudah memiliki data karena alias `hour` dan `ORDER BY` agregat PostgreSQL; query matriks jam kini memakai `hour_label` dan grouping yang valid.

## Compatibility

- Master lama yang belum pernah direferensikan dibackfill ke scope LS dan CL agar deployment tidak memutus data aktif.
- API create master tetap default ke kedua material jika `materialKinds` tidak dikirim oleh client lama.
- Vendor Shift Report client lama default ke `LS`.
- Historical Vendor Shift Report campuran tidak dipaksa rewrite; composite FK report/material diberlakukan untuk row baru, sedangkan validasi penuh data historis ditunda sampai data cleansing.
- Boundary awal ini digantikan ADR-014: Limestone tetap memakai exact event/Loading Assignment; Clay memakai ledger kuantitas kolom langsung ke Mix tanpa rekonsiliasi.

## Verification

- `pnpm typecheck`
- `pnpm test` — 66 tests passed (3 launcher + 25 domain + 2 web + 4 DB + 32 API; 2 Clay tests included in API total)
- `pnpm build`
- `pnpm db:migrate:supabase` — migrations `0014` and `0015` applied to staging project `tejxcxlpoksittppontc` on 2026-08-26.
- `pnpm db:verify:supabase` — 16 migration files recorded, all public tables use RLS, and Data API access is closed.
- Post-migration smoke query confirmed the Clay tables, LS/CL scope tables, and representative composite foreign keys.

## Migration tooling

- Migration checksums are canonicalized to LF for cross-platform portability while legacy raw checksums remain accepted. This resolved a Windows CRLF-only mismatch on migration `0013` without editing the remote ledger.
