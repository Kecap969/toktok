const feedEl = document.getElementById("feed");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const errorDetailEl = document.getElementById("error-detail");

const ICONS = {
  heart: `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10.2-9.3C.3 8.8 1.4 5 4.9 4.1c2-.5 3.9.3 5 1.9l2.1 3 2.1-3c1.1-1.6 3-2.4 5-1.9 3.5.9 4.6 4.7 3.1 7.6C19.5 16.4 12 21 12 21z"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3V4z"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M14 3v4c-5 .6-8 3.3-9 8 2.2-2.6 5-4 9-4v4l8-6-8-6z"/></svg>`,
  muted: `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M17 8l4 8m0-8l-4 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>`,
  unmuted: `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`,
};

const likedKey = (id) => `feed:liked:${id}`;

// Sekali true, semua video (yang sedang main maupun yang akan datang)
// otomatis main dengan suara nyala, tanpa perlu tap ulang per video.
let audioUnlocked = false;

// ---------- Pengaturan infinite scroll & preload ----------
// Berapa video yang diambil dari Google Drive per "halaman".
const PAGE_SIZE = 8;
// Jendela video yang boleh benar-benar dimuat (dapat src+preload) di
// sekitar posisi video yang sedang aktif. Radius 3 = total 7 video
// (3 sebelum + yang aktif + 3 sesudah) yang pernah punya src sekaligus.
const PRELOAD_RADIUS = 3;

let nextPageToken = null;
let isFetchingMore = false;
let currentIndex = 0;
let observer = null;

// ---------- Tracking untuk dashboard admin (best-effort) ----------
// Semua fungsi di bawah ini sengaja dibungkus try/catch dan tidak pernah
// melempar error ke pemanggilnya: kalau Supabase/geo API gagal atau
// offline, video tetap harus jalan normal seperti biasa.

const sb = (typeof window !== "undefined" && window.supabase && SUPABASE_URL && !SUPABASE_URL.includes("TEMPEL"))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function getSessionId() {
  const KEY = "feed:sessionId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(KEY, id);
  }
  return id;
}
const SESSION_ID = getSessionId();

let geoInfo = { city: null, country: null };
const geoReady = (async () => {
  try {
    const cached = sessionStorage.getItem("feed:geo");
    if (cached) {
      geoInfo = JSON.parse(cached);
      return;
    }
    const res = await fetch("https://ipwho.is/");
    const data = await res.json();
    if (data && data.success !== false) {
      geoInfo = { city: data.city || null, country: data.country || null };
      sessionStorage.setItem("feed:geo", JSON.stringify(geoInfo));
    }
  } catch (e) {
    // Lokasi bersifat opsional; diamkan kalau gagal.
  }
})();

let currentWatching = null; // { id, name }

