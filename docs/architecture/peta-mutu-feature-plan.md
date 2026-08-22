# Rencana Fitur Peta Mutu Stockpile

## 1. Ringkasan keputusan

Tambahkan halaman baru `Peta Mutu` untuk QC Analyst dan Supervisor/Admin sebagai visualisasi longitudinal gudang Limestone dan Clay. Bentuk dasar tetap mengikuti peta Excel agar familiar bagi operator: nomor tiang, jalur gudang, layer material, hopper, batas pile/filler, nomor pile fisik, dan posisi reclaimer.

Versi web sebaiknya meningkatkan keterbacaan dan traceability melalui:

- satu peta gudang dominan dengan mode overview/focus;
- pemilihan layer untuk membuka detail chemistry, quality, tonase, waktu update, dan sumber Mix;
- warna berdasarkan status terhadap target atau parameter mutu terpilih, bukan warna dekoratif acak;
- posisi reclaimer yang dapat digeser bebas dalam pecahan posisi, lalu disimpan secara eksplisit;
- indikator freshness dan data yang belum lengkap;
- riwayat perubahan untuk posisi reclaimer dan susunan material.

Fitur ini diimplementasikan sebagai vertical slice tersendiri tanpa mencampurkan komponen peta ke tabel `QC Reports`; sumber mutu tetap menggunakan read model Mix Summary yang sama.

### Status implementasi 22 Agustus 2026

MVP operasional sudah tersedia pada route `/peta-mutu`:

- empat layout awal `LS_4`, `LS_5`, `CL_4`, dan `CL_5` tersimpan sebagai konfigurasi database;
- layer fisik dapat dibuat/diedit dan dapat menghubungkan satu atau beberapa Mix;
- chemistry, quality, dan tonase dihitung langsung dari `v_mix_summary`, bukan disalin menjadi sumber data baru;
- nomor lot default berasal dari `pile_cycle`, dengan opsi nomor manual;
- posisi dan level menerima bilangan pecahan; tinggi kotak mengikuti level fisik;
- posisi REC bebas, mendukung drag/keyboard 0,1 unit, explicit save, event ledger, dan optimistic concurrency;
- tampilan dapat difilter menjadi lot aktif, sudah direclaim, atau semua lot;
- datepicker dapat membuka snapshot akhir hari pada tanggal sebelumnya dalam zona waktu WITA;
- snapshot historis bersifat read-only dan merekonstruksi lot, layer, relasi Mix, serta posisi REC terakhir sampai tanggal yang dipilih;
- write dibatasi server-side untuk `QC_ANALYST` dan `SUPERVISOR_ADMIN`, dengan reason opsional;
- collision placement, konsistensi Mix/lot/layout, serta concurrent update divalidasi di backend.

Data lot/layer yang sudah ada saat migrasi histori menjadi baseline pada `updated_at` masing-masing; aplikasi tidak memfabrikasi kondisi untuk tanggal yang lebih lama dari baseline tersebut. Playback, compare waktu, overview semua gudang, editor layout/zone, dan integrasi PLC/DCS tetap menjadi pengembangan lanjutan.

## 2. Interpretasi referensi Excel

Dokumen gambar dipakai sebagai referensi tampilan dan istilah, bukan sebagai sumber data atau instruksi sistem.

Interpretasi awal yang perlu divalidasi bersama user bisnis:

- angka berurutan di atas/bawah gudang adalah nomor tiang/bay;
- `REC` adalah posisi reclaimer saat ini;
- persegi panjang berwarna adalah layer/deposit material dengan rentang posisi tiang;
- angka seperti `138`, `150`, dan `114` adalah nomor pile fisik/lot operasional;
- kartu di luar gudang adalah mutu kumulatif pile fisik tersebut;
- teks seperti `LSF 1271` atau `SM 1.89 AM 2.00` di layer adalah mutu layer/Mix;
- `piles` di aplikasi saat ini adalah master tujuan logis seperti Pile Timur/Barat atau Utara/Selatan, sehingga bukan entitas yang sama dengan nomor pile fisik `138`.

