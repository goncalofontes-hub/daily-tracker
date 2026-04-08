var CACHE_NAME = 'daily-tracker-v3';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (response) {
        return caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    }).catch(function () {
      if (event.request.destination === 'document') {
        return caches.match('./index.html');
      }
    })
  );
});

// ── Reminder scheduling ──
var reminderTimer = null;

self.addEventListener('message', function (event) {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_REMINDER') {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
    if (!event.data.time) return;

    var parts = event.data.time.split(':');
    var now = new Date();
    var target = new Date(now);
    target.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    var delay = target.getTime() - now.getTime();

    reminderTimer = setTimeout(function () {
      self.registration.showNotification('Daily Tracker', {
        body: "Don't forget to fill in your daily checklist!",
        icon: self.registration.scope + 'icons/icon-192.png',
        badge: self.registration.scope + 'icons/icon-192.png',
        tag: 'daily-reminder',
        renotify: true
      });
      // Re-schedule for next day
      reminderTimer = setTimeout(function () {
        self.registration.showNotification('Daily Tracker', {
          body: "Don't forget to fill in your daily checklist!",
          icon: self.registration.scope + 'icons/icon-192.png',
          tag: 'daily-reminder',
          renotify: true
        });
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }

  if (event.data.type === 'CANCEL_REMINDER') {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  }
});

// Open app when notification is tapped
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) !== -1) {
          return list[i].focus();
        }
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});
