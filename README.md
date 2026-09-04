# Feed video dari Google Drive (GitHub Pages)

Frontend statis yang membaca folder Google Drive publik dan menampilkannya
sebagai feed vertikal ala TikTok. Tanpa backend — cocok untuk GitHub Pages.

## 1. Siapkan Google Drive

1. Buat folder di Drive, isi dengan video.
2. Klik kanan folder → **Share** → ubah ke **"Anyone with the link"** → role **Viewer**.
3. Ambil ID folder dari URL:
   `https://drive.google.com/drive/folders/`**`INI_ID_NYA`**

## 2. Siapkan API Key di Google Cloud Console

1. Buka [console.cloud.google.com](https://console.cloud.google.com/) → buat/pilih project.
2. **APIs & Services → Library** → cari **Google Drive API** → Enable.
3. **APIs & Services → Credentials** → **Create Credentials → API Key**.
4. Klik API key yang baru dibuat → **Application restrictions** → pilih
   **HTTP referrers (web sites)** → tambahkan:
   ```
   https://USERNAME.github.io/*
   ```
   (ganti `USERNAME` dengan username GitHub Anda, atau domain custom jika ada)
5. Di **API restrictions**, pilih **Restrict key** → centang hanya **Google Drive API**.

Ini penting: tanpa restriction, siapa pun yang lihat source code halaman Anda
bisa memakai key ini untuk kuota mereka sendiri.

## 3. Isi config.js

Buka `config.js`, isi:

```js
const API_KEY = "AIzaSy...";       // dari langkah 2
const FOLDER_ID = "1a2b3c...";     // dari langkah 1
```

## 4. Deploy ke GitHub Pages

1. Push folder ini (`index.html`, `style.css`, `app.js`, `config.js`) ke repo GitHub.
2. **Settings → Pages** → source: branch `main`, folder `/ (root)`.
3. Tunggu beberapa menit, akses `https://USERNAME.github.io/nama-repo/`.

## Batasan yang perlu Anda tahu

- **Ukuran & kuota**: Drive API punya kuota harian gratis yang cukup besar
  untuk pemakaian pribadi/kecil, tapi kalau trafiknya ramai bisa kena limit
  (per user per 100 detik). Tidak ada cara menghindarinya di arsitektur ini
  karena semua request langsung dari browser pengunjung ke Google.
- **Video sangat besar** (ratusan MB–GB) kadang tetap lambat dibuka pertama
  kali karena Google harus menyiapkan stream-nya; setelah itu biasanya lancar.
- **Tidak ada backend**: like, komentar, jumlah view hanya tersimpan di
  `localStorage` browser masing-masing pengunjung — bukan data global/nyata.
  Kalau nanti butuh itu beneran (like/komentar tersimpan untuk semua orang),
  itu perlu backend/database (mis. Firebase, Supabase) — bisa saya bantu
  kalau sudah sampai tahap itu.
- **API key tetap terlihat** di source code (wajar untuk API key client-side
  read-only), makanya restriction di langkah 2 itu wajib, bukan opsional.
- Video dimuat bertahap (infinite scroll): 8 video per halaman dari Drive,
  otomatis mengambil halaman berikutnya saat Anda mendekati ujung daftar.
  Di sisi pemutaran, hanya video dalam radius 3 dari posisi aktif (maks. 7
  video sekaligus) yang benar-benar diberi `src`/di-preload — video yang
  sudah jauh terlewat otomatis "dilepas" agar tidak membebani memori/
  bandwidth. Angka-angka ini bisa diubah lewat `PAGE_SIZE` dan
  `PRELOAD_RADIUS` di awal `app.js`.

## Struktur file

```
index.html   → markup halaman feed
style.css    → tampilan feed (dark, full-bleed vertical feed)
app.js       → fetch Drive API + render + autoplay saat scroll + kirim data ke dashboard
config.js    → API_KEY, FOLDER_ID, dan kredensial Supabase (satu-satunya file yang perlu diedit)
admin.html   → dashboard admin (satu file, HTML+CSS+JS jadi satu)
```

## 5. Dashboard admin

Buka `admin.html` (mis. `https://USERNAME.github.io/nama-repo/admin.html`)
dan masukkan password yang sudah Anda pilih. Dashboard menampilkan:

- Jumlah pengguna yang sedang aktif menonton saat ini
- Video apa yang sedang ditonton tiap pengguna, beserta lokasi kasar
  (kota/negara, dari IP — bukan GPS)
- Video yang paling banyak ditonton sepanjang waktu
- Sebaran negara pengunjung

**Cara kerja & batasannya:**
- Setiap browser pengunjung punya "session ID" acak yang disimpan di
  `localStorage`, dipakai untuk mencatat video apa yang sedang ditonton
  dan mengirim "heartbeat" tiap 10 detik ke Supabase. Ini bukan akun
  login — kalau pengunjung membuka di browser/incognito lain, dianggap
  sesi baru.
- Lokasi didapat dari IP publik pengunjung lewat layanan gratis
  (ipwho.is) saat pertama buka halaman, jadi hanya seakurat kota/negara,
  bukan alamat persis.
- Password dashboard disimpan **ter-hash** di database (bukan plaintext
  di kode), dan dicek lewat fungsi khusus di Supabase — bukan sekadar
  gerbang tampilan. Tabel data pengguna terkunci penuh (RLS) dan hanya
  bisa dibaca lewat fungsi itu setelah password benar.
- Untuk mengganti password nanti, perlu dijalankan lewat SQL editor di
  Supabase (bisa saya bantu kalau saatnya tiba).
- Karena ini situs statis tanpa server, kunci Supabase yang dipakai di
  `config.js` memang publik/terekspos di source code — ini normal untuk
  "publishable key", dan keamanan datanya bergantung pada RLS + fungsi
  database di atas, bukan pada menyembunyikan kunci ini.
- `admin.html` sengaja dibuat satu file mandiri (CSS & JS sudah digabung
  di dalamnya) supaya tidak perlu upload file terpisah — jadi ia punya
  salinan sendiri `SUPABASE_URL`/`SUPABASE_ANON_KEY`, terpisah dari
  `config.js`. Kalau nanti project Supabase diganti, dua tempat ini
  perlu disamakan.
