# IG AutoDM Worker — panduan singkat

[English README](../README.md) · [Panduan instalasi lengkap](runbook.md) · [Biaya dan batas layanan](06-cost-and-ops.md)

Ubah komentar keyword di Instagram menjadi DM berisi tautan yang diminta pengguna. Aplikasi berjalan di akun Cloudflare milikmu sendiri dan memakai API resmi Meta, tanpa password Instagram, cookies, scraping, atau API tidak resmi.

## Cara kerjanya

1. Pengguna mengetik keyword pada post yang kamu tentukan.
2. Aplikasi mengirim DM pembuka dengan tombol.
3. Setelah tombol ditekan, aplikasi mengirim tautan atau pesan final.
4. Opsional: balasan komentar publik dan pengecekan follow sebelum pesan final.

## Sebelum mulai

- Template ini untuk satu akun Instagram Business atau Creator, bukan layanan multi-akun.
- Kamu perlu mengatur aplikasi Meta, akses API, serta Cloudflare Workers, D1, dan Queues.
- Tidak ada jaminan persetujuan App Review atau pengiriman setiap pesan.
- Free tier punya batas harian. Jangan menganggap jumlah followers atau trafik bulanan saja cukup untuk menghitung biaya.
- Polling cadangan bergiliran maksimal 10 post per menit, mengambil 25 komentar terbaru per post. Post ramai tetap membutuhkan webhook yang berfungsi.

## Mulai dari sini

Ikuti [Get started](../README.md#get-started) untuk menyalin repo, memasang dependensi, menyalin konfigurasi contoh, dan menjalankan pemeriksaan lokal.

Jangan mengaktifkan otomasi sebelum konfigurasi selesai. Gunakan satu campaign uji terlebih dahulu dan periksa alur komentar → DM pembuka → interaksi pengguna → pesan final. Respons sehat dari endpoint health belum membuktikan seluruh alur berjalan.

Jangan membagikan token, isi konfigurasi privat, identitas akun, atau data audiens di issue dan screenshot. Pertanyaan setup bisa diajukan dalam bahasa Indonesia atau Inggris di [Discussions](https://github.com/aldoprianandi/ig-autodm-worker/discussions).

Ingin membantu? Perbaikan dokumentasi dan tes tanpa token produksi juga berguna. Lihat [panduan kontribusi](../CONTRIBUTING.md).
