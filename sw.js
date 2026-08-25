// Aptarnaujantis darbininkas. Du darbai:
//   1. leidžia programėlę įsidiegti į telefono ekraną (be jo Android
//      „Įdiegti programėlę“ nesiūlo, o be įdiegimo nebūna ir dalijimosi meniu);
//   2. laiko apvalkalą atmintyje, kad be ryšio bent matytum išsaugotą sąrašą.
//
// Duomenų jis nekešuoja — jie guli IndexedDB ir taip yra telefone.

const KESAS = 'zymos-v1';

const APVALKALAS = [
  './',
  './index.html',
  './stilius.css',
  './programa.js',
  './saugykla.js',
  './manifest.webmanifest',
  './bendra/tekstas.js',
  './bendra/indeksas.js',
  './bendra/nuotolis.js',
  './bendra/suliejimas.js',
  './ikonos/192.png',
  './ikonos/512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(KESAS)
      // addAll nutrūktų visas, jei nors vieno failo nebūtų — todėl po vieną.
      .then(k => Promise.all(APVALKALAS.map(u => k.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(v => Promise.all(v.filter(x => x !== KESAS).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);

  // GitHub kreipiniai pro kešą nepraeina niekada — mums reikia šviežių duomenų,
  // o ne to, kas buvo prieš valandą.
  if (u.hostname === 'api.github.com') return;
  if (e.request.method !== 'GET') return;

  // Dalijimosi metu adresas būna su parametrais (?url=…) — tokio kešas
  // nepažįsta, todėl atsakom pačiu apvalkalu.
  if (u.origin === location.origin && u.pathname.endsWith('/index.html') && u.search) {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(e.request)));
    return;
  }

  // Pirma tinklas, o kešas — atsarga. Taip po atnaujinimo iš karto matai naują
  // versiją, o be ryšio vis tiek kažką matai.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok && u.origin === location.origin) {
          const kopija = r.clone();
          caches.open(KESAS).then(k => k.put(e.request, kopija));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
