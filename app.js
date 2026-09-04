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
  // Langsung ke Google Drive (bukan lewat proxy Supabase lagi), supaya
  // streaming file besar & Range request (seek) ditangani server Google,
  // bukan Edge Function yang bisa timeout di tengah streaming.
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(GOOGLE_DRIVE_API_KEY)}`;
}

// Drive kasih thumbnail kecil (biasanya diakhiri =s220), kita minta ukuran
// lebih besar biar gak pecah waktu ditampilkan full-bleed.
function thumbnailUrl(link) {
  if (!link) return "";
  return link.replace(/=s\d+$/, "=s1280");
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
  if (/^\d+$/.test(base)) base = ""; // sisa cuma nomor urut, buang

  if (base && dateLabel) return `${base} — ${dateLabel}`;
  return base || dateLabel || "Video";
}

function flashCenterIcon(section, which) {
  const icon = section.querySelector(".center-icon");
  icon.innerHTML = which === "play" ? ICONS.play : ICONS.pause;
  icon.classList.remove("show");
  // force reflow supaya animasi bisa restart kalau di-tap cepat berturut-turut
  void icon.offsetWidth;
  icon.classList.add("show");
}

function flashHeart(section) {
  const burst = section.querySelector(".heart-burst");
  burst.classList.remove("show");
  void burst.offsetWidth;
  burst.classList.add("show");
}

function updateMuteButton(section, video) {
  const btn = section.querySelector(".mute-toggle");
  btn.innerHTML = video.muted ? ICONS.muted : ICONS.unmuted;
}

function buildItem(file) {
  const section = document.createElement("section");
  section.className = "video-item";

  const video = document.createElement("video");
  video.src = videoSrc(file.id);
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "none";
  video.draggable = false;
  video.disablePictureInPicture = true;
  video.setAttribute("controlsList", "nodownload noremoteplayback nofullscreen");
  video.addEventListener("contextmenu", (e) => e.preventDefault());
  video.addEventListener("dragstart", (e) => e.preventDefault());

  // Belum di-tap = belum boleh mulai buffering sama sekali.
  section.dataset.started = "0";

  const poster = document.createElement("img");
  poster.className = "poster";
  poster.loading = "lazy";
  poster.decoding = "async";
  poster.draggable = false;
  poster.alt = "";
  if (file.thumbnailLink) poster.src = thumbnailUrl(file.thumbnailLink);
  else poster.classList.add("no-thumb"); // Drive belum sempat generate thumbnail
  poster.addEventListener("dragstart", (e) => e.preventDefault());
  poster.addEventListener("contextmenu", (e) => e.preventDefault());

  const playOverlay = document.createElement("button");
  playOverlay.className = "play-overlay";
  playOverlay.innerHTML = ICONS.play;
  playOverlay.setAttribute("aria-label", "Putar video");

  const centerIcon = document.createElement("div");
  centerIcon.className = "center-icon";

  const heartBurst = document.createElement("div");
  heartBurst.className = "heart-burst";
  heartBurst.innerHTML = ICONS.heart;

  const spinner = document.createElement("div");
  spinner.className = "buffer-spinner";

  const errorMsg = document.createElement("div");
  errorMsg.className = "video-error hidden";
  errorMsg.innerHTML = `<p class="video-error-text">Video gagal dimuat.</p><button type="button" class="retry-btn">Coba lagi</button>`;
  const errorTextEl = errorMsg.querySelector(".video-error-text");

  // Maksimal auto-retry untuk error yang sifatnya sementara (jaringan putus-nyambung).
  // Kuota/file-hilang tidak di-auto-retry karena nunggu tidak akan menyelesaikannya.
  const MAX_AUTO_RETRIES = 2;
  section.dataset.retries = "0";

  // <video src> tidak kasih tahu status HTTP di baliknya, jadi saat error kita
  // cek ulang lewat fetch() supaya tahu penyebab sebenarnya: kuota Drive habis
  // (403), file sudah dihapus/tidak publik (404), atau memang jaringan bermasalah.
  async function diagnoseError() {
    try {
      const res = await fetch(video.src, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      if (res.status === 403) {
        return { reason: "quota", text: "Kuota unduh Google Drive untuk video ini sudah habis hari ini. Coba lagi beberapa jam lagi." };
      }
      if (res.status === 404) {
        return { reason: "missing", text: "Video tidak ditemukan. Kemungkinan sudah dihapus atau berbagi filenya diubah ke privat." };
      }
      if (!res.ok) {
        return { reason: "http", text: `Video gagal dimuat (HTTP ${res.status}).` };
      }
      return { reason: "network", text: "Koneksi terputus saat memuat video. Periksa koneksi internet Anda." };
    } catch {
      return { reason: "network", text: "Koneksi terputus saat memuat video. Periksa koneksi internet Anda." };
    }
  }

  async function handleVideoError() {
    spinner.classList.remove("show");
    const diagnosis = await diagnoseError();
    const retries = Number(section.dataset.retries || "0");

    if (diagnosis.reason === "network" && retries < MAX_AUTO_RETRIES) {
      section.dataset.retries = String(retries + 1);
      spinner.classList.add("show");
      const delay = retries === 0 ? 1500 : 3000; // backoff: 1.5s lalu 3s
      setTimeout(() => {
        video.load();
        video.play().catch(() => {});
      }, delay);
      return;
    }

    errorTextEl.textContent = diagnosis.text;
    errorMsg.classList.remove("hidden");
  }

  video.addEventListener("waiting", () => spinner.classList.add("show"));
  video.addEventListener("playing", () => spinner.classList.remove("show"));
  video.addEventListener("canplay", () => spinner.classList.remove("show"));
  video.addEventListener("error", () => {
    handleVideoError();
  });

  errorMsg.querySelector(".retry-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    section.dataset.retries = "0";
    errorMsg.classList.add("hidden");
    spinner.classList.add("show");
    video.load();
    video.play().catch(() => {});
  });

  function startPlayback() {
    if (section.dataset.started === "1") return;
    section.dataset.started = "1";
    poster.classList.add("hidden");
    playOverlay.classList.add("hidden");
    muteBtn.classList.remove("hidden");
    progressTrack.classList.remove("hidden");
    audioUnlocked = true;
    video.preload = "auto";
    video.muted = false;
    updateMuteButton(section, video);
    spinner.classList.add("show");
    video.play().catch(() => {
      // Kalau browser tetap menolak suara, jatuhkan ke muted supaya
      // video tetap jalan.
      video.muted = true;
      updateMuteButton(section, video);
      video.play().catch(() => {});
    });
  }

  playOverlay.addEventListener("click", (e) => {
    e.stopPropagation();
    startPlayback();
  });
  poster.addEventListener("click", (e) => {
    e.stopPropagation();
    startPlayback();
  });

  const muteBtn = document.createElement("button");
  muteBtn.className = "mute-toggle hidden";
  muteBtn.innerHTML = ICONS.muted;
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // supaya tidak sekaligus trigger play/pause
    audioUnlocked = true;
    video.muted = !video.muted;
    updateMuteButton(section, video);
  });

  const progressTrack = document.createElement("div");
  progressTrack.className = "progress-track hidden";
  const progressFill = document.createElement("div");
  progressFill.className = "progress-fill";
  progressTrack.appendChild(progressFill);

  video.addEventListener("timeupdate", () => {
    if (video.duration) {
      progressFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  });

  progressTrack.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!video.duration) return;
    const rect = progressTrack.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    video.currentTime = ratio * video.duration;
  });

  const liked0 = localStorage.getItem(likedKey(file.id)) === "1";
  const likeBtn = document.createElement("button");
  likeBtn.className = liked0 ? "liked" : "";
  likeBtn.innerHTML = `${ICONS.heart}<span>Suka</span>`;

  function setLiked(next) {
    likeBtn.classList.toggle("liked", next);
    localStorage.setItem(likedKey(file.id), next ? "1" : "0");
  }

  likeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setLiked(!likeBtn.classList.contains("liked"));
  });

  // Single tap = play/pause. Double tap (dalam 300ms) = like + animasi hati,
  // membatalkan aksi single-tap yang sempat terjadwal.
  video.addEventListener("click", () => {
    const now = Date.now();
    const delta = now - (video._lastTap || 0);
    video._lastTap = now;

    if (delta < 300) {
      clearTimeout(video._tapTimer);
      if (!likeBtn.classList.contains("liked")) setLiked(true);
      flashHeart(section);
      return;
    }

    video._tapTimer = setTimeout(() => {
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
    }, 260);
  });

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<p class="handle">${DEFAULT_USERNAME}</p><p class="caption">${prettifyCaption(file.name)}</p>`;

  const rail = document.createElement("div");
  rail.className = "rail";

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
  section.append(video, poster, playOverlay, centerIcon, heartBurst, spinner, errorMsg, muteBtn, progressTrack, meta, rail);
  return section;
}

// Video yang SUDAH pernah di-tap dijeda saat scroll keluar layar, dan
// dilanjutkan otomatis saat scroll balik masuk. Video yang BELUM pernah
// di-tap dibiarkan (tetap menampilkan poster + tombol play), tidak ada
// auto-buffering sama sekali sebelum user mengklik.
function setupAutoplay() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const section = entry.target;
        const video = section.querySelector("video");
        if (!video) return;
        const started = section.dataset.started === "1";
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          if (started) video.play().catch(() => {});
        } else if (started) {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
  );
  document.querySelectorAll(".video-item").forEach((el) => observer.observe(el));
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
    let files = await fetchVideoList();
    if (files.length === 0) {
      showStatus("empty");
      return;
    }
    if (typeof SHUFFLE_FEED !== "undefined" && SHUFFLE_FEED) {
      files = shuffleArray(files);
    }
    const fragment = document.createDocumentFragment();
    files.forEach((f) => fragment.appendChild(buildItem(f)));
    feedEl.appendChild(fragment);
    showStatus(null);
    setupAutoplay();
  } catch (err) {
    showStatus("error", err.message);
  }
}

init();
