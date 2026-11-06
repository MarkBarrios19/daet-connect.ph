/* CONNECT-Daet service worker: shows Web Push notifications and opens their link. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Trip day without signal: the tourist's own ticket pages (the QR is part of
// the page) and their saved trip plans. Pages are stored only after the
// signed-in tourist opens them, the cache is cleared when they sign out, and
// nothing else is cached.
const TICKET_CACHE = "daet-tickets-v1";
const TICKET_PATH = /^\/tours\/bookings\/[0-9a-f-]{36}\/ticket$/i;
const TRIP_PATH = /^\/tours\/my-itineraries\/[0-9a-f-]{36}$/i;
const keepsOffline = (path) => TICKET_PATH.test(path) || TRIP_PATH.test(path);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !keepsOffline(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(caches.open(TICKET_CACHE).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(url.pathname, { cacheName: TICKET_CACHE });
        return (
          cached ||
          new Response(`You are offline and this ${TRIP_PATH.test(url.pathname) ? "trip" : "ticket"} has not been saved on this phone yet. Open it once with signal.`, {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
  );
});

// The ticket page asks to be saved right after it loads, so the first visit is covered too.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  // "save-ticket" keeps one page; "save-trip" keeps a trip plan and the tickets for that trip.
  const paths = (data.type === "save-ticket" ? [data.path] : data.type === "save-trip" && Array.isArray(data.paths) ? data.paths : [])
    .filter((path) => typeof path === "string" && keepsOffline(path))
    .slice(0, 20);
  if (paths.length) {
    event.waitUntil(
      Promise.all(
        paths.map((path) =>
          fetch(path, { credentials: "same-origin" })
            .then((response) => (response.ok && !response.redirected ? caches.open(TICKET_CACHE).then((cache) => cache.put(path, response)) : undefined))
            .catch(() => undefined),
        ),
      ),
    );
  }
  if (data.type === "clear-tickets") event.waitUntil(caches.delete(TICKET_CACHE));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CONNECT-Daet", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/tours/") ? data.url : "/tours/notifications";
  event.waitUntil(
    // A tab the person is looking at already shows this as a toast: skip the system popup.
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((client) => client.visibilityState === "visible" && client.focused)) return undefined;
      return self.registration.showNotification(data.title || "CONNECT-Daet", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url },
      lang: "en-PH",
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/tours/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
