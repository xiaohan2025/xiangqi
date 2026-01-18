const CACHE_NAME = "xiangqi-helper-v16-pikafish";
const ASSETS = [
  "/",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "engine/pikafish.js",
  "engine/pikafish.wasm",
  "engine/pikafish.data",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // 强制立即激活新 SW
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all([
        ...keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        self.clients.claim() // 立即接管所有页面
      ])
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-First 策略：优先网络，失败时才用缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功获取网络资源，更新缓存
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => {
        // 网络失败，尝试用缓存
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/");
        });
      })
  );
});

