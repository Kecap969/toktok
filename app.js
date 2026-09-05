const listEl = document.getElementById("video-list");
const playerEl = document.getElementById("player");
const playerTitleEl = document.getElementById("player-title");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const errorDetailEl = document.getElementById("error-detail");

const bigPlayBtn = document.getElementById("big-play");
const playPauseBtn = document.getElementById("btn-playpause");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const timeCurrentEl = document.getElementById("time-current");
const timeDurationEl = document.getElementById("time-duration");
const seekTrack = document.getElementById("seek-track");
const seekFill = document.getElementById("seek-fill");
const muteBtn = document.getElementById("btn-mute");
const iconMuted = document.getElementById("icon-muted");
const iconUnmuted = document.getElementById("icon-unmuted");
const fullscreenBtn = document.getElementById("btn-fullscreen");
const iconFsEnter = document.getElementById("icon-fs-enter");
const iconFsExit = document.getElementById("icon-fs-exit");
const playerStage = document.getElementById("player-stage");
const playerLoadingEl = document.getElementById("player-loading");
const playerErrorEl = document.getElementById("player-error");
const playerErrorTextEl = document.getElementById("player-error-text");
const playerErrorRetryBtn = document.getElementById("player-error-retry");

function showStatus(which, detail) {
  loadingEl.classList.add("hidden");
  emptyEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  if (which === "loading") loadingEl.classList.remove("hidden");
  if (which === "empty") emptyEl.classList.remove("hidden");
  if (which === "error") {
    errorEl.classList.remove("hidden");
    if (detail) errorDetailEl.textContent = detail;
  }
}

async function fetchVideoList() {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/video-list`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.files || [];
}

function videoSrc(fileId) {
  // Langsung ke Google Drive supaya streaming file besar & Range request
  // (seek) ditangani server Google, bukan Edge Function.
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(GOOGLE_DRIVE_API_KEY)}`;
}

function thumbnailUrl(link) {
  if (!link) return "";
  return link.replace(/=s\d+$/, "=s320");
}

