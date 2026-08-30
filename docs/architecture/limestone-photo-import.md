# Impor foto laporan Limestone

## Kompatibilitas dan keputusan integrasi

Repo memakai Fastify, Zod, Drizzle/Postgres, cookie session internal, dan migrasi SQL portable (bukan Supabase Auth/Data API). Master vendor, AA, AM, shift dan loading assignment sudah ada. Parser WhatsApp memasok assignment; foto crusher memasok **retase aktual per AA/DT**. Foto tidak membuktikan AM, Source, atau jam dump individual. Reviewer harus mengikat setiap baris ke assignment efektif pada tanggal/shift/crusher. Tidak membuat master/assignment atau tonase vendor secara otomatis.

Modul additive: kontrak draft berversi, import/job, evidence OCR, koreksi, report canonical dan hubungan baris-event. Konfirmasi atomik menghasilkan satu DUMP per retase dengan `entry_source=IMPORT`; rekonsiliasi dan mixing mengonsumsi event yang sama melalui alur existing. Total tonase produksi hanya metadata laporan, bukan tonase terukur per vendor. Duplikasi DT tetap dipertahankan di draft.

Produksi memakai private PostgreSQL bytea untuk sumber/canonical image (maksimum 4 MiB/file agar kompatibel dengan request Vercel), bukan bucket publik atau filesystem lokal API. API menjadi satu-satunya runtime parser dan tidak memerlukan deployment worker. Media hanya melalui endpoint authenticated. Untuk volume besar, pindahkan blob ke private object-storage adapter.

Arsitektur OCR Python/Tesseract di bawah adalah catatan historis. Parser produksi memakai
OreVision VLM langsung pada request upload/reparse Fastify. Hasil tetap wajib direview;
nilai contoh tidak pernah menjadi fallback.

Jam event impor adalah penanda teknis awal shift, **bukan jam dump hasil observasi**. Ringkasan hourly live mengecualikan event foto; hourly yang tertulis di form dipertahankan pada report. Satu foto merepresentasikan satu laporan penuh per crusher/tanggal/shift. Impor tidak boleh menambah retase di atas event existing untuk AA yang sama.

## Menjalankan

1. Terapkan `0019_limestone_report_import.sql` ke database API dengan runner existing: `pnpm db:migrate` untuk lokal atau `pnpm db:migrate:supabase` untuk target Supabase yang telah diverifikasi. Kemudian jalankan `pnpm db:verify` / `pnpm db:verify:supabase`. Implementasi ini tidak menerapkan migrasi ke produksi otomatis.
2. Konfigurasikan `OREVISION_PROVIDER`, `OREVISION_MODEL`, dan API key pada
   environment API. Di Vercel gunakan Environment Variables karena filesystem
   function bersifat sementara.
3. Jalankan/deploy hanya web dan API. Request upload/reparse memperoleh lease untuk
   import tersebut, memanggil VLM, menyimpan draft/evidence, lalu mengembalikan hasil.
   Tidak ada perintah atau deployment `parser:worker`.
4. Buka **Retase Counter → Laporan foto / gambar**. QC mendapat menu **Retase · Laporan Foto**. Operator hanya dapat mengunggah/mengoreksi dalam crusher scope-nya; QC/supervisor mengonfirmasi.
5. Upload satu foto, tunggu status review, koreksi header dan angka, pilih vendor master, cocokkan setiap DT ke assignment AM/Source. Centang review setiap baris, simpan koreksi, selesaikan blocking issues, lalu konfirmasi final. Baris kosong hasil deteksi boleh dihapus; evidence tidak dihapus.
6. Lanjutkan **Rekonsiliasi Retase → mapping sampel → konfirmasi alokasi → Mixing Workbench**. Tidak ada auto-confirm sampel atau otomatis membuat mix.

Kolom jam form dipisahkan dari interval counter master: template SHIFT_1 memakai 07–14 dan SHIFT_2 15–22. Interval master existing adalah 07:30–15:30 / 15:30–22:30, dan tidak diubah. Registrasi kolom template ada pada `CRUSHER_REPORT_HOURS` di contracts; shift lain ditolak sampai templatenya dikonfigurasi.

## API dan keamanan

Semua endpoint di `/api/v1/crusher-report-imports`: POST upload multipart `file` dengan query `crusherId`; GET list (30 terbaru); GET `/:id` dan `/:id/draft`; PATCH `/:id/draft` dengan `{revision,draft}`; POST `/:id/confirm` dengan `{revision,reviewed:true}`; GET `/:id/image?aligned=true|false`; GET `/:id/assignments?operationDate=...&shiftCode=...`; POST `/:id/reparse` untuk FAILED. Skema request serta ringkasan endpoint muncul pada `/docs`.

- RLS enabled tanpa policy browser; database diakses hanya oleh trusted Fastify API, sesuai arsitektur existing. Tidak ada service key di frontend.
- Multipart satu file, maximum 4 MiB, format JPEG/PNG/WebP, decoder memvalidasi isinya dan membatasi 24 MP. Original SHA-256 unik per crusher, response media `private, no-store`.
- Import di-claim berdasarkan ID dengan update atomik dan lease token. Invocation
  konkuren tidak dapat memproses import yang sama; lease terputus di atas lima menit
  dapat diambil alih dengan aman. Hasil lease lama tidak dapat menimpa hasil baru. Reparse tidak boleh menimpa draft review/confirmed.
