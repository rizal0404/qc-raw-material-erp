# Rencana peningkatan OCR tulisan tangan laporan Limestone

Tanggal: 28 Agustus 2026. Status: increment pertama (parser 0.2) telah diimplementasikan; target produksi dan keseluruhan roadmap belum tercapai.

## Status increment pertama

Sudah tersedia: crop DT/retase mengikuti garis lokal, deteksi jumlah baris tanpa fixed count pada grid yang valid, guard mismatch antar-kolom, overlay/contact sheet lokal, evaluator exact-match dan crop-oracle, validasi split dataset, metadata polygon, skor UI per field, filter masalah, dan tes kompatibilitas hasil lama.

Ini fondasi Tahap 0/1 dan sebagian Tahap 5, bukan penyelesaian seluruh tahap. Belum tersedia dataset berlabel independen 30–50 laporan, registrasi anchor halaman penuh/orientasi otomatis, model handwriting baru, fleet-constrained recognition, tally, confidence terkalibrasi, atau reparse versi baru yang mempertahankan draft. Window pencarian masih spesifik template empat blok. Lihat `services/limestone-parser/README.md` untuk menjalankan benchmark dan batas operasional.

## 1. Hasil yang dituju

Mengurangi koreksi manual pada tanggal, shift, vendor, DT/AA, retase per baris, total vendor, dan total per jam. Hasil akhir tetap draft yang harus direview sebelum konfirmasi ke rekonsiliasi retase dan Mixing Workbench. Ketepatan hubungan vendor–DT–assignment AM/Source lebih penting daripada banyaknya kolom yang berhasil diisi.

Rencana ini melanjutkan baseline saat ini dan sasaran dokumen `limsetone_report_implementation_plan.md`. Tidak mengganti alur ledger/rekonsiliasi/mixing, tidak otomatis membuat master atau assignment, dan tidak mengonfirmasi laporan secara otomatis. Tidak ada pemrosesan ulang laporan produksi, instalasi model, atau pengiriman gambar ke layanan eksternal dalam penyusunan rencana ini.

## 2. Diagnosis berdasarkan implementasi aktual

- `services/limestone-parser/parser.py`: koreksi perspektif bergantung pada kontur kertas empat titik dengan luas minimal 80% gambar. Jika tidak ditemukan, gambar hanya di-resize menjadi 1600 × 2200. Ini tidak menjamin kotak tabel sesuai template, terutama ketika tepi kertas tertutup clipboard, terpotong, atau melengkung.
- `template.json`: semua crop memakai koordinat relatif tetap. Empat blok diasumsikan selalu berisi 17, 13, 14, dan 11 baris dengan tinggi merata. Perubahan posisi form atau jarak garis dapat menggeser crop ke baris tetangga. Screenshot konsisten dengan masalah ini, tetapi perlu overlay dan anotasi untuk mengukur kesalahannya.
- Pembersihan crop hanya menghapus garis horizontal panjang. Garis vertikal, lingkaran total, dan goresan yang menempel ke garis belum ditangani khusus; penghapusan garis yang agresif juga berisiko merusak digit.
- OCR menggunakan Tesseract `eng`, mayoritas PSM 7, dengan beberapa varian preprocessing. Belum ada recognizer tulisan tangan yang diuji pada crop laporan ini.
- Kandidat OCR dipilih dari skor internal tertinggi; skor dibatasi 0,74 dan diturunkan ketika varian berbeda. Nilai ini belum dikalibrasi sebagai peluang benar.
- Di `photo-report-import.tsx`, persentase pada kolom OCR/Review berasal dari observation retase saja. DT salah dapat tampil berdampingan dengan skor retase yang tampak cukup tinggi. Filter `lowOnly` sebenarnya memilih baris belum direview, bukan confidence rendah.
- Pencocokan assignment di UI mengandalkan kesamaan DT setelah normalisasi. Parser belum memakai kandidat fleet untuk membedakan digit ambigu. Backend mendukung alias saat validasi, tetapi pilihan UI belum memakai alias dengan cara yang sama.
- `benchmark.py` hanya menghitung jumlah baris yang terisi; nilai terisi tetapi salah tetap terlihat sebagai keberhasilan. Belum ada pengukuran exact-match terhadap label manusia.
- Tally per sel belum diekstrak, sehingga belum tersedia bukti pembanding untuk angka total tertulis.