function prettifyCaption(rawName) {
  let base = (rawName || "").replace(/\.[^/.]+$/, "");
  base = base.replace(/^(VID|IMG|MOV|MP4|REC)[-_]?/i, "");

  let dateLabel = "";
  const m = base.match(/(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
  if (m) {
    const [full, y, mo, d, h, mi] = m;
    dateLabel = `${d}/${mo}/${y} ${h}:${mi}`;
    base = base.replace(full, "");
  }

  base = base.replace(/[_-]+/g, " ").trim();
  if (/^\d+$/.test(base)) base = "";

  if (base && dateLabel) return `${base} — ${dateLabel}`;
  return base || dateLabel || "Video";
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- Kontrol custom (menggantikan kontrol bawaan browser) ----------
// Kontrol bawaan browser (attribute "controls") punya menu/tombol download
// di beberapa browser. Dengan kontrol sendiri di sini, tombol/menu itu tidak
// ada. Catatan: ini menghalangi cara download yang mudah/umum, bukan proteksi
// mutlak, karena URL video tetap bisa dilihat lewat DevTools oleh yang paham.

function updatePlayPauseIcon() {
  const playing = !playerEl.paused && !playerEl.ended;
  iconPlay.classList.toggle("hidden", playing);
  iconPause.classList.toggle("hidden", !playing);
  bigPlayBtn.classList.toggle("hidden", playing);
}

function togglePlayPause() {
  if (playerEl.paused || playerEl.ended) {
    playerEl.play().catch(() => {});
  } else {
    playerEl.pause();
  }
}

function showPlayerLoading() {
  if (playerLoadingEl) playerLoadingEl.classList.remove("hidden");
}

function hidePlayerLoading() {
  if (playerLoadingEl) playerLoadingEl.classList.add("hidden");
}

function showPlayerError(message) {
  hidePlayerLoading();
  if (playerErrorTextEl) playerErrorTextEl.textContent = message;
  if (playerErrorEl) playerErrorEl.classList.remove("hidden");
}

function hidePlayerError() {
  if (playerErrorEl) playerErrorEl.classList.add("hidden");
}

// Elemen <video> sendiri tidak memberi tahu kode status HTTP saat gagal
// (cuma kode error generik seperti "network" atau "decode"). Supaya pesan
// ke pengguna bisa lebih spesifik, begitu <video> gagal kita coba tebak
// penyebabnya dengan request kecil (cuma 1 byte lewat header Range) ke URL
// yang sama persis, lalu baca status HTTP dari situ.
async function diagnosePlaybackError(src) {
  // Google tidak izinkan browser membaca kode HTTP asli (403/404/dst) lewat
  // fetch() untuk domain ini (dibatasi CORS di sisi Google, bukan kode kita).
  // Jadi dipakai kode singkat sendiri: E1 = request sampai ke server Google
  // tapi ditolak/gagal (biasanya kuota/izin Drive), E2 = request gagal
  // terkirim sama sekali (jaringan/DNS/diblokir sebelum sampai ke Google).
  try {
    await fetch(src, { method: "HEAD", mode: "no-cors" });
    return "Video gagal diputar (E1: kuota/izin Drive). Coba lagi.";
  } catch {
    return "Video gagal diputar (E2: jaringan). Coba lagi.";
  }
}

playerEl.addEventListener("error", async () => {
  const src = playerEl.currentSrc || playerEl.src;
  if (!src) return;
  const message = await diagnosePlaybackError(src);
  showPlayerError(message);
});

playerEl.addEventListener("playing", hidePlayerError);

if (playerErrorRetryBtn) {
  playerErrorRetryBtn.addEventListener("click", () => {
    if (!currentFile) return;
    hidePlayerError();
    showPlayerLoading();
    playerEl.src = videoSrc(currentFile.id);
    playerEl.load();
    playerEl.play().catch(() => {});
  });
}

// Spinner muncul selama video dimuat/buffering, dan hilang begitu video
// benar-benar mulai jalan (bukan cuma saat "play" ditekan, karena "play"
// bisa dipanggil sebelum video siap dan masih sempat buffer).
playerEl.addEventListener("loadstart", showPlayerLoading);
playerEl.addEventListener("waiting", showPlayerLoading);
playerEl.addEventListener("playing", hidePlayerLoading);
playerEl.addEventListener("pause", hidePlayerLoading);
playerEl.addEventListener("error", hidePlayerLoading);

bigPlayBtn.addEventListener("click", togglePlayPause);
playPauseBtn.addEventListener("click", togglePlayPause);
playerEl.addEventListener("play", updatePlayPauseIcon);
playerEl.addEventListener("pause", updatePlayPauseIcon);
playerEl.addEventListener("ended", updatePlayPauseIcon);

// klik di badan video (bukan tombol) juga toggle play/pause
playerEl.addEventListener("click", togglePlayPause);

playerEl.addEventListener("loadedmetadata", () => {
  timeDurationEl.textContent = formatTime(playerEl.duration);
});

playerEl.addEventListener("timeupdate", () => {
  timeCurrentEl.textContent = formatTime(playerEl.currentTime);
  if (playerEl.duration) {
    seekFill.style.width = `${(playerEl.currentTime / playerEl.duration) * 100}%`;
  }
});

function seekFromEvent(clientX) {
  if (!playerEl.duration) return;
  const rect = seekTrack.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  playerEl.currentTime = ratio * playerEl.duration;
}

let isSeeking = false;
seekTrack.addEventListener("pointerdown", (e) => {
  isSeeking = true;
  seekFromEvent(e.clientX);
});
window.addEventListener("pointermove", (e) => {
  if (isSeeking) seekFromEvent(e.clientX);
});
window.addEventListener("pointerup", () => {
  isSeeking = false;
});

muteBtn.addEventListener("click", () => {
  playerEl.muted = !playerEl.muted;
  iconMuted.classList.toggle("hidden", !playerEl.muted);
  iconUnmuted.classList.toggle("hidden", playerEl.muted);
});

fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    playerStage.requestFullscreen().catch(() => {});
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFs = !!document.fullscreenElement;
  iconFsEnter.classList.toggle("hidden", isFs);
  iconFsExit.classList.toggle("hidden", !isFs);
});

// Halangi cara-cara umum untuk mengunduh video
playerEl.addEventListener("contextmenu", (e) => e.preventDefault());
playerEl.addEventListener("dragstart", (e) => e.preventDefault());

// ---------- Heartbeat viewer (untuk halaman admin) ----------
// Mengirim posisi tonton saat ini secara berkala ke Edge Function
// "viewer-heartbeat", yang lalu meng-upsert ke tabel Supabase
// "viewer_sessions" pakai service role di server (bukan lewat REST API
// langsung dari browser). Alasannya dua:
//   1. Browser tidak pernah butuh (dan tidak diberi) akses tulis langsung
//      ke tabel ini lagi — jadi tidak perlu policy RLS untuk anon sama
//      sekali, termasuk tidak perlu policy SELECT yang tadinya jadi celah
//      privasi hanya demi memenuhi kebutuhan upsert (ON CONFLICT DO UPDATE).
//   2. IP address viewer diambil dari header request di sisi server, yang
//      jauh lebih bisa diandalkan daripada mencoba mendeteksi IP sendiri
//      dari JavaScript di browser (dan browser memang tidak bisa itu).
// Halaman admin tetap hanya bisa membaca datanya lewat edge function
// admin-sessions, dan itu pun harus pakai password.

const VIEWER_SESSION_ID = (function () {
  const key = "feed:session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    sessionStorage.setItem(key, id);
  }
  return id;
})();

