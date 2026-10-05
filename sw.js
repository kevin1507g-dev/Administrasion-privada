const APP_CACHE = "my-condominio-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./pwa-icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== APP_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(APP_CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || caches.match("./index.html"))
      )
  );
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      title: "My Condominio",
      body: event.data ? event.data.text() : "Nueva notificación"
    };
  }

  const title = data.title || "My Condominio";

  const options = {
    body: data.body || "Tienes una nueva notificación",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: {
      url: data.url || "./"
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data?.url || "./";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(windowClients => {

      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
