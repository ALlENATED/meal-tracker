/* ============================================================
   OFFLINE APP SHELL — service-worker.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     Lets the browser cache this app's own files so it still opens
     (and shows whatever was last loaded) without an internet
     connection, and is part of what makes a browser offer "Install
     app" / "Add to Home Screen" for it. This does NOT cache your
     DATA — your food log, weight entries, etc. all still live in
     localStorage and sync to the cloud via shared/cloud-sync.js;
     this file only caches the app's own code/styling so the PAGE
     ITSELF can open offline.

   IF YOU ADD A NEW FILE to the app (a new .css or .js file), add its
   path to APP_SHELL_FILES below too, or that new file won't be
   available offline.

   UPDATES ARE AUTOMATIC: the fetch handler below always tries the
   network FIRST for the app's own files, and only falls back to the
   saved offline copy if there's no internet — so as long as you're
   online, you always see whatever is currently on GitHub Pages, no
   manual step needed. Bumping CACHE_NAME (below) is no longer
   required for normal updates; it's kept only as a manual "throw
   everything out and start clean" escape hatch if something ever
   gets stuck.

   SAFE TO REWORK ALONE?
   Yes — nothing else in the app calls into this file directly; the
   browser runs it automatically once shared/cloud-sync.js registers
   it (see CloudSync's init()).
   ============================================================ */

const CACHE_NAME = 'meal-tracker-shell-v4';

const APP_SHELL_FILES = [
    './',
    'index.html',
    'manifest.json',
    'shared/theme-and-layout.css',
    'shared/app-data-and-settings.js',
    'shared/firebase-config.js',
    'shared/cloud-sync.js',
    'dashboard/dashboard.css',
    'dashboard/dashboard.js',
    'calendar/calendar.css',
    'calendar/calendar.js',
    'weight-tracking/weight-tracking.css',
    'weight-tracking/weight-tracking.js',
    'ingredients/ingredients.css',
    'ingredients/ingredients.js',
    'saved-meals/saved-meals.css',
    'saved-meals/saved-meals.js',
    'food-scanner/food-scanner.css',
    'food-scanner/food-scanner.js',
    'food-database/ingredient-list.js',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            // addAll fails as a whole if any single file 404s — use
            // individual adds so one missing/renamed file doesn't break
            // caching everything else.
            return Promise.all(
                APP_SHELL_FILES.map(function (url) {
                    return cache.add(url).catch(function (e) {
                        console.warn('Service worker: could not cache', url, e);
                    });
                })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (name) { return name !== CACHE_NAME; })
                    .map(function (name) { return caches.delete(name); })
            );
        })
    );
    self.clients.claim();
});

// Network-first for the app's own files: always try to fetch the current
// version first (and quietly save a copy for offline use as we go), and
// only fall back to that saved offline copy if the network request fails
// (no internet). This is what makes updates automatic — whenever you're
// online, you always get whatever's actually on GitHub Pages right now,
// with no cache-busting/versioning step needed; offline just falls back
// to the last version that successfully loaded.
self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return;

    // Only handle requests for this app's own files. Cross-origin requests
    // (Firestore's realtime Listen channel, Firebase Auth, etc.) must be
    // left completely alone — proxying a streaming/long-polling request
    // through the service worker's fetch()/clone() pipeline breaks it,
    // which is what caused Firestore sync errors in the console.
    if (event.request.url.indexOf(self.location.origin) !== 0) return;

    event.respondWith(
        fetch(event.request).then(function (response) {
            if (response && response.ok && event.request.url.indexOf(self.location.origin) === 0) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
            }
            return response;
        }).catch(function () {
            // offline — serve whatever we last saved for this exact
            // request, or fall back to index.html as a last resort.
            return caches.match(event.request).then(function (cached) {
                return cached || caches.match('index.html');
            });
        })
    );
});