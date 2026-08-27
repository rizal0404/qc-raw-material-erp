# Clay Shift Report Workflow

**Status:** implemented; migrations applied to Supabase staging, workflow UAT pending
**Date:** 2026-08-26

Migrations `0014_material_master_scopes.sql` and `0015_clay_shift_report.sql` were applied to Supabase project `tejxcxlpoksittppontc` on 2026-08-26 and passed the repository migration verifier.

Hotfix `0016_clay_retase_event_constraints.sql` was applied on 2026-08-27 to align legacy AA/reversal constraints with direct Clay backfill. Verification includes PostgreSQL repository tests with real foreign keys and rollback-only fixtures, not only the browser mock API.

## Decision summary

Clay tidak memakai Vendor Shift Report sebagai aggregate utama. Aggregate utamanya adalah `clay_shift_reports`, dimiliki secara operasional oleh QC Analyst/Supervisor, sementara Crusher Operator dapat menambahkan kolom provisional dan mencatat dump.

Business key laporan saat ini:

```text
operation_date + shift_code + crusher_id + active version
```

Vendor Shift Report tetap tersedia sebagai helper opsional untuk informasi fleet/assignment. Tidak adanya report vendor, AM, AA, atau Source master tidak menghalangi pembuatan laporan maupun retase Clay.

## Model form fisik

Form fisik mempunyai kolom dua baris yang berubah antar-shift, misalnya `TOP / BONTOA`, `BUFFER / TRASS`, atau label tulisan tangan lain. Model native memecahnya menjadi:

- `clay_shift_reports`: header, KPI, chemistry ringkas, kehadiran, status, dan approval;
- `clay_report_columns`: urutan tampilan, header baris 1/2, referensi master opsional, snapshot manual, serta ton/retase snapshot;
- `clay_report_operation_logs`: pergantian shift, stop, breakdown, maintenance, dan catatan;
- `retase_events.clay_report_id/clay_report_column_id`: ledger dump/backfill per kolom.

Input manual disimpan sebagai snapshot report-scoped. Input tersebut tidak otomatis mempromosikan record baru ke master data. Admin dapat membuat master secara eksplisit dan QC kemudian memetakan kolom pada saat report masih `DRAFT`.

## Form UI (2026-08-27)

1. **Ringkasan**: konteks tanggal/shift/unit, operator, running time aktual (menit), produksi (ton), kapasitas (t/h), stok (%), lokasi/cuaca/pile, kimia dan kehadiran. Header autosave setelah jeda 1,2 detik, hanya untuk QC/Supervisor saat DRAFT. Lokasi dapat dipilih lewat saran master atau diinput manual. Kondisi material basah/kering memakai catatan existing, bukan field schema baru.
2. **Distribusi Material**: tabel seluruh jam shift × kolom aktif. QC/Supervisor menyiapkan delta lokal melalui klik (+1), Shift+klik atau tombol Kurangi (−1), kemudian **Simpan Draft**. Operator hanya dapat mencatat +1 live di jam konteks bisnis saat ini, langsung melalui retase-events. Pengurangan wajib alasan. Perubahan maksimal ±250 per sel/batch; jumlah hasil tidak boleh negatif. Waktu setelah tengah malam memakai tanggal kalender berikutnya tetapi tetap tanggal operasi shift asal.
3. **Gangguan & Catatan**: gangguan baru berisi waktu mulai/selesai, kategori dan keterangan; dapat dihapus sebelum tersimpan. API log saat ini create-only, sehingga baris tersimpan ditampilkan read-only, bukan memberi kesan dapat diedit. Catatan utama tetap milik QC/Supervisor dan autosave.

Downtime merupakan union interval `STOP`, `BREAKDOWN`, `MAINTENANCE`, dibatasi jadwal shift; catatan umum dan peralihan shift tidak dihitung. Estimasi running = durasi penuh shift − downtime, bukan running aktual atau elapsed shift. Tombol **Gunakan estimasi** merupakan pilihan eksplisit QC. Utilisasi = running aktual ÷ durasi shift; estimasi produksi = produksi ÷ kapasitas ÷ running aktual (jam).

Status **Tersimpan** hanya ditampilkan ketika tidak ada perubahan tertunda; timestamp berasal dari report saat dimuat atau konfirmasi write. Kegagalan mempertahankan draft lokal dan menampilkan pesan. Retry backfill memakai request/batch ID yang sama, serta mengunci perubahan grid sampai retry selesai. Gangguan dengan respons ambigu diperiksa ulang terhadap display order dan isi sebelum dianggap tersimpan. Perubahan header yang sudah sukses tidak membuang perubahan trip/log yang belum dikirim. Draft lokal belum persisten lintas reload; navigasi keluar/pergantian konteks memperingatkan pengguna.

Tidak ada migrasi baru untuk UI ini; semua write memakai endpoint dan otorisasi existing. Browser QA menggunakan fixture terisolasi, sedangkan UAT operator/QC pada data live masih pending.

## Role matrix

| Aksi | Operator | QC Analyst | Supervisor/Admin | Vendor |
|---|---:|---:|---:|---:|
| Buka/buat report DRAFT | Ya | Ya | Ya | Tidak |
| Tambah kolom | Provisional | Confirmed | Confirmed | Tidak |
| Catat dump live | Ya | Tidak | Ya | Tidak |
| Edit header/KPI | Tidak | Ya | Ya | Tidak |
| Konfirmasi/nonaktifkan kolom | Tidak | Ya | Ya | Tidak |
| Backfill/koreksi jam | Tidak | Ya | Ya | Tidak |
| Submit | Tidak | Ya | Ya | Tidak |
| Approve/reopen | Tidak | Tidak | Ya | Tidak |

