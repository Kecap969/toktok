// ============================================
// KONFIGURASI
// ============================================
//
// Daftar video (video-list) tetap lewat Supabase Edge Function — ringan,
// cuma metadata, jadi API key Drive tetap aman di sisi server untuk itu.
//
// Video ITU SENDIRI sekarang di-stream LANGSUNG dari Google Drive
// (bukan lewat proxy lagi), supaya tidak kena batas waktu/streaming
// Edge Function untuk file besar. Konsekuensinya: GOOGLE_DRIVE_API_KEY
// di bawah ini ikut terkirim ke browser (bisa dilihat lewat DevTools).
//
// WAJIB: batasi key ini di Google Cloud Console -> Credentials -> key ini
// -> "Application restrictions" -> HTTP referrers -> isi domain situs Anda
// (mis. https://domain-anda.com/*), supaya key tidak bisa dipakai dari luar.
//
// Sisi server (Supabase Edge Function secrets) yang masih perlu diisi manual
// untuk function video-list:
//   GOOGLE_DRIVE_API_KEY   -> API key dari Google Cloud Console
//   GOOGLE_DRIVE_FOLDER_ID -> ID folder Drive
// Cara set: dashboard Supabase -> Project Settings -> Edge Functions -> Secrets
// atau CLI: supabase secrets set GOOGLE_DRIVE_API_KEY=xxx GOOGLE_DRIVE_FOLDER_ID=xxx

// URL project Supabase Anda (sudah diisi otomatis untuk project "FeedTok")
const SUPABASE_FUNCTIONS_URL = "https://uslfcorrwzekvpyhzyvo.supabase.co/functions/v1";

// API key Google Drive dipakai di BROWSER untuk streaming video langsung.
// Harus key yang SAMA (atau key baru khusus) dengan referrer restriction
// aktif — jangan pakai key tanpa restriction di sini.
const GOOGLE_DRIVE_API_KEY = "AIzaSyBxmHrrGOA_TseA3OtthWtXkjsda_vVtfQ";

// Nama tampilan default untuk uploader
const DEFAULT_USERNAME = "@feed";

// Set true kalau mau urutan video diacak setiap kali halaman dibuka.
const SHUFFLE_FEED = false;