async function upsertPresence() {
  if (!sb || !currentWatching) return;
  try {
    await sb.from("feed_presence").upsert({
      session_id: SESSION_ID,
      city: geoInfo.city,
      country: geoInfo.country,
      video_id: currentWatching.id,
      video_name: currentWatching.name,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    // best-effort, abaikan
  }
}

async function logViewEvent(id, name) {
  if (!sb) return;
  try {
    await sb.from("feed_view_events").insert({
      session_id: SESSION_ID,
      video_id: id,
      video_name: name,
      city: geoInfo.city,
      country: geoInfo.country,
    });
  } catch (e) {
    // best-effort, abaikan
  }
}

async function trackWatching(section) {
  const id = section.dataset.fileId;
  const name = section.dataset.fileName;
  if (currentWatching && currentWatching.id === id) return;
  currentWatching = { id, name };
  await geoReady;
  logViewEvent(id, name);
  upsertPresence();
}

// Heartbeat: perbarui "terakhir aktif" walau video yang ditonton sama,
// supaya dashboard admin tahu sesi ini masih aktif.
setInterval(() => {
  if (document.visibilityState === "visible") upsertPresence();
}, 10000);

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

async function fetchVideoPage(pageToken) {
  const params = new URLSearchParams({
    q: `'${FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
    fields: "nextPageToken, files(id,name)",
    orderBy: "createdTime desc",
    pageSize: String(PAGE_SIZE),
    key: API_KEY,
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return { files: data.files || [], nextPageToken: data.nextPageToken || null };
}

function videoSrc(fileId) {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`;
}

function flashCenterIcon(section, which) {
  const icon = section.querySelector(".center-icon");
  icon.innerHTML = which === "play" ? ICONS.play : ICONS.pause;
  icon.classList.remove("show");
  // force reflow supaya animasi bisa restart kalau di-tap cepat berturut-turut
  void icon.offsetWidth;
  icon.classList.add("show");
}

function updateMuteButton(section, video) {
  const btn = section.querySelector(".mute-toggle");
  btn.innerHTML = video.muted ? ICONS.muted : ICONS.unmuted;
}

function assignSrc(section) {
  const video = section.querySelector("video");
  if (video.dataset.loaded === "1") return;
  video.src = videoSrc(section.dataset.fileId);
  video.preload = "auto";
  video.dataset.loaded = "1";
}

function releaseSrc(section) {
  const video = section.querySelector("video");
  if (video.dataset.loaded !== "1") return;
  video.pause();
  video.removeAttribute("src");
  video.load(); // hentikan buffering & bebaskan memori/bandwidth
  video.preload = "none";
  delete video.dataset.loaded;
  const fill = section.querySelector(".progress-fill");
  if (fill) fill.style.width = "0%";
  const spinner = section.querySelector(".buffer-label");
  if (spinner) spinner.classList.remove("show");
}

// Pastikan hanya video dalam radius PRELOAD_RADIUS dari centerIndex yang
// punya src (dimuat); di luar itu, src dilepas supaya tidak semua video
// membebani jaringan/memori sekaligus.
function ensureWindow(centerIndex) {
  const items = feedEl.children;
  for (let i = 0; i < items.length; i++) {
    const section = items[i];
    if (Math.abs(i - centerIndex) <= PRELOAD_RADIUS) {
      assignSrc(section);
    } else {
      releaseSrc(section);
    }
  }
}

function buildItem(file) {
  const section = document.createElement("section");
  section.className = "video-item";
  section.dataset.fileId = file.id;
  section.dataset.fileName = (file.name || "").replace(/\.[^/.]+$/, "");

  const video = document.createElement("video");
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "none";
  video.draggable = false;
  video.disablePictureInPicture = true;
  video.setAttribute("controlsList", "nodownload noremoteplayback nofullscreen");
  video.addEventListener("contextmenu", (e) => e.preventDefault());
  video.addEventListener("dragstart", (e) => e.preventDefault());

  const centerIcon = document.createElement("div");
  centerIcon.className = "center-icon";

  const likeBurst = document.createElement("div");
  likeBurst.className = "like-burst";

  const spinner = document.createElement("div");
  spinner.className = "buffer-label";
  spinner.textContent = "Loading...";

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-wrap";
  const progressFill = document.createElement("div");
  progressFill.className = "progress-fill";
  progressWrap.appendChild(progressFill);

  video.addEventListener("timeupdate", () => {
    if (video.duration) {
      progressFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  });

  video.addEventListener("waiting", () => spinner.classList.add("show"));
  video.addEventListener("playing", () => spinner.classList.remove("show"));
  video.addEventListener("canplay", () => spinner.classList.remove("show"));
  video.addEventListener("error", () => spinner.classList.remove("show"));

  const muteBtn = document.createElement("button");
  muteBtn.className = "mute-toggle";
  muteBtn.innerHTML = ICONS.muted;
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // supaya tidak sekaligus trigger play/pause
    audioUnlocked = true;
    video.muted = !video.muted;
    updateMuteButton(section, video);
  });

  let tapTimer = null;
  const DOUBLE_TAP_MS = 260;

  video.addEventListener("click", () => {
    // Tap kedua yang datang cepat -> ini double-tap: batalkan aksi
    // single-tap yang tertunda, lalu jalankan "like".
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
      audioUnlocked = true;
      setLiked(true, { pulse: !liked, burst: true });
      return;
    }
    // Tunda aksi single-tap sebentar; kalau tidak disusul tap kedua,
    // baru dieksekusi sebagai play/pause + unmute.
    tapTimer = setTimeout(() => {
      tapTimer = null;
      audioUnlocked = true;
      if (video.muted) {
        video.muted = false;
        updateMuteButton(section, video);
      }
      if (video.paused) {
        video.play().catch(() => {});
        flashCenterIcon(section, "play");
      } else {
        video.pause();
        flashCenterIcon(section, "pause");
      }
    }, DOUBLE_TAP_MS);
  });

  const meta = document.createElement("div");
  meta.className = "meta";
  const caption = (file.name || "").replace(/\.[^/.]+$/, "");
  meta.innerHTML = `<p class="handle">${DEFAULT_USERNAME}</p><p class="caption">${caption}</p>`;

  const rail = document.createElement("div");
  rail.className = "rail";

  let liked = localStorage.getItem(likedKey(file.id)) === "1";
  const likeBtn = document.createElement("button");
  likeBtn.className = liked ? "liked" : "";
  likeBtn.innerHTML = `${ICONS.heart}<span>Suka</span>`;

  function setLiked(next, { pulse = false, burst = false } = {}) {
    liked = next;
    likeBtn.classList.toggle("liked", liked);
    localStorage.setItem(likedKey(file.id), liked ? "1" : "0");
    if (pulse) {
      likeBtn.classList.remove("like-pulse");
      void likeBtn.offsetWidth;
      likeBtn.classList.add("like-pulse");
    }
    if (burst) {
      const heart = section.querySelector(".like-burst");
      heart.innerHTML = ICONS.heart;
      heart.classList.remove("show");
      void heart.offsetWidth;
      heart.classList.add("show");
    }
  }

  likeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setLiked(!liked, { pulse: true });
  });

  const commentBtn = document.createElement("button");
  commentBtn.innerHTML = `${ICONS.comment}<span>Komentar</span>`;
  commentBtn.addEventListener("click", (e) => e.stopPropagation());

  const shareBtn = document.createElement("button");
  shareBtn.innerHTML = `${ICONS.share}<span>Bagikan</span>`;
  shareBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const url = `https://drive.google.com/file/d/${file.id}/view`;
    if (navigator.share) {
      navigator.share({ url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  });

  rail.append(likeBtn, commentBtn, shareBtn);
  section.append(video, centerIcon, likeBurst, spinner, progressWrap, muteBtn, meta, rail);
  return section;
}

function playVisible(video, section) {
  // Jaga-jaga: kalau karena scroll cepat video ini belum sempat dimuat
  // oleh ensureWindow, muat sekarang juga.
  if (video.dataset.loaded !== "1") assignSrc(section);

  // Kalau audio sudah "unlocked" dari interaksi sebelumnya, coba nyalakan
  // suara otomatis untuk video baru ini juga.
  if (audioUnlocked) video.muted = false;
  updateMuteButton(section, video);

  if (video.readyState < 3) {
    section.querySelector(".buffer-label").classList.add("show");
  }

  video.play().catch(() => {
    // Kalau browser tetap menolak autoplay bersuara (mis. belum ada
    // interaksi sama sekali di halaman ini), jatuhkan ke muted supaya
    // video tetap jalan, lalu tunggu tap pertama.
    if (!video.muted) {
      video.muted = true;
      updateMuteButton(section, video);
      video.play().catch(() => {});
    }
  });
}

// Ambil halaman berikutnya dari Drive kalau posisi sekarang sudah dekat
// dengan ujung daftar video yang sudah dimuat (infinite scroll).
async function loadMoreIfNeeded() {
  if (isFetchingMore || !nextPageToken) return;
  const remaining = feedEl.children.length - 1 - currentIndex;
  if (remaining > 2) return; // masih ada beberapa video lagi di depan, belum perlu

  isFetchingMore = true;
  try {
    const { files, nextPageToken: token } = await fetchVideoPage(nextPageToken);
    nextPageToken = token;
    const fragment = document.createDocumentFragment();
    files.forEach((f) => {
      const section = buildItem(f);
      fragment.appendChild(section);
      observer.observe(section);
    });
    feedEl.appendChild(fragment);
  } catch (err) {
    // Gagal memuat halaman berikutnya tidak boleh mengganggu video yang
    // sedang ditonton; cukup dicatat, video yang sudah ada tetap jalan.
    console.error("Gagal memuat video berikutnya:", err);
  } finally {
    isFetchingMore = false;
  }
}

function setupAutoplay() {
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const section = entry.target;
        const video = section.querySelector("video");
        if (!video) return;

        if (entry.isIntersecting && entry.intersectionRatio > 0.05) {
          currentIndex = Array.prototype.indexOf.call(feedEl.children, section);
          ensureWindow(currentIndex);
          loadMoreIfNeeded();
          trackWatching(section);
        }

        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          playVisible(video, section);
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.05, 0.6, 1] }
  );
  document.querySelectorAll(".video-item").forEach((el) => observer.observe(el));
}

async function init() {
  if (!API_KEY || API_KEY.includes("TEMPEL") || !FOLDER_ID || FOLDER_ID.includes("TEMPEL")) {
    showStatus("error", "API_KEY atau FOLDER_ID belum diisi di config.js.");
    return;
  }

  showStatus("loading");
  try {
    const { files, nextPageToken: token } = await fetchVideoPage(null);
    nextPageToken = token;
    if (files.length === 0) {
      showStatus("empty");
      return;
    }
    const fragment = document.createDocumentFragment();
    files.forEach((f) => fragment.appendChild(buildItem(f)));
    feedEl.appendChild(fragment);
    showStatus(null);
    setupAutoplay();
    ensureWindow(0);
  } catch (err) {
    showStatus("error", err.message);
  }
}

init();
