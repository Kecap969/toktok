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
const playerWrap = document.getElementById("player-wrap");
const playerCloseBtn = document.getElementById("player-close");

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

async function fetchVideoList(attempt = 1) {
  // Timeout 12 detik + sampai 3x percobaan: di sinyal lemah, satu request
  // yang menggantung tidak lagi membuat halaman macet di "Memuat…".
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/video-list`, { signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.retryable = res.status >= 500;
      throw err;
    }
    return data.files || [];
  } catch (e) {
    const retryable = e.retryable !== false;
    if (retryable && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return fetchVideoList(attempt + 1);
    }
    throw e.name === "AbortError" ? new Error("Koneksi lambat, daftar video tidak termuat.") : e;
  } finally {
    clearTimeout(timer);
  }
}

function videoSrc(file) {
  // URL publik Cloudflare R2 (disimpan admin di tabel "videos"). Langsung
  // dari R2 supaya streaming & Range request (seek) ditangani Cloudflare.
  return file.url;
}

function thumbnailUrl(link) {
  return link || "";
}

function prettifyCaption(rawName) {
  let base = (rawName || "").replace(/\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i, "");
  base = base.replace(/^(VID|IMG|MOV|MP4|REC)[-_]?/i, "");

  let dateLabel = "";
  const m = base.match(/(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
  if (m) {
    const [full, y, mo, d, h, mi] = m;
    dateLabel = `${d}/${mo}/${y} ${h}:${mi}`;
    base = base.replace(full, "");
  }

  base = base.replace(/[_-]+/g, " ").trim();
  const original = base;
  if (/^\d+$/.test(base)) base = "";

  if (base && dateLabel) return `${base} — ${dateLabel}`;
  return base || dateLabel || original || "Video";
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
  const errorShown = playerErrorEl && !playerErrorEl.classList.contains("hidden");
  bigPlayBtn.classList.toggle("hidden", playing || errorShown);
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
  updatePlayPauseIcon();
}

function hidePlayerError() {
  if (playerErrorEl) playerErrorEl.classList.add("hidden");
  updatePlayPauseIcon();
}

// ---------- Error pemutaran: diagnosa + sambung ulang otomatis ----------
// Elemen <video> tidak memberi tahu kode HTTP saat gagal. Jadi begitu gagal,
// kita minta 1 byte (header Range) dari URL yang sama untuk membaca statusnya.
// Kalau CORS bucket R2 belum mengizinkan situs ini, status tidak terbaca dan
// dipakai pemeriksaan no-cors sebagai cadangan.
//   temporary = true -> gangguan sementara (sibuk / jaringan): dicoba ulang
//   otomatis sampai 3x. Kalau tetap gagal, baru tampil tombol "Coba Lagi".
async function diagnosePlaybackError(src) {
  try {
    const res = await fetch(src, { headers: { Range: "bytes=0-0" } });
    if (res.status === 429 || res.status >= 500) {
      return { temporary: true, message: `Server video sedang sibuk (kode ${res.status}). Coba lagi sebentar lagi.` };
    }
    if (res.status === 403 || res.status === 404) {
      return { temporary: false, message: `Video tidak ditemukan atau akses ditolak (kode ${res.status}).` };
    }
    return { temporary: false, message: "Video gagal diputar (E1: format video mungkin tidak didukung perangkat ini)." };
  } catch {
    try {
      await fetch(src, { method: "HEAD", mode: "no-cors" });
      return { temporary: false, message: "Video gagal diputar (E1: file tidak ditemukan atau formatnya tidak didukung). Coba lagi." };
    } catch {
      return { temporary: true, message: "Video gagal diputar (E2: jaringan). Coba lagi." };
    }
  }
}

let retryCount = 0;
let stallTimer = null;

// Muat ulang sumber video lalu lanjut dari posisi terakhir (bukan dari awal).
function reloadCurrent(resumeAt) {
  if (!currentFile) return;
  const t = Number(resumeAt) || 0;
  playerEl.src = videoSrc(currentFile);
  playerEl.load();
  if (t > 0) {
    playerEl.addEventListener("loadedmetadata", () => {
      try { playerEl.currentTime = t; } catch {}
    }, { once: true });
  }
  playerEl.play().catch(() => {});
}

function scheduleAutoRetry(resumeAt) {
  retryCount++;
  setTimeout(showPlayerLoading, 0);
  setTimeout(() => reloadCurrent(resumeAt), 1200 * retryCount);
}

playerEl.addEventListener("error", async () => {
  // ABORTED muncul wajar setiap src diganti; bukan kegagalan sungguhan.
  if (playerEl.error && playerEl.error.code === MediaError.MEDIA_ERR_ABORTED) return;
  const src = playerEl.currentSrc || playerEl.src;
  if (!src) return;
  const resumeAt = playerEl.currentTime || 0;

  // Koneksi putus di tengah streaming: langsung sambung ulang.
  if (playerEl.error && playerEl.error.code === MediaError.MEDIA_ERR_NETWORK && retryCount < 3 && navigator.onLine) {
    scheduleAutoRetry(resumeAt);
    return;
  }

  const diag = await diagnosePlaybackError(src);
  if (diag.temporary && retryCount < 3 && navigator.onLine) {
    scheduleAutoRetry(resumeAt);
    return;
  }
  showPlayerError(diag.message);
});

playerEl.addEventListener("playing", () => {
  retryCount = 0;
  hidePlayerError();
});

// Buffering macet lebih dari 15 detik (sinyal lemah): sambung ulang dari
// posisi yang sama, maksimal 3x berturut-turut.
playerEl.addEventListener("waiting", () => {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    if (playerEl.paused || playerEl.readyState >= 3 || retryCount >= 3 || !navigator.onLine) return;
    scheduleAutoRetry(playerEl.currentTime || 0);
  }, 15000);
});
["playing", "pause", "canplay", "error", "emptied"].forEach((ev) =>
  playerEl.addEventListener(ev, () => clearTimeout(stallTimer))
);

if (playerErrorRetryBtn) {
  playerErrorRetryBtn.addEventListener("click", () => {
    if (!currentFile) return;
    const resumeAt = playerEl.currentTime || 0;
    retryCount = 0;
    hidePlayerError();
    showPlayerLoading();
    reloadCurrent(resumeAt);
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

// ---------- Tampilan kontrol di fullview ----------
// Kontrol + tombol X tampil saat video di-pause, lalu hilang sendiri setelah
// 3 detik tanpa sentuhan selama video jalan. Di layar sentuh, ketukan
// pertama saat kontrol tersembunyi hanya memunculkan kontrol (tidak
// langsung play/pause), ketukan berikutnya baru play/pause.
let uiHideTimer = null;

function showUi() {
  playerWrap.classList.remove("ui-hidden");
  clearTimeout(uiHideTimer);
  if (!playerEl.paused && !playerEl.ended) uiHideTimer = setTimeout(hideUi, 3000);
}

function hideUi() {
  if (playerEl.paused || playerEl.ended) return;
  if (isSeeking) {
    uiHideTimer = setTimeout(hideUi, 1500);
    return;
  }
  const errorShown = playerErrorEl && !playerErrorEl.classList.contains("hidden");
  if (errorShown) return;
  playerWrap.classList.add("ui-hidden");
}

playerEl.addEventListener("click", () => {
  if (playerWrap.classList.contains("ui-hidden")) {
    showUi();
    return;
  }
  togglePlayPause();
  showUi();
});

playerEl.addEventListener("play", showUi);
playerEl.addEventListener("pause", showUi);
playerEl.addEventListener("ended", showUi);
playerWrap.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") showUi();
});
playerWrap.addEventListener("pointerdown", () => {
  if (!playerWrap.classList.contains("ui-hidden")) showUi();
});

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
    playerWrap.requestFullscreen().catch(() => {});
  }
});

// Fullview sudah memenuhi layar; tombol layar-penuh browser hanya
// ditampilkan kalau browser-nya mendukung (iPhone tidak).
if (!document.fullscreenEnabled) fullscreenBtn.classList.add("hidden");

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
        thumbnail_url: currentFile.thumbnailLink || null,
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

let playerOpen = false;
let lastOpenerEl = null;

// Kalau halaman di-refresh saat fullview terbuka, state history-nya ikut
// terbawa -- bersihkan supaya tombol X tidak salah memanggil history.back().
if (history.state && history.state.fullview) history.replaceState(null, "");

function openPlayer(openerEl) {
  lastOpenerEl = openerEl;
  playerOpen = true;
  playerWrap.classList.remove("hidden", "ui-hidden");
  document.body.classList.add("no-scroll");
  // Satu entri history untuk fullview, supaya tombol Back di HP menutup
  // fullview (bukan keluar dari halaman).
  history.pushState({ fullview: true }, "");
  playerCloseBtn.focus({ preventScroll: true });
}

function hidePlayer() {
  if (!playerOpen) return;
  playerOpen = false;
  clearTimeout(uiHideTimer);
  playerEl.pause();
  // Tutup = pengunjung tidak lagi "sedang menonton": heartbeat berhenti,
  // jadi di admin entry-nya hilang begitu masa kedaluwarsanya lewat.
  stopHeartbeat();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  playerWrap.classList.add("hidden");
  document.body.classList.remove("no-scroll");
  document.querySelectorAll("#video-list li.active").forEach((li) => li.classList.remove("active"));
  if (lastOpenerEl) lastOpenerEl.focus({ preventScroll: true });
}

function requestClosePlayer() {
  if (history.state && history.state.fullview) history.back();
  else hidePlayer();
}

playerCloseBtn.addEventListener("click", requestClosePlayer);
window.addEventListener("popstate", hidePlayer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && playerOpen && !document.fullscreenElement) requestClosePlayer();
});

function playVideo(file, itemEl) {
  // Buka kembali video yang sama (belum diganti) -> lanjut dari posisi
  // terakhir, bukan muat ulang dari awal.
  const sameVideo = currentFile && currentFile.id === file.id && playerEl.getAttribute("src") && !playerEl.error;

  document.querySelectorAll("#video-list li.active").forEach((li) => li.classList.remove("active"));
  itemEl.classList.add("active");

  hidePlayerError();
  currentFile = file;
  playerTitleEl.textContent = prettifyCaption(file.name);
  if (!sameVideo) {
    playerEl.src = videoSrc(file);
  } else if (playerEl.ended) {
    playerEl.currentTime = 0;
  }

  openPlayer(itemEl);
  playerEl.play().catch(() => {
    // Kalau browser menolak autoplay, tombol play besar tetap terlihat
    // untuk user tap manual.
  });
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
    // ...atau diganti keterangan error kalau gagal (link mati, file
    // thumbnail sudah dihapus dari R2, dll).
    thumb.addEventListener("error", () => {
      spinner.classList.add("hidden");
      thumbWrap.classList.add("no-thumb");
    });
  } else {
    // Video ini tidak punya thumbnail (mis. ditambahkan lewat link URL) --
    // bukan error, cuma memang tidak ada pratinjaunya.
    spinner.classList.add("hidden");
    thumb.classList.add("no-thumb");
    thumbWrap.classList.add("no-thumb");
  }

  thumb.addEventListener("dragstart", (e) => e.preventDefault());
  thumb.addEventListener("contextmenu", (e) => e.preventDefault());

  thumbWrap.append(thumb, spinner, errorEl);
  const cap = document.createElement("div");
  cap.className = "card-title";
  cap.textContent = prettifyCaption(file.name);
  li.append(thumbWrap, cap);
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.addEventListener("click", () => playVideo(file, li));
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      playVideo(file, li);
    }
  });
  return li;
}

async function init() {
  if (!SUPABASE_FUNCTIONS_URL || SUPABASE_FUNCTIONS_URL.includes("TEMPEL")) {
    showStatus("error", "SUPABASE_FUNCTIONS_URL belum diisi di config.js.");
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
    const countEl = document.getElementById("video-count");
    if (countEl) countEl.textContent = files.length;
  } catch (err) {
    showStatus("error", err.message);
  }
}

init();

// ---------- Deteksi offline/online ----------
// Tujuannya: kalau internet mati di tengah jalan, halaman JANGAN error/blank
// atau perlu ditutup -- cukup tampilkan overlay "offline", lalu begitu
// internet nyala lagi overlay hilang sendiri dan halaman lanjut seperti
// biasa (video, daftar, heartbeat, dst tetap di state yang sama karena
// halaman tidak pernah di-reload).

const offlineOverlay = document.getElementById("offline-overlay");
let wasPlayingBeforeOffline = false;

function showOfflineOverlay() {
  if (!offlineOverlay) return;
  // Sudah tampil: jangan timpa status "tadi sedang memutar" (video sudah di-pause
  // oleh panggilan pertama, jadi nilainya akan salah jadi false dan video tidak
  // lanjut otomatis saat online lagi).
  if (!offlineOverlay.classList.contains("hidden")) return;
  offlineOverlay.classList.remove("hidden");
  // Jeda video sementara offline -- daripada dibiarkan buffering sia-sia
  // (dan browser nampilin error) sampai koneksi balik. Status "sedang main
  // sebelum offline" disimpan supaya bisa dilanjut otomatis nanti.
  wasPlayingBeforeOffline = !playerEl.paused && !playerEl.ended;
  if (wasPlayingBeforeOffline) playerEl.pause();
}

function hideOfflineOverlay() {
  if (!offlineOverlay) return;
  offlineOverlay.classList.add("hidden");

  // Kalau daftar video BELUM PERNAH berhasil dimuat (mis. halaman dibuka
  // saat memang lagi offline), coba lagi sekarang -- tanpa perlu pengguna
  // refresh manual.
  if (listEl.children.length === 0 && !currentFile) {
    init();
    return;
  }

  // Kalau tadinya lagi muter video, lanjutkan otomatis dari posisi yang sama.
  if (wasPlayingBeforeOffline) {
    playerEl.play().catch(() => {
      // Kalau browser tetap menahan (mis. kebijakan autoplay), tombol play
      // besar tetap ada untuk user tap manual.
    });
  }

  // Kabari server lagi begitu online (heartbeat/log-visit yang gagal
  // sepanjang offline otomatis akan jalan lagi lewat interval yang sudah
  // ada, tapi ini bikin admin lihat kita "online" secepatnya tanpa nunggu
  // interval berikutnya).
  logVisit();
}

window.addEventListener("offline", showOfflineOverlay);
window.addEventListener("online", hideOfflineOverlay);

// Cek begitu skrip ini pertama jalan, siapa tahu halaman dibuka dalam
// keadaan sudah offline dari awal.
if (!navigator.onLine) showOfflineOverlay();


// ---------- PWA: service worker + tombol "Pasang" ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const installBtn = document.getElementById("install-btn");
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice.catch(() => {});
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
});

window.addEventListener("appinstalled", () => installBtn.classList.add("hidden"));
