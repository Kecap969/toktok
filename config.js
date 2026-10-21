// ============================================
// KONFIGURASI
// ============================================
//
// Daftar video (video-list), heartbeat viewer (viewer-heartbeat), data admin
// (admin-sessions) dan manajemen video (admin-videos) semua lewat Supabase
// Edge Function -- bukan lewat REST API Supabase langsung dari browser.
// Karena itu browser tidak perlu (dan tidak diberi) anon key Supabase.
//
// Video di-stream LANGSUNG dari Cloudflare R2 lewat URL publiknya (disimpan
// di tabel "videos" di Supabase). Tidak ada API key apa pun di browser.
//
// Secret yang perlu di-set di sisi server (Supabase Edge Functions):
//   ADMIN_PASSWORD         -> password admin (samakan dengan yang sudah dipakai)
//   R2_ACCOUNT_ID          -> Account ID Cloudflare
//   R2_ACCESS_KEY_ID       -> R2 API token (Object Read & Write)
//   R2_SECRET_ACCESS_KEY   -> pasangan dari access key di atas
//   R2_BUCKET              -> nama bucket R2
//   R2_PUBLIC_BASE_URL     -> URL publik bucket, mis. https://pub-xxxx.r2.dev
//                             atau https://video.domain-anda.com (tanpa "/" di akhir)
// Cara set: dashboard Supabase -> Project Settings -> Edge Functions -> Secrets

// URL project Supabase Anda (sudah diisi otomatis untuk project "FeedTok")
const SUPABASE_FUNCTIONS_URL = "https://uslfcorrwzekvpyhzyvo.supabase.co/functions/v1";

// Nama tampilan default untuk uploader
const DEFAULT_USERNAME = "@feed";

// Set true kalau mau urutan video diacak setiap kali halaman dibuka.
const SHUFFLE_FEED = false;
