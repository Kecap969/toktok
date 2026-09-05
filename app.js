const listEl = document.getElementById("video-list");
const playerEl = document.getElementById("player");
const playerTitleEl = document.getElementById("player-title");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const errorDetailEl = document.getElementById("error-detail");

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

function playVideo(file, itemEl) {
  document.querySelectorAll("#video-list li.active").forEach((li) => li.classList.remove("active"));
  itemEl.classList.add("active");

  playerEl.src = videoSrc(file.id);
  playerTitleEl.textContent = prettifyCaption(file.name);
  playerEl.play().catch(() => {
    // Kalau browser tetap menolak autoplay, biarkan user tekan tombol play
    // bawaan di kontrol video.
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
  if (file.thumbnailLink) thumb.src = thumbnailUrl(file.thumbnailLink);
  else thumb.classList.add("no-thumb");

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
    playerEl.src = videoSrc(firstFile.id);
    playerTitleEl.textContent = prettifyCaption(firstFile.name);
  } catch (err) {
    showStatus("error", err.message);
  }
}

init();