Asumsi aman untuk desain data: nomor pile fisik dibuat sebagai entitas baru dan dipetakan ke master `piles` serta satu atau lebih Mix. Jangan memaksa `138/150` masuk ke `piles.code` sebelum makna bisnisnya dipastikan.

## 3. Sasaran pengguna

### QC Analyst

- melihat susunan aktual dan mutu setiap layer;
- menghubungkan layer dengan Mix dan raw sample;
- memperbarui penempatan layer dan posisi reclaimer;
- cepat mengenali material di luar target atau data yang stale.

### Supervisor/Admin

- semua kemampuan baca QC Analyst;
- mengatur layout gudang, arah nomor tiang, zone, hopper, filler, dan batas pile;
- mengoreksi data dengan audit trail; reason bersifat opsional;
- melihat histori dan traceability perubahan.

### Read-only tambahan, bila diperlukan

Role Crusher Operator dapat diberi akses baca setelah kebutuhan operasional dikonfirmasi. MVP sebaiknya tetap mengikuti boundary QC yang sudah ada: `QC_ANALYST` dan `SUPERVISOR_ADMIN`.

## 4. Rancangan pengalaman halaman

Route yang disarankan: `/peta-mutu` dengan menu `Peta Mutu` di navigasi role QC dan Supervisor/Admin.

### Header dan filter

- Material: Limestone / Clay.
- Plant/gudang: LS 4, LS 5, Clay 4, Clay 5, dan gudang lain dari master.
- Waktu data: kondisi sekarang atau snapshot `as of`.
- Mode warna: Status target, parameter utama (`LSF` untuk LS; `SM` atau `AM` untuk Clay), atau identitas pile.
- Tombol `Overview semua gudang` dan `Focus gudang`.
- Timestamp `Terakhir diperbarui` serta badge `Fresh`, `Stale`, atau `Belum lengkap`.

### Peta gudang

- Gunakan SVG responsif agar nomor tiang, layer, dan REC tetap tajam saat zoom.
- Nomor tiang ditampilkan di kedua sisi rel, dengan arah sesuai konfigurasi gudang.
- Hopper, umpan loader, filler, dan batas pile menjadi zone statis dari layout master.
- Layer digambar berdasarkan koordinat bisnis `startPost` dan `endPost`, bukan posisi pixel.
- Label layer hanya menampilkan nomor Mix/pile dan satu parameter utama agar tidak penuh.
- Hover menampilkan tooltip singkat; klik mengunci selection dan membuka detail.
- REC dapat di-drag bebas atau digerakkan dengan keyboard per 0,1 unit; perubahan baru persisten setelah `Simpan posisi`.
- Saat REC digeser, tampilkan posisi lama, posisi baru, dan pile/layer yang bersinggungan.

### Panel detail terpilih

- nomor pile fisik dan master pile/logical area;
- material, plant, cycle, rentang tiang, level/layer, dan tonase;
- chemistry lengkap: SiO2, Al2O3, Fe2O3, CaO, MgO, K2O, Na2O, SO3, H2O;
- quality: LSF, SM, AM, NaEq, R2O3;
- target dan deviasi setiap parameter;
- sumber Mix, operation date, raw sample trace, actor, dan waktu update;
- status `Dalam target`, `Mendekati batas`, `Di luar target`, atau `No data`.

### Overview

Tampilkan mini-map semua gudang secara bertumpuk. Setiap mini-map tetap memakai skala tiangnya sendiri dan menunjukkan REC, jumlah pile aktif, jumlah layer di luar target, dan freshness. Klik mini-map membuka focus view.

## 5. Prinsip warna dan keterbacaan

Warna default sebaiknya menyampaikan mutu:

- hijau: dalam target;
- kuning/amber: mendekati batas toleransi;
- merah: di luar target;
- abu-abu: belum ada data;
- biru: REC dan elemen alat;
- netral gelap: rel/struktur gudang.

