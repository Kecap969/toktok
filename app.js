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
  const params = new URLSearchParams({
    q: `'${FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
    fields: "files(id,name)",
    orderBy: "createdTime desc",
    pageSize: "100",
    key: API_KEY,
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.files || [];
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

  const centerIcon = document.createElement("div");
  centerIcon.className = "center-icon";

  const spinner = document.createElement("div");
  spinner.className = "buffer-spinner";

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

  video.addEventListener("click", () => {
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
  });

  const meta = document.createElement("div");
  meta.className = "meta";
  const caption = (file.name || "").replace(/\.[^/.]+$/, "");
  meta.innerHTML = `<p class="handle">${DEFAULT_USERNAME}</p><p class="caption">${caption}</p>`;

  const rail = document.createElement("div");
  rail.className = "rail";

  const liked = localStorage.getItem(likedKey(file.id)) === "1";
  const likeBtn = document.createElement("button");
  likeBtn.className = liked ? "liked" : "";
  likeBtn.innerHTML = `${ICONS.heart}<span>Suka</span>`;
  likeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const now = likeBtn.classList.toggle("liked");
    localStorage.setItem(likedKey(file.id), now ? "1" : "0");
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
  section.append(video, centerIcon, spinner, muteBtn, meta, rail);
  return section;
}

function playVisible(video, section) {
  // Kalau audio sudah "unlocked" dari interaksi sebelumnya, coba nyalakan
  // suara otomatis untuk video baru ini juga.
  if (audioUnlocked) video.muted = false;
  updateMuteButton(section, video);

  if (video.preload === "none") video.preload = "auto";

  if (video.readyState < 3) {
    section.querySelector(".buffer-spinner").classList.add("show");
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

function preloadNext(section) {
  const next = section.nextElementSibling;
  if (!next) return;
  const nextVideo = next.querySelector("video");
  if (nextVideo && nextVideo.preload === "none") {
    nextVideo.preload = "auto";
  }
}

function setupAutoplay() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const section = entry.target;
        const video = section.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          playVisible(video, section);
          preloadNext(section);
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
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
    const files = await fetchVideoList();
    if (files.length === 0) {
      showStatus("empty");
      return;
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
