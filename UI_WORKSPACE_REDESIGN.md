# Redesign workspace UI/UX

## Navigasi

- Sidebar desktop dapat diciutkan ke rail ikon. Preferensi tersimpan pada perangkat, bukan database.
- Menu Limestone dan Clay terpisah, dapat dibuka/ditutup, dan mengikuti peran pengguna.
- Pada layar <= 900 px, navigasi menjadi drawer dengan backdrop, Escape, focus trap, pemulihan fokus, dan konten belakang yang inert.
- Ringkasan, Master Data, Manajemen Pengguna, dan Keamanan Akun berada di luar workflow material.
- Tab di dalam fitur (jenis laporan, jenis master, bagian form Clay) tetap dipertahankan sebagai navigasi lokal.

## Konteks material

Contoh tautan yang dapat di-bookmark:

- `/raw-samples?material=LS`
- `/raw-samples?material=CL`
- `/qc-workbench?material=CL`
- `/qc-reports?material=CL`

Parameter `material` tervalidasi. Link lama tanpa parameter tetap menggunakan Limestone, kecuali `/clay-report` yang selalu menggunakan Clay. Counter lama dengan `?material=CL` diarahkan ke laporan utama Clay.

Sampel, pilihan master/alat, penugasan vendor, rekonsiliasi, mixing, laporan QC, dan layout gudang menggunakan konteks material yang sama. Query cache dipisahkan per material. Outlet di-remount saat material berubah agar state form, seleksi pile, atau hasil request sebelumnya tidak terbawa ke material lain. Form sampel, vendor, dan mixing mendapat konfirmasi navigasi ketika ada perubahan lokal; perlindungan draft Clay existing dipertahankan.

Laporan Harian Crusher tetap menjadi aggregate utama Clay. Vendor Shift Report Clay adalah input pendukung opsional. Hak akses tetap ditegakkan API existing; sidebar bukan pengganti otorisasi backend.

## Visual

Dashboard operasional menggantikan halaman foundation/session. Kartu workspace menampilkan jumlah sampel dan mix hari ini dari API untuk QC/Admin; role lain hanya mendapat ringkasan yang sesuai akses. Keadaan loading/error ditampilkan tanpa statistik rekaan. Warna hijau Limestone dan terracotta Clay mengikuti konteks aktif, dengan breadcrumb, formulir/tabel yang lebih lapang, serta sign-in yang konsisten.

## Database

Tidak ada perubahan schema atau data operasional untuk redesign ini. Migrasi existing berikut sudah menyediakan pemisahan yang diperlukan:

- `0014_material_master_scopes.sql`
- `0015_clay_shift_report.sql`
- `0016_clay_retase_event_constraints.sql`

Pada 2026-08-27, verifikasi read-only Supabase staging berhasil: seluruh 17 file migrasi sesuai checksum, semua tabel public memakai RLS, dan Data API aplikasi tetap tertutup. Tidak ada migrasi baru yang diterapkan.

## Verifikasi

- `pnpm test` — 82 tes lolos, termasuk regresi navigasi/material.
- `pnpm typecheck` — seluruh workspace lolos.
- `pnpm build` — frontend dan API berhasil.
- `pnpm db:verify:supabase` — ledger dan keamanan database existing.
- Browser: perpindahan LS → CL pada halaman sampel, master vendor Clay, load sampel mixing Clay, filter plant/gudang, laporan utama Clay, sidebar collapse/persistence, drawer mobile, Escape/focus, serta overflow horizontal.

UI diuji dengan fixture lokal read-only (data sintetis), bukan dengan membuat transaksi di Supabase. Untuk mengulang preview:

```powershell
node apps/web/tests/fixtures/preview-api.mjs
```

Di terminal terpisah:

```powershell
$env:VITE_API_BASE_URL='http://localhost:5399/api/v1'
pnpm --filter @qc/web dev --port 5185 --strictPort --host localhost
```

Fixture hanya bind ke loopback dan menolak operasi tulis. Jangan gunakan konfigurasi fixture untuk deployment. Aplikasi normal tetap memakai konfigurasi `pnpm dev:supabase` existing.