Semua write diperiksa ulang di service; visibility tombol frontend bukan security boundary.

## Lifecycle dan invariants

- Hanya `DRAFT` yang dapat diubah atau menerima retase live.
- Operator hanya dapat mengubah kolom provisional dan tidak dapat mengonfirmasinya.
- Submit membutuhkan minimal satu kolom `CONFIRMED`, tidak boleh menyisakan `PROVISIONAL`, dan tidak boleh menghasilkan retase jam negatif.
- Backfill positif/negatif membuat `MANUAL_CORRECTION` event per retase dan memakai `entry_batch_id` untuk retry idempotent.
- Constraint database membebaskan AA hanya jika material `CL` dan pasangan report/column terisi; koreksi negatif juga wajib `QC_BACKFILL`, batch ID, alasan, serta tanpa reversal reference. Event Limestone dan reversal biasa tetap mengikuti validasi sebelumnya.
- Aggregate jam/kolom selalu dihitung dari `sum(retase_events.delta)`.
- Reopen dari `SUBMITTED/APPROVED` membutuhkan alasan dan menghasilkan audit trail.

## Material-scoped master data

Vendor, Equipment, dan Plant dapat memiliki scope `LS`, `CL`, atau keduanya melalui tabel junction. Source, Crusher, dan Pile mempunyai tepat satu `material_kind`. API menolak referensi silang dan database menegakkannya dengan composite foreign keys.

Untuk kompatibilitas, master lama yang belum mempunyai bukti pemakaian dibackfill ke kedua material. Record baru harus memilih minimal satu scope.

## API

```text
GET   /api/v1/clay-reports/current
POST  /api/v1/clay-reports/ensure
GET   /api/v1/clay-reports/:id
PATCH /api/v1/clay-reports/:id
POST  /api/v1/clay-reports/:id/columns
PATCH /api/v1/clay-reports/:id/columns/:columnId
POST  /api/v1/clay-reports/:id/operation-logs
POST  /api/v1/clay-reports/:id/hourly-backfill
POST  /api/v1/clay-reports/:id/submit
POST  /api/v1/clay-reports/:id/approve
POST  /api/v1/clay-reports/:id/reopen
```

Counter live menggunakan endpoint existing `POST /api/v1/retase-events` dengan `clayReportColumnId`. Jika field itu ada, validasi Unlisted AA tidak berlaku dan context kolom menjadi authoritative.

## Security

Tabel baru memakai RLS dan tidak diberi policy browser. Grant untuk `PUBLIC`, `anon`, `authenticated`, dan `service_role` dicabut bila role tersedia. Aplikasi mengakses PostgreSQL melalui Fastify mid-layer sebagaimana ADR-002.

## Mixing langsung dari laporan + sampel lab

Clay tidak memakai rekonsiliasi. Menu dihilangkan dan `/reconciliation?material=CL` diarahkan ke Workbench. Limestone tetap mengikuti allocation/exact DUMP-event existing. Riwayat allocation Clay lama dipertahankan; pembuatan/konfirmasi baru ditolak.

1. Simpan trip pada laporan crusher. Kolom harus `CONFIRMED`; laporan `DRAFT`, `SUBMITTED`, atau `APPROVED` tersedia, bukan `SUPERSEDED`.
2. Pilih tanggal/shift di Workbench. Sampel lab dan kolom laporan crusher dimuat otomatis. Counter memakai `sum(retase_events.delta)`, termasuk backfill dan original/reversal.
3. Pilih kolom sumber pada sampel lab beserta jumlahnya. Nama manual tetap tersedia. Satu sampel boleh memakai beberapa kolom; satu kolom boleh dibagi ke beberapa sampel/mix selama saldo cukup. Ini bagian komposisi mix, bukan workflow mapping terpisah.
4. Save Mix menyimpan kimia lab/snapshot, retase, tonase, serta relasi kolom. Counter diperbarui berkala/refresh; konflik saldo tidak menghapus draft Workbench.

API QC/Supervisor:

```text
GET /api/v1/workbench/clay-retase?operationDate=2026-08-27&shiftCode=SHIFT_1
POST /api/v1/mixes
POST /api/v1/mixes/:mixCode/replace
```

Item menambahkan `clayRetaseSources: [{columnId: UUID, retase: integer > 0}]`. Totalnya wajib sama dengan `item.retase`; ID kolom tidak boleh duplikat dalam satu item. `retaseAllocationIds` kosong untuk Clay; `clayRetaseSources` kosong untuk Limestone. Referensi dikembalikan saat Recall.

`mix_item_clay_retase_sources` mencatat kuantitas kolom, bukan ID event individual. Saldo = total signed event − pemakaian aktif (termasuk event allocation historis jika ada). Lock kolom dalam urutan ID menjaga konsumsi/replace/koreksi. Koreksi/reversal ditolak jika total menjadi lebih kecil dari consumed. Identitas kolom yang pernah dipakai tidak dapat diganti. Replace melepas pemakaian lama dan memasang yang baru dalam satu transaksi; kegagalan rollback seluruhnya. Tanggal/shift laporan harus sama dengan mix. Chemistry tetap dari sample/snapshot, bukan KPI kimia header laporan.

Konflik khusus: `CLAY_CONSUMPTION_BALANCE`, `CLAY_CONSUMPTION_CONTEXT`, `CLAY_CONSUMPTION_IDENTITY`. Untuk mengurangi counter di bawah pemakaian, kurangi penggunaan melalui Replace Mix dahulu. Mix manual lama tanpa referensi asal tidak direkonstruksi secara spekulatif; riwayat dipertahankan.
