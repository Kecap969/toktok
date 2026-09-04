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
- Kalau folder berisi ribuan video, pertimbangkan pagination (`pageToken`)
  alih-alih memuat semua sekaligus — versi ini memuat maksimal 100 video
  per load.

## Struktur file

```
index.html   → markup halaman
style.css    → tampilan (dark, full-bleed vertical feed)
app.js       → fetch Drive API + render + autoplay saat scroll
config.js    → API_KEY dan FOLDER_ID (satu-satunya file yang perlu diedit)
```
