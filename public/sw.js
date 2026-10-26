// Service worker Crustea Portal.
// Sengaja sederhana: TIDAK menyimpan data aplikasi (tugas, log kerja, dsb.) di HP.
// Hanya menyimpan satu halaman "Tidak ada koneksi" untuk ditampilkan saat offline.

const CACHE = "crustea-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Hanya untuk membuka halaman; permintaan lain dibiarkan langsung ke internet.
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