Warna tidak boleh menjadi satu-satunya pembeda. Layer juga memiliki label, tooltip, status text, dan pola/ikon untuk `No data` atau stale. Mode `Identitas pile` dapat memakai palet kategorikal stabil, tetapi status mutu tetap muncul sebagai indikator kecil atau outline.

Hindari menampilkan semua kartu oxide permanen di sisi kanan seperti Excel. Detail lengkap dipindahkan ke panel selection; overview hanya menampilkan parameter yang relevan. Ini mengurangi kepadatan tanpa menghilangkan data.

## 6. Model data yang disarankan

### `warehouse_layouts`

Master bentuk gudang.

- `id`, `code`, `name`;
- `material_kind`, `plant_id`;
- `min_post`, `max_post`, `post_step`;
- `post_direction` (`ASC_LEFT_TO_RIGHT` atau `DESC_LEFT_TO_RIGHT`);
- `active`, timestamps.

### `warehouse_zones`

Elemen statis layout.

- `id`, `warehouse_layout_id`;
- `code`, `label`, `zone_kind` (`PILE`, `FILLER`, `HOPPER`, `LOADER_FEED`, `DIVIDER`, `TRACK`);
- `start_post`, `end_post`, `lane`, `display_order`;
- konfigurasi visual terbatas yang tervalidasi, bukan arbitrary HTML/CSS.

### `stockpile_lots`

Nomor pile fisik/lot seperti `138`, `150`, atau `114`.

- `id`, `warehouse_layout_id`;
- `lot_no`;
- `logical_pile_id` FK ke master `piles` saat ini;
- `pile_cycle`;
- `status` (`ACTIVE`, `RECLAIMED`);
- `reclaimed_at`, timestamps.

Business key awal: `(warehouse_layout_id, lot_no, pile_cycle)`.

### `stockpile_layers` dan `stockpile_layer_mixes`

Posisi setiap layer/deposit.

- `id`, `stockpile_lot_id`;
- `stockpile_layers` menyimpan `start_position`, `end_position`, `bottom_level`, dan `top_level`;
- `stockpile_layer_mixes` menghubungkan satu layer dengan satu atau beberapa Mix;
- satu Mix hanya dapat ditempatkan pada satu layer aktif;
- `version` digunakan untuk optimistic concurrency;
- `created_by`, `updated_by`, timestamps.

Koordinat menggunakan sumbu fisik gudang, bukan pixel. Label tiang dikonfigurasi terpisah melalui `post_marks`, sehingga gudang dengan nomor tiang berulang tetap dapat direpresentasikan. Tinggi kotak mengikuti `bottom_level` dan `top_level`, bukan tonase.

### `reclaimer_position_events`

Gunakan event append-only agar jejak gerakan tidak hilang.

- `id`, `warehouse_layout_id`;
- `position_post` numeric;
- `effective_at`;
- `reason` nullable;
- `created_by`, `created_at`.

Posisi saat ini adalah event terbaru per gudang. Tambahkan optimistic version/expected current event agar dua user tidak saling menimpa posisi.

### Chemistry dan quality

- Untuk data native, chemistry/quality lot dan layer dihitung dari `mixes + mix_items` dengan fungsi domain yang sudah ada.
- Mutu kumulatif lot menggunakan weighted aggregation berdasarkan tonase Mix terkait.
- Jangan membuat tabel chemistry editable kedua sebagai source of truth.
- Data historis Excel yang belum memiliki Mix dapat diimpor sebagai snapshot immutable dengan provenance `LEGACY_IMPORT` dan kemudian ditandai jelas di UI.

## 7. Kontrak API

### Read

- `GET /api/v1/stockpile-map/layouts`
- `GET /api/v1/stockpile-map?layoutId=...&asOf=...`
- `GET /api/v1/stockpile-map/lots/:lotId/trace`
- `GET /api/v1/stockpile-map/history?layoutId=...&dateFrom=...&dateTo=...`