// ---------- Riwayat masuk/keluar pengunjung (untuk halaman admin) ----------
// Beda dengan heartbeat di atas (yang cuma jalan saat video diputar),
// log-visit/log-leave mencatat SETIAP pengunjung yang buka halaman ini,
// diputar atau tidak videonya. Dipakai admin untuk lihat riwayat "siapa
// masuk jam berapa, keluar jam berapa".

async function logVisit() {
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/log-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: VIEWER_SESSION_ID }),
    });
  } catch {
    // Gagal sekali tidak masalah, dicoba lagi di ping berikutnya.
  }
}

function logLeave() {
  // sendBeacon dipakai (bukan fetch biasa) supaya tetap terkirim walau tab
  // langsung ditutup / halaman di-refresh, karena browser tidak akan
  // membatalkannya seperti request fetch yang sedang berjalan.
  try {
    const payload = JSON.stringify({ session_id: VIEWER_SESSION_ID });
    navigator.sendBeacon(
      `${SUPABASE_FUNCTIONS_URL}/log-leave`,
      new Blob([payload], { type: "text/plain;charset=UTF-8" })
    );
  } catch {
    // Kalau sendBeacon tidak tersedia, ya sudah -- waktu keluar tidak tercatat.
  }
}

// Catat "masuk" begitu halaman dibuka, lalu ping tiap 5 detik supaya
// last_seen_at tetap segar selama tab ini masih terbuka (dipakai admin
// untuk tahu siapa yang "masih online" sekarang, lebih realtime).
logVisit();
setInterval(logVisit, 5000);

// Catat "keluar" begitu pengunjung menutup tab / pindah situs / refresh.
// Dua event dipasang sebagai jaring pengaman satu sama lain: pagehide
// paling diandalkan (termasuk di banyak browser mobile saat app di-switch/
// ditutup), beforeunload sebagai cadangan di browser desktop lama yang
// tidak konsisten memicu pagehide. Memanggil logLeave() dua kali tidak
// masalah -- log-leave cuma menimpa left_at dengan waktu yang hampir sama.
window.addEventListener("pagehide", logLeave);
window.addEventListener("beforeunload", logLeave);

let heartbeatTimer = null;
let currentFile = null;

async function sendHeartbeat() {
  if (!currentFile || !playerEl.duration) return;
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/viewer-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: VIEWER_SESSION_ID,
        video_id: currentFile.id,
        video_name: prettifyCaption(currentFile.name),
        current_time_sec: playerEl.currentTime,
        duration_sec: playerEl.duration,
        thumbnail_url: currentFile.thumbnailLink ? thumbnailUrl(currentFile.thumbnailLink) : null,
      }),
    });
  } catch {
    // Gagal kirim satu kali tidak masalah, dicoba lagi di interval berikutnya.
  }
}

