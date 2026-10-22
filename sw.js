// Service worker Indokep (PWA) -- hanya untuk halaman penonton.
// Yang di-cache: file inti situs (HTML/CSS/JS/ikon), dengan strategi
// JARINGAN DULU, cache sebagai cadangan. Jadi setiap kode diperbarui,
// pengunjung langsung dapat versi baru, dan kalau sinyal mati halaman
// tetap bisa dibuka.
// SENGAJA tidak disentuh: admin.html, video dari R2 (besar + butuh Range),
// dan semua request ke Supabase/domain lain (heartbeat, log-visit, daftar
// video harus selalu langsung ke server).

const CACHE = "indokep-v1";
const CORE = [
  "./", "index.html", "style.css", "app.js", "config.js",
  "indokep.png", "icon-192.png", "icon-512.png", "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Satu per satu: kalau ada file yang belum ada (mis. indokep.png),
      // yang lain tetap tersimpan.
      .then((cache) => Promise.all(CORE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return;                 // streaming video
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // R2, Supabase, fonts
  if (url.pathname.includes("admin")) return;           // admin: lewat browser biasa

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
      )
  );
});
