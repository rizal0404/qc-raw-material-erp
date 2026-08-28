# Impor laporan vendor dari WhatsApp

## Alur QC

1. Buka **Laporan Shift Vendor → Impor WhatsApp** sebagai `QC_ANALYST` atau `SUPERVISOR_ADMIN`.
2. Tempel satu laporan vendor, maksimal 18.000 karakter, lalu pilih **Parsing laporan**.
3. Pilih vendor master. Jika tanggal/shift/vendor berbeda, gunakan tombol konteks hasil parsing. Pergantian konteks tidak menghapus teks pratinjau; perubahan editor memerlukan konfirmasi.
4. Tinjau peringatan, pilih AM dan Source/material, serta cocokkan setiap AA. Buka **Cari kecocokan / tambah master** untuk mencari nama/nomor/alias dan memilih saran. Kecocokan nama yang mirip atau kode alat yang berbeda harus dipilih manual. QC/admin dapat membuat Vendor, AM, atau AA langsung melalui **Tambah … ke master → Simpan master & gunakan**; lookup diperbarui dan ID baru langsung dipilih. Periksa duplikasi sebelum membuat master. Crusher opsional: kosong berarti lintas crusher untuk material yang sama.
5. Konfirmasikan hasil tinjauan dan pilih **Terapkan ke editor laporan**. Ini mengganti isi editor, belum menyimpan ke server. Draft yang sudah berisi data memerlukan konfirmasi penggantian.
6. Koreksi ringkasan armada, penugasan, blok, waktu, pile, AA dan catatan di editor. Tambah/pisah route bila diperlukan. **Save Draft** menyimpan; **Simpan & Submit** menyimpan perubahan terkini dahulu lalu men-submit. Kegagalan submit tidak menghapus draft yang berhasil disimpan.
7. Laporan SUBMITTED hanya diubah melalui **Create Revision** dengan alasan. Versi lama dan actor QC tetap tercatat oleh alur audit yang ada.

## Aturan parser

- Parsing deterministik di browser; tidak mengirim teks ke layanan AI eksternal.
- Mendukung format empat contoh awal: Topabiring, An-Nur, Batara, dan laporan tanpa nama vendor dengan TOTAL PC/DT.
- Header total/jumlah alat muat/angkut, AM/AA/PC/DT; status operasi/ops, standby/st by/stb, rusak/bd, perbaikan/pb/servis.
- Angka status kosong sementara menjadi nol dengan peringatan. PB dianggap Repair dan harus dikonfirmasi; rusak/BD menjadi Breakdown. Ringkasan tidak direkayasa agar balance.
- Tanggal hari-bulan-tahun dengan `/` atau `-`, spasi, serta tahun dua digit (20xx). Tanggal kalender tidak valid ditolak, bukan digeser ke tanggal lain.
- AA/DT/No dipisah titik, koma, spasi atau baris lanjutan numerik. Nol di depan dipertahankan pada teks; pencocokan master menormalisasi prefiks AM/AA/PC/DT dan nol.
- Model alat tidak dianggap nomor unit; `BX05 Hyundai R480` mencocokkan BX05.
- Pencocokan hanya ke equipment aktif dari vendor terpilih. Source wajib cocok pada blok beserta arah dan kategori; `file`/`filer` dinormalisasi menjadi FILLER. Material kategori tetap diturunkan server dari Source master.
- Tujuan `4/5` tidak otomatis digandakan atau dipilih salah satunya. QC boleh membiarkan crusher kosong (lintas crusher), atau memilih tujuan tertentu untuk membatasi route. Pile memerlukan crusher tertentu. Rentang AA seperti `02-05` tidak diekspansi.
- Nama vendor dinormalisasi dari prefiks PT/CV, tanda baca, kode, dan alias; saran typo memakai edit distance. Alat dicocokkan pada nomor/alias setelah normalisasi prefiks dan nol: `AA 11` dapat menggunakan master `11`. Angka berbeda (`11` vs `12`) tidak dianggap typo. Kode berbeda dengan angka sama hanya menjadi saran, bukan pilihan otomatis.
- Nama vendor tidak ada/tidak cocok perlu dipilih dan dikonfirmasi manual. Pesan dengan beberapa vendor/tanggal/shift berbeda tidak dapat diterapkan sekaligus.
- Format yang belum didukung dikoreksi di teks lalu diparsing ulang, atau dimasukkan melalui editor manual. Mengubah teks membatalkan validitas pratinjau lama.

## Penyimpanan dan downstream

Hasil impor menggunakan endpoint laporan shift yang sudah ada, bukan tabel staging atau operational assignment terpisah. Teks asli disimpan di `note` laporan dengan penanda sumber WhatsApp, dan ikut tersalin ke revision/audit snapshot. Note laporan kini maksimal 20.000 karakter; note assignment tetap maksimal 500 karakter. Kolom note PostgreSQL yang ada bertipe `text`. Fitur crusher opsional membutuhkan migrasi **0018_optional_assignment_crusher.sql**, yang mengizinkan `NULL` pada `loading_assignments.crusher_id` dan `qc_retase_allocations.crusher_id`. Crusher pada `retase_events` tetap NOT NULL. Constraint membatasi tujuan kosong hanya untuk SHIFT_REPORT tanpa pile. Terapkan migrasi pada database target sebelum menjalankan web/API versi baru.

