const CACHE_NAME = "voca-card-offline-v15";
const APP_URL = new URL("./index.html", self.registration.scope);
const DECKS_URL = new URL("./decks.json", self.registration.scope);
const APP_FILES = [
  "./index.html",
  "./mobile.html",
  "./mobile_words.html",
  "./mobile_cards.html",
  "./mobile_cards_type.html",
  "./mobile.css",
  "./mobile.js",
  "./decks.json"
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of APP_FILES) {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (!response.ok) throw new Error(`Offline app asset could not be cached: ${url}`);
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("voca-card-offline-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(request, { ignoreSearch: true }) ||
        await cache.match(APP_URL.href) ||
        fetch(request);
    })());
    return;
  }

  if (requestUrl.href.split("?")[0] === DECKS_URL.href) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(DECKS_URL.href);
      if (!requestUrl.searchParams.has("_") && cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(DECKS_URL.href, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (!APP_FILES.includes(requestUrl.href.split("?")[0])) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(requestUrl.href.split("?")[0]);
    if (cached) return cached;

    return fetch(request);
  })());
});