- Save memakai optimistic revision; confirm mengunci import dan assignment, memvalidasi ulang referensi efektif, menyimpan canonical snapshot, source rows, event, dan audit dalam satu transaksi. Retry confirm idempotent.
- Guard database menserialisasi penulisan per tanggal/shift/crusher/AA dan menolak sumber lain setelah impor (serta menolak impor di atas counter existing). Import yang konflik rollback seluruhnya. Bukti source row tetap terhubung melalui `retase_events.crusher_report_row_id`.
- Koreksi menyimpan before/after per field, revision, actor/time. Parser observations menyimpan raw text/value/confidence/bbox dan run; parser/template version tersimpan pada import. Confidence bukan jaminan akurasi.

## Verifikasi dan batasan yang diketahui

### Pembaruan parser 0.2 — 28 Agustus 2026

Crop DT/retase sekarang menelusuri garis masing-masing kolom dan melakukan warp lokal per sel. Jumlah baris ditentukan dari grid; kolom yang berbeda jumlah baris atau memiliki gap tidak dipasangkan diam-diam. Bila gagal, fallback template ditandai untuk review. Header/footer/hourly dan batas pencarian tetap spesifik template awal; ini belum registrasi halaman bebas atau model handwriting baru.

UI menampilkan skor DT dan retase terpisah sebagai skor model belum terkalibrasi, preview crop/polygon sumber, serta filter yang terpisah dari checkbox belum direview. Metadata baru optional sehingga observation lama tetap terbaca.

Uji diagnostik pada 53 field terpilih dari satu foto: DT exact-match 1/27 → 8/27; retase 4/26 → 16/26. Label dibuat sementara oleh coding assistant dari foto/crop, belum diverifikasi dua reviewer, bukan test set terpisah, dan bukan sertifikasi akurasi. Perbaikan crop nyata pada contoh ini tetapi hasil masih jauh di bawah target produksi. Label/hasil/gambar diagnostik disimpan di `.tmp`, bukan data produksi atau fixture publik.

Build dan typecheck lulus. Tes UI 63, API existing 65 ditambah 3 tes kontrak observation, domain 31, serta tes Python mencakup geometri dan evaluator. Bridge Node→Python pada foto contoh lulus: parser 0.2.0, 134 observations, 56 slot baris termasuk baris kosong untuk review. Inspeksi visual crop dilakukan pada contact sheet; browser QA tetap terhalang ACL Windows.

Tidak ada migrasi baru, penulisan ke Supabase, atau penggantian hasil laporan lama pada increment ini. Restart worker agar kontrak Node baru dimuat, lalu refresh web. Impor baru memakai parser 0.2; unggah ulang byte gambar yang sama tetap mengembalikan impor lama. Reparse aman untuk draft yang sudah direview masih merupakan tahap berikutnya. Panduan benchmark tersedia di `services/limestone-parser/README.md`.

Tes domain, API, UI, serta PostgreSQL `test:photo-db` mencakup alur review hingga exact event consumption mixing. Runner database perlu target uji eksplisit; fixture di-rollback. Perintah: `pnpm --filter @qc/db test:photo-db`. Tes Python: `python -m unittest discover -s services/limestone-parser -p test_parser.py`.

Foto contoh 18/08/2026 digunakan untuk smoke test lokal, **belum menjadi golden oracle terverifikasi**. Tesseract awal dapat membaca sebagian angka (antara lain total produksi 7338 dan kapasitas 1384 pada uji lokal), tetapi banyak DT, total vendor, header, dan footer masih salah/kosong. Karena itu tahap OCR belum memenuhi Definition of Done/target akurasi plan; baseline ini merupakan workflow review-assisted, bukan parser tulisan tangan siap produksi. Confidence OCR dibatasi <0.75 sampai benchmark tersedia.

Template v0.1.0 mengasumsikan empat blok dan geometri foto contoh. Batas kertas yang tidak lengkap menyebabkan fallback resize dengan peringatan alignment. Posisi/baris template, orientation di luar upright, jumlah DT berbeda, serta circle handwriting perlu kalibrasi lebih lanjut. Tidak ada fallback nilai hardcoded dari foto atau LLM. Semua crop/bbox merujuk gambar normalisasi. Penyempurnaan berikutnya: anchor-grid registration, row segmentation dinamis, OCR/HTR digit yang dibenchmark, fleet-constrained candidate ranking, fixture clean/skewed/blur, per-cell tally, notes event extraction, feedback analytics.

Skill Supabase digunakan untuk RLS/private access, indeks FK, dan claim antrean. Browser visual QA pada lingkungan ini terhalang ACL Windows; interaksi telah diuji dengan React Testing Library, bukan dinyatakan lulus inspeksi visual browser.

### Hasil verifikasi lokal — 28 Agustus 2026

- `pnpm build` dan `pnpm -r typecheck`: lulus; API hasil build juga berhasil start, health 200, dan tujuh path import terdaftar pada OpenAPI.
- Regresi web: 60 tes; API: 65 tes; domain: 31 tes. Unit Python: 3 tes. Seluruhnya lulus.
- Database baru terisolasi: 20 migrasi diterapkan; `db:verify` mengonfirmasi seluruh tabel public ber-RLS dan akses Data API tertutup.
- `test:photo-db`: 4 tes lulus, termasuk konflik dua arah live↔foto, rollback atomik, retry confirm, duplicate DT source rows, rekonsiliasi, dan exact event consumption mixing. Regresi WhatsApp `test:vendor-db`: 10 tes lulus.
- Bridge Node→Python pada foto contoh berhasil menghasilkan 55 baris draft dan 132 observations, dengan gambar normalisasi. Ini menguji protokol worker, **bukan membuktikan angka OCR benar**. Worker `--once` juga berhasil pada antrean uji.
- Tidak ada migrasi atau penulisan laporan yang dilakukan ke database produksi.

> Production parser update: the queue now runs OreVision LLM Vision rather than
> Python OCR. See [OreVision setup](./orevision-document-extractor.md) for current
> configuration, UI features and deployment. The original import/review/confirm
> contract described below remains in use.
