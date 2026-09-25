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
