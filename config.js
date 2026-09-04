// ============================================
// ISI DUA VARIABEL INI SESUAI PUNYA ANDA
// ============================================

// API Key dari Google Cloud Console (aktifkan "Google Drive API" dulu)
// PENTING: batasi API key ini di Google Cloud Console -> Credentials ->
// "Application restrictions" -> HTTP referrers -> isi domain GitHub Pages
// Anda, contoh: username.github.io/*
const API_KEY = "AIzaSyB8MY-5lLPOirCFvXO8qEwHgY5zntv0m4c";

// ID folder Google Drive yang isinya video (folder harus di-share:
// "Anyone with the link" -> Viewer)
// Cara ambil ID: buka folder di Drive, lihat URL-nya
// https://drive.google.com/drive/folders/INI_ID_NYA
const FOLDER_ID = "1RjxjqHRT6X9sU8rH87pfzz6hr-VlKet-";

// Nama tampilan default untuk uploader (karena Drive publik tidak
// menyimpan info "siapa yang posting" per user)
const DEFAULT_USERNAME = "@feed";

// Set true kalau mau urutan video diacak setiap kali halaman dibuka.
// Default false = urutan terbaru dulu (sesuai createdTime di Drive).
const SHUFFLE_FEED = false;
