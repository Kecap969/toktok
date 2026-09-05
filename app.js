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
// Mengirim posisi tonton saat ini secara berkala ke tabel Supabase
// "viewer_sessions", supaya halaman admin bisa lihat siapa nonton apa,
// realtime. Tabel ini TIDAK bisa dibaca langsung dari browser (RLS: hanya
// insert/update, tanpa select) — hanya edge function admin-sessions yang
// bisa membacanya, dan itu pun harus pakai password.

const VIEWER_SESSION_ID = (function () {
  const key = "feed:session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    sessionStorage.setItem(key, id);
  }
  return id;
})();

let heartbeatTimer = null;
let currentFile = null;

async function sendHeartbeat() {
  if (!currentFile || !playerEl.duration) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/viewer_sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        session_id: VIEWER_SESSION_ID,
        video_id: currentFile.id,
        video_name: prettifyCaption(currentFile.name),
        current_time_sec: playerEl.currentTime,
        duration_sec: playerEl.duration,
        updated_at: new Date().toISOString(),
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

playerEl.addEventListener("play", startHeartbeat);
playerEl.addEventListener("pause", stopHeartbeat);
playerEl.addEventListener("ended", stopHeartbeat);

// ---------- Daftar video ----------

function playVideo(file, itemEl) {
  document.querySelectorAll("#video-list li.active").forEach((li) => li.classList.remove("active"));
  itemEl.classList.add("active");

  currentFile = file;
  playerEl.src = videoSrc(file.id);
  playerTitleEl.textContent = prettifyCaption(file.name);
  playerEl.play().catch(() => {
    // Kalau browser menolak autoplay, tombol play besar tetap terlihat
    // untuk user tap manual.
  });

  document.getElementById("player-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildListItem(file) {
  const li = document.createElement("li");

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.loading = "lazy";
  thumb.decoding = "async";
  thumb.alt = "";
  thumb.draggable = false;
  if (file.thumbnailLink) thumb.src = thumbnailUrl(file.thumbnailLink);
  else thumb.classList.add("no-thumb");
  thumb.addEventListener("dragstart", (e) => e.preventDefault());
  thumb.addEventListener("contextmenu", (e) => e.preventDefault());

  const info = document.createElement("div");
  info.className = "item-info";
  const title = document.createElement("p");
  title.className = "item-title";
  title.textContent = prettifyCaption(file.name);
  info.appendChild(title);

  li.append(thumb, info);
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