Kesimpulan: prioritas pertama adalah memastikan model membaca sel yang benar. Mengganti model tanpa memperbaiki crop dapat tetap menghasilkan angka yang salah.

## 3. Prioritas data dan batas keamanan

P0: geometri tabel, kelengkapan baris, tanggal/shift, vendor, DT, retase, dan assignment yang benar. P1: total vendor/per jam dan confidence yang dapat diuji. P2: footer produksi dan catatan tulisan tangan; keduanya tidak boleh menghambat eksperimen angka retase.

Prinsip yang tidak boleh dilanggar:

- Pertahankan row index sumber, DT duplikat, nol di depan pada teks sumber, raw OCR, crop/bounding box, versi parser/model/template, dan riwayat koreksi.
- Bedakan kosong, nol tertulis, tidak terbaca, sel terpotong, dan coretan pembatalan. Tidak terbaca bukan nol.
- Vendor berdasarkan posisi hanyalah petunjuk; bukan identitas master yang pasti.
- Kandidat fleet mempersempit pilihan, bukan menggantikan bukti gambar. DT yang tidak ada di master tidak boleh diam-diam diganti dengan unit terdekat.
- Tanggal laporan tidak diganti tanggal upload. Jika header ambigu, minta review sebelum memakai assignment kontekstual.
- DT yang memiliki beberapa assignment dalam satu shift tetap membutuhkan keputusan manusia karena foto tidak menyediakan jam dump individual.
- Selisih total adalah konflik sumber yang perlu ditinjau, bukan izin mengarang angka agar penjumlahan seimbang.
- Retase per AM/vendor dihitung dari baris yang sudah dikaitkan ke assignment efektif. Tonase footer bukan tonase terukur per vendor.

## 4. Tahapan implementasi dan acceptance gate

### Tahap 0 — Dataset berlabel dan diagnosis crop

Mulai dari foto asli contoh, bukan screenshot halaman aplikasi. Tambahkan 30–50 laporan unik untuk pilot, mencakup beberapa tanggal, shift, penulis, perangkat, tingkat kemiringan, bayangan, blur, lingkaran total, coretan, dan perubahan jumlah baris. Jumlah ini adalah titik awal diagnosis, bukan bukti akurasi produksi.

Label manusia: blok vendor, garis/baris/kolom, DT, retase, total vendor, per jam, tanggal/shift, dan status keterbacaan. Label kritis diperiksa dua reviewer; ketidaksetujuan diselesaikan atau ditandai ambigu, tidak ditebak dari total. Kumpulkan contoh kosong dan nol sebagai kelas berbeda.

Tambahkan benchmark dua tingkat:

1. Recognizer pada crop benar hasil anotasi: mengukur kemampuan membaca tulisan.
2. Pipeline dari foto penuh: mengukur gabungan deteksi, crop, OCR, dan matching.

Pisahkan train/development, validation, dan test menurut dokumen asli; foto ulang, crop, dan augmentasi dari satu laporan harus berada pada split yang sama. Sertakan penulis/perangkat yang tidak muncul di training. Kunci test set sebelum tuning. Perluas dataset sebelum klaim produksi atau fine-tuning besar.

Deliverable: label schema, manifest privat, overlay semua ROI, contact sheet crop DT/retase, baseline exact-match, dan daftar error per tahap. Jangan commit foto operasional atau nama operator ke repo publik; gunakan fixture yang disetujui atau disamarkan.

Gate: semua hasil benchmark dapat dilacak ke foto, baris, crop, prediksi, dan label; sel kosong/tidak terbaca tidak menaikkan angka akurasi secara semu.

### Tahap 1 — Registrasi tabel dan segmentasi baris dinamis

Deteksi orientasi, batas tabel, garis horizontal/vertikal, titik perpotongan, dan anchor cetak. Gunakan model layout template sebagai panduan struktur, bukan koordinat crop mutlak. Estimasi transformasi dari anchor/grid ketika batas kertas tidak lengkap. Deteksi ketidakcocokan layout dan form yang belum didukung.

Pisahkan header, empat blok vendor, tabel DT/jam/total, baris subtotal berlingkar, dan footer. Tentukan batas baris aktual dari grid; jangan membagi satu rentang menjadi jumlah baris tetap. Deteksi isi per baris secara konservatif: tulisan samar atau terpotong tetap muncul untuk review, bukan dibuang sebagai baris kosong.

