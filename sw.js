// Offline support for the site. A deploy writes VERSION and PRECACHE below
// (scripts/precache.mjs): the whole site is cached as one versioned set when
// the worker installs, and served from that set, so a page never mixes files
// from two deploys. A new deploy installs alongside, and the page offers a
// reload once it's ready. Unbuilt (VERSION 'dev', e.g. localhost) everything
// goes to the network first and the cache is only a fallback for offline.
const VERSION = 'dev';
const PRECACHE = [];

const SITE = `bots-site-${VERSION}`;
const RUNTIME = 'bots-runtime';
const FONTS = 'bots-fonts';
const DEV = VERSION === 'dev';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SITE);
    // `reload` skips the HTTP cache, so the set really is this deploy's.
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (DEV) self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('bots-site-') && k !== SITE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(DEV ? networkFirst(req) : fromSite(req));
});

/** The deploy's own copy; anything not in it from the network, cached for offline. */
async function fromSite(req) {
  const site = await caches.open(SITE);
  const key = req.mode === 'navigate' ? pageKey(req.url) : req.url;
  const hit = await site.match(key, { ignoreSearch: req.mode === 'navigate' });
  if (hit) return hit;
  return networkFirst(req);
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: req.mode === 'navigate' }))
      || (req.mode === 'navigate' && (await caches.match(pageKey(req.url))));
    if (hit) return hit;
    if (req.mode === 'navigate') return offlinePage();
    throw err;
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

/** Directory URLs are cached as their index.html. */
function pageKey(href) {
  const u = new URL(href);
  u.search = ''; u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
}

function offlinePage() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · bots</title>
<body style="font:16px system-ui;display:grid;place-items:center;min-height:90vh;margin:0;background:#f5f4f0;color:#17151f;text-align:center">
<div><p style="font-size:44px;margin:0">☁️</p><h1 style="font-size:20px">You're offline</h1><p>This page isn't saved on this device yet.</p><p><a href="./">Go to the home page</a></p></div>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