Response peta sebaiknya sudah berbentuk read model tunggal: layout, zones, layers, lot summaries, target bands, current REC, dan freshness. Frontend tidak perlu menggabungkan banyak endpoint chemistry sendiri.

### Write

- `POST /api/v1/stockpile-map/lots`
- `POST /api/v1/stockpile-map/layers`
- `PATCH /api/v1/stockpile-map/layers/:id`
- `POST /api/v1/stockpile-map/reclaimer-events`
- CRUD layout/zone khusus `SUPERVISOR_ADMIN`.

Semua payload divalidasi dengan Zod di `packages/contracts`, semua write diaudit, dan browser tetap melalui API—tidak direct write ke Supabase/PostgreSQL.

### Validasi penting

- koordinat berada dalam range gudang;
- `start_post` dan `end_post` dinormalisasi sesuai arah gudang;
- lane dan layer index valid;
- lot, logical pile, Mix, material, dan plant konsisten;
- penempatan aktif tidak tumpang tindih pada lane/layer yang sama kecuali aturan bisnis membolehkan;
- REC harus berada dalam panjang sumbu gudang tetapi tidak wajib snap ke nomor tiang;
- write konflik mengembalikan `409`, bukan silent overwrite.

## 8. Integrasi dengan repository saat ini

### Frontend

- route baru `apps/web/src/routes/_authenticated/peta-mutu.tsx`;
- menu role-aware di `apps/web/src/routes/_authenticated.tsx`;
- API client dan types di `apps/web/src/features/stockpile-map/stockpile-map-api.ts`;
- komponen terpisah `WarehouseMap`, `WarehouseOverview`, `ReclaimerHandle`, `LayerDetails`, dan `QualityLegend`;
- styling responsif mengikuti design system teal yang sudah ada, idealnya dipisahkan dari route agar halaman tidak menjadi satu file besar;
- TanStack Query untuk read model dan mutation + invalidation setelah save.

### Contracts/domain

- `packages/contracts/src/stockpile-map.ts` untuk schema request/response;
- `packages/domain/src/stockpile-map` untuk types, port, coordinate validation, target-status mapping, dan weighted lot aggregation;
- ekspor dari index package terkait.

### Database/backend

- migration baru setelah `0011`, misalnya `0012_stockpile_map.sql`;
- schema Drizzle `packages/db/src/schema/stockpile-map.ts`;
- repository `packages/db/src/repositories/stockpile-map.repository.ts`;
- module Fastify `apps/api/src/modules/stockpile-map/{routes,service}.ts`;
- wiring repository/service/routes di `apps/api/src/app.ts`;
- audit events memakai mekanisme `audit_logs` yang sudah ada.

### Data existing yang dapat dipakai ulang

- `mixes.batch_no`, `mixes.tiang_ke`, `mixes.pile_cycle`;
- `piles`, `plants`, dan `quality_targets`;
- Mix Summary/Pile Cumulative serta shared chemistry formulas;
- trace Mix → Mix Item → Raw Sample dan actor audit.

Data existing belum cukup untuk menggambar posisi: belum ada rentang tiang, lane/layer, lot fisik, zone layout, atau event REC.

## 9. Tahapan implementasi

### Tahap 0 — Klarifikasi dan mapping data (1–2 hari)

- validasi arti nomor pile fisik, batch, cycle, dan label layer;
- dokumentasikan konfigurasi LS 4, LS 5, Clay 4, dan Clay 5;
- tentukan sumber update posisi REC: manual, file import, atau integrasi alat;
- siapkan mapping 5–10 contoh dari Excel ke Mix native.

Exit criteria: satu contoh tiap gudang dapat direpresentasikan tanpa data ambigu.

### Tahap 1 — Read-only vertical slice (3–4 hari)

- migration layout/zone/lot/layer;
- seed empat layout gudang;
- read model API;
- halaman focus + overview, tooltip, selection detail, target legend;
- empty/error/loading/stale state;
- unit test coordinate dan aggregation, API test read model.