Simpan transformasi sumber–normalisasi, ukuran gambar, identitas sel stabil, dan quality/alignment score. Crop memakai margin adaptif tanpa mengambil digit tetangga. Mulai dengan homography; gunakan koreksi lokal berbasis grid hanya bila residual menunjukkan kelengkungan. Hindari enhancement generatif yang dapat mengubah bentuk digit.

Jika alignment gagal, jangan diam-diam melanjutkan sebagai hasil yang terpercaya. Beri opsi foto ulang atau penyesuaian sudut/anchor secara manual. Preview dan bounding box harus memakai koordinat yang sama dengan crop OCR, termasuk setelah zoom/scroll.

Gate pilot: recall baris berisi ≥99%; ≥98% sel kritis yang dianotasi masuk ke crop yang benar tanpa kehilangan digit atau mengambil baris sebelah. Ukur secara terpisah dari akurasi OCR, termasuk foto sulit. Ambang ini target usulan, belum hasil uji.

### Tahap 2 — Benchmark recognizer per jenis field

Bangun interface recognizer yang menerima crop dan tipe field, lalu menghasilkan raw text, beberapa kandidat, skor mentah, model/version, serta alasan abstain. Bandingkan pada crop dan split yang sama:

- Tesseract sebagai baseline/fallback: uji PSM digit/kata/baris, padding, dictionary off untuk angka, dan karakter yang diizinkan sesuai field.
- PaddleOCR recognizer yang mendukung handwriting, dengan `en_PP-OCRv5_mobile_rec` sebagai kandidat awal ringan dan model server sebagai pembanding jika dibutuhkan. Versi/model final dipilih berdasarkan benchmark dan kompatibilitas runtime, bukan label “terbaru”. Dokumentasi menyebut dukungan handwritten English; akurasi pada digit laporan ini tetap harus dibuktikan. [Dokumentasi PaddleOCR](https://www.paddleocr.ai/latest/en/version3.x/module_usage/text_recognition.html).
- TrOCR handwritten sebagai pembanding pada crop baris/sel. Model yang tersedia di namespace Microsoft dilatih lanjut pada IAM dan ditujukan untuk gambar satu baris teks; itu bukan jaminan akurasi pada angka berlingkar atau form Indonesia. [Model card TrOCR](https://huggingface.co/microsoft/trocr-base-handwritten).

Gunakan recognizer berbeda bila perlu untuk DT, angka retase, tanggal, total berlingkar, dan teks bebas. DT dipertahankan sebagai string. Penanganan lingkaran/garis menghasilkan varian tambahan; crop asli selalu ikut dibandingkan agar goresan angka tidak hilang. Jangan memilih hasil semata-mata dari confidence mentah tertinggi antar-engine yang belum sebanding.

Uji pembacaan satu sel dengan konteks baris sebagai pembanding, tetap mengikat setiap hasil pada selnya. Batch crop dan muat model sekali per proses agar tidak mengulang biaya startup. Pin dependency serta model revision/checksum; uji CPU Windows yang dipakai sekarang sebelum merekomendasikan GPU atau deployment lain.

Gate: laporan per-field exact-match, abstention/coverage, kandidat top-3, latency warm/cold, dan RAM pada perangkat aktual. Pilih satu engine utama; second pass hanya untuk field ambigu jika memberi manfaat terukur. Fine-tuning dilakukan sesudah error crop teratasi dan learning curve menunjukkan model umum belum cukup; angka sintetis/MNIST tidak menggantikan data nyata laporan.

### Tahap 3 — Kandidat fleet dan validasi silang

Tambahkan tahap kandidat setelah ekstraksi visual, menggunakan vendor, tanggal, shift, crusher, unit/alias, dan assignment efektif yang tersedia dari aplikasi. Simpan snapshot/versi referensi untuk reproduksibilitas; validasi ulang saat konfirmasi.

Kombinasikan bukti visual, alternatif karakter yang memang didukung crop, kesesuaian fleet, dan aturan hitung sebagai ranking yang dapat dijelaskan. Contoh `l53` → kandidat `153` boleh diajukan, tetapi bukan substitusi global tanpa bukti. Jika vendor/tanggal/shift belum jelas, tampilkan beberapa kemungkinan atau minta pengguna menetapkannya lalu ulang matching tanpa harus OCR ulang.

Bedakan pesan UI: “angka DT belum terbaca”, “DT tidak terdaftar”, “vendor belum dipilih”, “assignment belum tersedia”, dan “lebih dari satu assignment”. Gunakan normalisasi/alias bersama di frontend dan backend. Tidak membuat assignment baru dari hasil OCR.

Gate: tidak ada auto-selection untuk kandidat yang ambigu, referensi lintas vendor, atau konteks tanggal/shift yang belum sah. Laporkan akurasi DT mentah dan hasil constrained matching secara terpisah agar perbaikan tidak menyembunyikan salah baca.

### Tahap 4 — Tally sebagai bukti independen

Setelah grid stabil, deteksi tanda retase per sel jam dengan line mask tingkat tabel, komponen goresan, dan bila perlu classifier kecil dari crop tally berlabel. Penghapusan garis vertikal harus berhati-hati karena goresan tally juga vertikal; jangan memakai penghapusan garis generik yang menghapus keduanya.

Simpan secara terpisah: angka total baris tertulis, tally per sel/jam, total vendor tertulis, dan jumlah hitung. Periksa tally baris versus total baris; jumlah baris versus total vendor; jumlah per jam versus total vendor. Tally menjadi bukti pembanding, bukan sumber yang selalu lebih benar. Coretan, tanda silang pembatalan, atau goresan menyatu diarahkan ke review.

Gate: exact-count tally diuji pada crop nyata, termasuk kasus 0/kosong/ambigu. Tidak ada hasil hitung turunan yang diberi label seolah angka tersebut tertulis pada foto.

### Tahap 5 — Confidence dan review yang membantu

Tampilkan crop DT dan retase di samping nilai; fokus field menyorot lokasi yang tepat. Pisahkan confidence DT, retase, alignment, dan kualitas matching. Selama belum dikalibrasi, tampilkan “skor model, belum terkalibrasi”, bukan kesan probabilitas benar.

Sediakan kandidat top-3 beserta crop, perbandingan angka tertulis versus jumlah hitung, navigasi keyboard, dan filter terpisah: belum direview, tidak terbaca, konflik total, assignment ambigu, confidence rendah. Perubahan tanggal/vendor/DT membatalkan matching atau status review yang terdampak.

Kalibrasi confidence pada validation set, evaluasi pada test set, dan ukur precision terhadap coverage. Tambahkan label “perlu cek posisi crop” saat alignment rendah. Target presisi field berlabel keyakinan tinggi ≥99,5% hanya boleh diklaim setelah dukungan sampel memadai; ini tetap tidak menghapus kewajiban konfirmasi manusia.

Reparse versi baru harus membuat run/candidate draft terpisah dengan diff. Jangan menimpa koreksi pengguna atau laporan CONFIRMED. Endpoint saat ini hanya mengizinkan reparse FAILED, sehingga perbandingan versi perlu workflow eksplisit baru, bukan melonggarkan endpoint lama tanpa pengaman. Gunakan stable source IDs agar pindah/hapus baris tidak memindahkan evidence ke baris lain.

### Tahap 6 — Pilot, regresi, dan rollout

Jalankan parser baru dalam mode pembanding pada fixture dan laporan yang diizinkan; hasil tidak menulis ledger. Catat tahap worker, versi model/template, durasi, jumlah sel tidak terbaca, alasan fallback, serta kebutuhan review. Pisahkan timeout model, kegagalan alignment, dan antrean worker tidak aktif.

Uji ulang kontrak worker, optimistic revision, draft lama, field bbox, vendor/assignment scope, konfirmasi atomik, duplicate DT, pencegahan impor ganda, rekonsiliasi, dan konsumsi retase mixing. Rollout melalui pilihan versi parser/feature flag; rollback mempertahankan gambar, hasil run, koreksi, dan laporan canonical.

Gate: target akurasi dan waktu review terpenuhi pada test set terpisah, tidak ada regresi integritas retase, dan operator menyetujui pengalaman review pada pilot. Model/runtimenya dikunci sebelum rollout; perubahan schema jika benar-benar diperlukan memakai migrasi baru, bukan mengedit migrasi 0019 yang telah diterapkan.

## 5. Metrik keberhasilan

Sasaran produksi dari rencana awal dipertahankan sebagai target, bukan janji hasil:

| Metrik | Target |
| --- | --- |
| Tanggal dan shift, dilaporkan terpisah | ≥99% exact-match |
| Identitas vendor | ≥99% exact-match |
| DT/AA | ≥97% exact-match |
| Retase per baris | ≥98% exact-match |
| Footer numerik | ≥99% exact-match |
| Total vendor / per jam | ≥98% exact-match, target tambahan usulan |
| Waktu review median | turun ≥50% dari baseline pada laporan sebanding |

Laporkan juga tuple benar `(vendor, baris sumber, DT, retase)`, tingkat laporan benar seluruh baris, jumlah salah mapping AM/Source, angka palsu pada sel kosong, recall baris, dan mismatch total. Jumlah total yang cocok tidak membuktikan DT atau distribusi retase benar.

Exact-match end-to-end dihitung terhadap semua field yang dilabeli terbaca, termasuk kegagalan segmentasi dan output kosong sebagai kegagalan. Sel yang benar-benar tidak terbaca dinilai pada abstention yang tepat, bukan dikeluarkan diam-diam. Tampilkan skor crop-oracle dan foto-penuh terpisah, serta nilai sebelum dan sesudah koreksi manusia. Coverage rendah tidak boleh membuat precision tampak berhasil tanpa mengurangi pekerjaan operator.

Laporkan ukuran sampel, variasi penulis/perangkat, dan interval ketidakpastian. Dataset pilot kecil tidak cukup membuktikan target 99–99,5%; tambah data sampai estimasi layak untuk keputusan rollout. Latency diukur P50/P95 pada host nyata, cold dan warm, lalu tetapkan budget berdasarkan kebutuhan operasional; jangan menjanjikan waktu proses sebelum pengukuran.

## 6. Pemetaan pekerjaan ke repo

- `services/limestone-parser/parser.py`: jadikan orchestrator; pecah alignment, segmentation, recognizers, preprocessing, tally, dan confidence ke modul teruji.
- `services/limestone-parser/template.json`: struktur/anchor template dan toleransi layout; hilangkan asumsi jumlah baris tetap dari penentuan crop.
- `services/limestone-parser/benchmark.py` dan tests: evaluator ground truth, split manifest, overlay, crop-oracle versus end-to-end, dan laporan regresi.
- `apps/api/src/scripts/limestone-parser-worker.ts`: pipeline versi baru, batching/model lifecycle, status per tahap, timeout dan run metadata.
- `packages/contracts/src/crusher-report.ts`: kontrak tambahan kandidat, confidence metadata, stable source IDs, dan evidence tally; tetap kompatibel dengan draft/run lama.
- `packages/domain/src/crusher-report/`: normalisasi/alias bersama, candidate ranking, aturan abstain, dan validasi silang tanpa mengarang nilai.
- `apps/api/src/modules/crusher-report/` serta repository terkait: konteks fleet/assignment, run pembanding dan penerapan hasil secara eksplisit, menjaga audit dan validasi konfirmasi.
- `apps/web/src/features/retase/photo-report-import.tsx` beserta tests/CSS: crop per field, confidence terpisah, kandidat, alasan mismatch, filter, dan diff run.
- Tes integrasi existing: pastikan format sumber baru tetap menghasilkan retase dan alokasi mixing yang sama setelah konfirmasi.

## 7. Urutan eksekusi yang disarankan

Paket pertama: Tahap 0 + Tahap 1, ditambah koreksi label confidence UI. Hasil yang harus terlihat adalah overlay/crop benar dan benchmark yang membedakan salah potong dari salah baca. Ini dapat dimulai dengan foto yang sudah tersedia; bukti generalisasi tetap membutuhkan tambahan laporan.

Paket kedua: Tahap 2 + Tahap 3 dan review kandidat. Keputusan engine/fine-tuning dibuat setelah benchmark, bukan sebelumnya.

Paket ketiga: Tahap 4–6, kalibrasi, pilot, dan regresi downstream. Estimasi durasi baru ditetapkan setelah jumlah data berlabel, hardware target, dan kecepatan review manusia diketahui.

LLM/VLM tetap fallback opsional sesuai rencana awal, bukan dependensi utama. Evaluasi lokal atau cloud dilakukan terpisah hanya jika manfaatnya terbukti; layanan cloud memerlukan persetujuan pengiriman data, batas biaya, dan kebijakan retensi. Semua hasil tetap melalui validasi dan review yang sama.

Dasar teknis prioritas crop: dokumentasi Tesseract menjelaskan pengaruh kemiringan, border, segmentation mode, dan kebutuhan analisis layout khusus untuk tabel. Ini mendukung urutan eksperimen, bukan membuktikan akar masalah setiap sel pada screenshot. [Tesseract — Improving quality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).