function startHeartbeat() {
  stopHeartbeat();
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 4000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// Heartbeat SENGAJA tetap jalan walau video di-pause -- supaya viewer masih
// kelihatan "sedang nonton" di admin (cuma posisinya berhenti maju, karena
// current_time_sec ikut currentTime yang memang tidak berubah saat pause).
// Heartbeat baru benar-benar berhenti kalau:
//   1. Video selesai (ended), atau
//   2. Pengunjung pilih video lain (startHeartbeat dipanggil ulang dengan
//      currentFile baru, jadi otomatis "pindah" bukan hilang), atau
//   3. Pengunjung benar-benar keluar dari halaman (pagehide/beforeunload).
// Dulu heartbeat berhenti begitu di-pause, jadi entry-nya langsung hilang
// dari daftar admin walau pengunjungnya masih ada di halaman -- itu yang
// diperbaiki di sini.
playerEl.addEventListener("play", startHeartbeat);
playerEl.addEventListener("ended", stopHeartbeat);
window.addEventListener("pagehide", stopHeartbeat);

// ---------- Daftar video ----------

function playVideo(file, itemEl) {
  document.querySelectorAll("#video-list li.active").forEach((li) => li.classList.remove("active"));
  itemEl.classList.add("active");

  hidePlayerError();
  currentFile = file;
  playerEl.src = videoSrc(file.id);
  playerTitleEl.textContent = prettifyCaption(file.name);
  playerEl.play().catch(() => {
    // Kalau browser menolak autoplay, tombol play besar tetap terlihat
    // untuk user tap manual.
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildListItem(file) {
  const li = document.createElement("li");

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "thumb-wrap";

  const spinner = document.createElement("div");
  spinner.className = "thumb-spinner";

  const errorEl = document.createElement("div");
  errorEl.className = "thumb-error hidden";
  errorEl.textContent = "Gagal memuat thumbnail";

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.loading = "lazy";
  thumb.decoding = "async";
  thumb.alt = "";
  thumb.draggable = false;

  if (file.thumbnailLink) {
    thumb.src = thumbnailUrl(file.thumbnailLink);
    // Spinner hilang begitu gambar sukses dimuat...
    thumb.addEventListener("load", () => {
      spinner.classList.add("hidden");
    });
    // ...atau diganti keterangan error kalau gagal (link mati, folder Drive
    // belum di-share publik, dll).
    thumb.addEventListener("error", () => {
      spinner.classList.add("hidden");
      thumb.classList.add("hidden");
      errorEl.classList.remove("hidden");
    });
  } else {
    // Tidak ada thumbnailLink sama sekali dari Google Drive -- bukan error,
    // cuma memang tidak ada pratinjaunya.
    spinner.classList.add("hidden");
    thumb.classList.add("no-thumb");
  }

  thumb.addEventListener("dragstart", (e) => e.preventDefault());
  thumb.addEventListener("contextmenu", (e) => e.preventDefault());

  thumbWrap.append(thumb, spinner, errorEl);
  li.append(thumbWrap);
  li.addEventListener("click", () => playVideo(file, li));
  return li;
}

async function init() {
  if (!SUPABASE_FUNCTIONS_URL || SUPABASE_FUNCTIONS_URL.includes("TEMPEL")) {
    showStatus("error", "SUPABASE_FUNCTIONS_URL belum diisi di config.js.");
    return;
  }
  if (!GOOGLE_DRIVE_API_KEY || GOOGLE_DRIVE_API_KEY.includes("TEMPEL")) {
    showStatus("error", "GOOGLE_DRIVE_API_KEY belum diisi di config.js (dipakai untuk streaming video langsung dari Drive).");
    return;
  }

  showStatus("loading");
  try {
    const files = await fetchVideoList();
    if (files.length === 0) {
      showStatus("empty");
      return;
    }
    showStatus(null);

    const fragment = document.createDocumentFragment();
    files.forEach((f) => fragment.appendChild(buildListItem(f)));
    listEl.appendChild(fragment);

    // Muat video pertama ke player (tanpa autoplay) supaya pengguna
    // langsung lihat sesuatu di area player.
    const firstFile = files[0];
    const firstLi = listEl.firstElementChild;
    firstLi.classList.add("active");
    currentFile = firstFile;
    playerEl.src = videoSrc(firstFile.id);
    playerTitleEl.textContent = prettifyCaption(firstFile.name);
  } catch (err) {
    showStatus("error", err.message);
  }
}

init();