Exit criteria: screenshot referensi dapat direkonstruksi dari data DB dan chemistry berasal dari Mix.

### Tahap 2 — Editing operasional (3–4 hari)

- create/update lot dan layer placement;
- drag + keyboard REC, snap dan explicit save;
- optimistic concurrency, collision validation, audit trail;
- role guard dan correction reason.

Exit criteria: dua user tidak dapat silent-overwrite REC/layer dan semua perubahan dapat ditelusuri.

### Tahap 3 — Polish dan histori (2–3 hari)

- snapshot `as of` read-only sudah diimplementasikan; compare waktu, playback, dan histori gerakan terperinci masih lanjutan;
- import data awal dari workbook/CSV tervalidasi;
- responsive QA, keyboard accessibility, print/export PNG/PDF bila dibutuhkan;
- performance profiling dan index tuning.

Estimasi total MVP: 8–12 hari engineering setelah data dan aturan bisnis disepakati. Integrasi otomatis ke PLC/DCS tidak termasuk estimasi ini.

## 10. Acceptance criteria MVP

- Empat layout contoh (LS 4, LS 5, Clay 4, Clay 5) berasal dari konfigurasi DB, bukan koordinat hardcoded per React component.
- Nomor tiang dan posisi layer benar pada desktop; peta tetap dapat digunakan pada tablet/mobile tanpa label bertumpuk tidak terbaca.
- Klik layer menampilkan chemistry, quality, target, tonase, Mix, dan waktu update yang konsisten dengan backend.
- Mutu lot merupakan weighted aggregation, bukan average sederhana antar layer.
- Status warna konsisten dengan `quality_targets`; missing value tidak dianggap nol atau OK.
- REC dapat digeser dengan pointer dan keyboard pada posisi pecahan, preview sebelum save, lalu membuat event audit.
- Conflict, invalid placement, loading, API error, empty data, stale data, dan no chemistry memiliki state UI yang jelas.
- QC Analyst dan Supervisor/Admin dapat membaca; hak write mengikuti keputusan RBAC dan tetap diverifikasi server-side.
- Tidak ada chemistry summary editable baru yang menggantikan `mixes + mix_items` sebagai authoritative data.

## 11. Brainstorming lanjutan, di luar MVP

- playback perubahan susunan pile per waktu;
- overlay arah reclaim dan estimasi material berikutnya yang terambil;
- simulasi blending: pilih beberapa layer lalu tampilkan proyeksi LSF/SM/AM hasil reclaim;
- heatmap deviasi parameter sepanjang tiang;
- notifikasi ketika REC mendekati layer out-of-spec;
- scan QR pada lokasi/pile untuk membuka detail langsung;
- integrasi posisi REC otomatis dari PLC/DCS dengan sumber dan timestamp yang eksplisit;
- compare `planned placement` vs `actual placement`;
- export snapshot untuk briefing shift dan handover.

Fitur simulasi harus diberi label proyeksi dan tidak boleh mengubah data aktual tanpa workflow konfirmasi terpisah.

## 12. Keputusan bisnis final

1. Nomor lot default diambil dari `pile_cycle`, tetapi user dapat memilih input manual atau mengeditnya.
2. Satu layer dapat berisi lebih dari satu Mix; default operasionalnya satu Mix.
3. Dimensi kotak, termasuk tinggi, menunjukkan level fisik.
4. Rentang posisi boleh pecahan walaupun input bulat lebih disukai; posisi REC tidak harus tepat pada nomor tiang.
5. `QC_ANALYST` dan `SUPERVISOR_ADMIN` dapat mengubah layer dan REC; reason tidak wajib.
6. User dapat memilih tampilan lot aktif, lot yang sudah direclaim, atau semua lot.
7. Tidak ada import Excel pada MVP. Chemistry, quality, dan tonase terintegrasi langsung dengan Mix Summary pada `qc-reports.tsx` melalui `v_mix_summary`.
