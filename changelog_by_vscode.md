# Changelog by VS Code

## 2026-08-20

### Login, session, dan stabilitas fitur

- Mengganti pemeriksaan sesi awal web dari endpoint terproteksi `/auth/me` ke endpoint anonymous-safe `/auth/session`, sehingga halaman login tidak lagi menghasilkan expected `401 Unauthorized` di browser console.
- Mempertahankan `/auth/me` sebagai endpoint terproteksi yang tetap mengembalikan `401` bila dipanggil tanpa sesi.
- Memperbaiki pemetaan error constraint PostgreSQL yang dibungkus oleh Drizzle melalui `error.cause.code`.
- Memperbaiki validasi waktu assignment Shift Report agar menerima format `HH:mm` yang valid.
- Menambahkan migration `0007_vendor_shift_draft_balance.sql` agar draft Shift Report boleh disimpan dalam kondisi AM/AA belum balance; validasi balance tetap diwajibkan saat submit.
- Memperbaiki query kandidat Reconciliation yang sebelumnya membaca kolom raw sample `operation_date`; kolom yang benar adalah `sample_date`.
- Melengkapi pemetaan status `reviewRequired` pada assignment Reconciliation dan merapikan kontrak properti opsional lintas web, API, domain, serta database.

### Verifikasi perbaikan

- Matriks smoke test API lulus pada 31 dari 31 endpoint fitur utama.
- Unit test lulus 40 dari 40, typecheck seluruh workspace lulus, dan build produksi web berhasil memproses 205 modul.

### Multi-route Retase Counter dan Operational/Clay Assignment

- Loading Assignment sekarang menyimpan tujuan Crusher/Plant/Pile dan membedakan sumber assignment `SHIFT_REPORT` atau `OPERATIONAL`.
- Satu AM dapat digunakan pada beberapa route crusher secara bersamaan; AA yang sama dapat disiapkan untuk crusher berbeda agar operator dapat mencatat tujuan aktual saat unloading.
- Overlap AA tetap ditolak bila terjadi pada crusher yang sama dan window waktu yang sama, untuk mencegah pilihan counter yang ambigu.
- Menambahkan Operational Assignment yang langsung aktif tanpa menunggu Vendor Shift Report, termasuk mode Clay tanpa Source.
- Operational Assignment dapat dibuat dan diubah oleh Vendor sesuai scope-nya, atau oleh QC Analyst dan Supervisor Admin untuk vendor yang dipilih.
- Menambahkan API list/create/update/cancel di `/operational-assignments` beserta audit trail.
- Retase Counter menggabungkan assignment dari report `SUBMITTED` dan Operational Assignment aktif, serta menampilkan origin, plant, dan pile.
- Reconciliation menerima Operational Assignment sebagai upstream effective sehingga retase Clay tetap dapat dipetakan ke Sample_ID dan Workbench.
- Menambahkan migration `0008_operational_counter_assignments.sql` untuk origin assignment, nullable report, tujuan pile, actor assignment, serta snapshot origin/pile pada Retase Event.
- Memperbaiki runtime schema Zod update assignment dengan memisahkan base schema sebelum `.omit()`.

### Verifikasi multi-route dan Clay

- Migration `0008` berhasil diterapkan dan `drizzle-kit check` menyatakan schema valid.
- Browser click-through Shift Report dan Retase Counter berhasil tanpa error console baru; form Clay tanpa report/source mencapai state siap aktivasi.
- Endpoint Operational Assignment, Counter Context, dan Reconciliation merespons sesuai kontrak; invalid payload ditolak dengan HTTP 400.
- Verifikasi akhir lulus: typecheck seluruh workspace, 42 dari 42 unit test, dan build produksi web sebanyak 205 modul.

### Environment and database

- Diagnosed `DATABASE_URL is required`: `.env` was not loaded by the `tsx` entry points.
- Started the local PostgreSQL Docker Compose service.
- Identified that `127.0.0.1:5432` was resolving to PostgreSQL on Windows, separate from the Docker PostgreSQL instance.
- Created the `qc_raw_material` database on the PostgreSQL instance used by `DATABASE_URL`.
- Applied migrations `0000` through `0006` successfully.

### Code changes

- Updated `packages/db/package.json` so `db:migrate` runs Node with `--env-file=../../.env` and `tsx`.
- Updated `apps/api/package.json` so `dev` loads `../../.env` while running the API watcher.
- Updated `apps/api/package.json` so `bootstrap:admin` loads `../../.env`.

### Validation

- Confirmed database migrations complete successfully.
- Confirmed the API starts successfully after loading environment variables.
- Confirmed the API endpoint responds with HTTP 200.
- Noted that the web server moved from port `5173` to `5174` because port `5173` was already in use.
- Noted that the configured API port is `3001`, while the README still documents port `3000`.