`QC_ANALYST` kini memiliki izin create/update/submit/revision laporan pada service dan HTTP routes, serta POST vendor/equipment untuk melengkapi master saat impor. Edit master dan pembuatan master lain tetap admin saja. Pembuatan master memakai validasi dan audit endpoint master yang sudah ada. Scope vendor, referensi aktif, material, balance armada, dan overlap assignment tetap divalidasi server.

Edit vendor/equipment/plant mempertahankan baris scope material yang tidak berubah. Sebelumnya penghapusan seluruh scope lalu insert ulang memicu FK 23503 (HTTP 409) meskipun hanya nama vendor yang diubah. Scope yang benar-benar dihapus tetapi masih direferensikan tetap ditolak untuk menjaga data historis.

Sesudah SUBMITTED, assignment muncul melalui jalur efektif laporan pada counter dan rekonsiliasi. Retase aktual berasal dari event DUMP; angka unit armada **bukan retase**. Setelah QC memetakan event ke sampel dan mengonfirmasi alokasi, Workbench menerima retase suggestion yang sama seperti laporan manual. Revisi upstream tetap memicu review pada mapping lama. Cache counter, rekonsiliasi, dan suggestion diinvalidasi saat laporan disimpan/disubmit/direvisi.

Assignment tanpa tujuan tersedia pada counter crusher aktif dengan material yang sama. Event menyimpan tujuan crusher aktual, dan counter tetap menghitung per crusher. Rekonsiliasi serta alokasi menghitung seluruh event per assignment sekali, dengan label **Lintas crusher**. Filter crusher menyertakan assignment lintas crusher material tersebut, tetapi angka Observed/Reserved/Remaining tetap total assignment, bukan subtotal crusher terpilih. Konsumsi mixing mengikat event aktual agar tidak dihitung ganda.

Untuk Clay, laporan vendor tetap pendukung opsional; alur retase dan mixing Clay mandiri tidak diubah.

## Pengujian

- `whatsapp-parser.test.ts`: empat format, tanggal invalid, vendor kosong, rentang/duplikasi, batas ukuran, serta pencocokan master konservatif.
- `whatsapp-import.test.tsx`: pilihan crusher opsional, checkbox review, teks/konteks berubah, pilihan vendor mirip, tambah AA dan error API, serta master/laporan belum siap.
- `vendor-shift-report.test.tsx`: tab dan editor nyata dengan API fixture, simpan canonical IDs dan teks, koreksi sebelum submit, perlindungan refetch serta penggantian draft, pembatasan tab vendor.
- `vendor-operation/service.test.ts`: siklus QC/admin, audit, validasi, scope vendor, dan izin pada empat endpoint HTTP.
- `master/service.test.ts`: hak POST vendor/equipment QC/admin, penolakan vendor/operator, dan edit master tetap admin.
- `vendor-import.integration.test.ts`: PostgreSQL nyata dari master/rename, laporan tanpa crusher, dua counter, rekonsiliasi exception, konfirmasi alokasi, hingga konsumsi event mixing. Jalankan `pnpm --filter @qc/db test:vendor-db` dengan `MIGRATION_DATABASE_TARGET`, `MIGRATION_DATABASE_URL`, dan `MIGRATION_DATABASE_SSL` menunjuk database uji yang sudah dimigrasi. Semua fixture ditulis dalam transaksi lalu rollback.

Tes UI menggunakan API fixture tanpa menulis data operasional produksi. Pengujian browser dengan data master/laporan sebenarnya tetap diperlukan saat UAT.

## Jika Save Draft / Simpan & Submit gagal setelah pembaruan

Crusher kosong memerlukan migrasi 0018 pada **database yang dipakai API**. Mode `pnpm dev:supabase` memakai Supabase walaupun URL browser localhost:3137, sehingga migrasi hanya ke PostgreSQL lokal tidak cukup. Jalankan `pnpm db:migrate:supabase`, lalu `pnpm db:verify:supabase` untuk target Supabase yang dikonfigurasi. Mode database lokal memakai `pnpm db:migrate` dan `pnpm db:verify` dengan konfigurasi target yang sesuai.

Jika constraint lama masih mewajibkan crusher pada assignment/alokasi, API mengembalikan `503 DATABASE_MIGRATION_REQUIRED` beserta nama migrasi, tanpa menampilkan SQL atau isi laporan. Crusher pada event retase tetap wajib. Setelah migrasi, ulangi penyimpanan dari editor yang masih terbuka agar teks/draft yang belum tersimpan tidak hilang.
