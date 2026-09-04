// ============================================
// KONFIGURASI (via Supabase Edge Function proxy)
// ============================================
//
// API key Google Drive TIDAK lagi disimpan di sini.
// Video sekarang di-proxy + di-cache lewat Supabase, supaya:
//  - API key Drive tidak ke-expose ke browser
//  - Video di-cache di Supabase Storage (mengurangi 403 kuota Drive)
//  - Range request (seek/buffer) lebih stabil, terutama di Safari/iOS
//
// Sisi server (Supabase Edge Function secrets) yang masih perlu diisi manual:
//   GOOGLE_DRIVE_API_KEY   -> API key dari Google Cloud Console
//   GOOGLE_DRIVE_FOLDER_ID -> ID folder Drive (dipakai oleh function video-list)
// Cara set: dashboard Supabase -> Project Settings -> Edge Functions -> Secrets
// atau CLI: supabase secrets set GOOGLE_DRIVE_API_KEY=xxx GOOGLE_DRIVE_FOLDER_ID=xxx

// URL project Supabase Anda (sudah diisi otomatis untuk project "FeedTok")
const SUPABASE_FUNCTIONS_URL = "https://uslfcorrwzekvpyhzyvo.supabase.co/functions/v1";

// Nama tampilan default untuk uploader
const DEFAULT_USERNAME = "@feed";

// Set true kalau mau urutan video diacak setiap kali halaman dibuka.
const SHUFFLE_FEED = false;
