// Aptarnaujantis darbininkas. Du darbai:
//   1. leidžia programėlę įsidiegti į telefono ekraną (be jo Android
//      „Įdiegti programėlę“ nesiūlo, o be įdiegimo nebūna ir dalijimosi meniu);
//   2. laiko apvalkalą atmintyje, kad be ryšio bent matytum išsaugotą sąrašą.
//
// Duomenų jis nekešuoja — jie guli IndexedDB ir taip yra telefone.

// Pakeitus numerį senasis kešas ištrinamas per `activate`. Verta pakelti
// kaskart, kai keičiasi pats apvalkalas — taip nelieka progos susidurti
// senai HTML su nauju JS.
const KESAS = 'zymos-v9';

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
      // Du dalykai, kurių nepadarius atnaujinimas atrodytų įvykęs, bet nebūtų:
      //   * `cache: 'reload'` — be jo `add` ima per naršyklės HTTP kešą, o
      //     GitHub Pages liepia turinį laikyti 10 minučių; į naują kešą tada
      //     patenka senas apvalkalas ir lieka ten iki kito atnaujinimo;
      //   * po vieną, o ne `addAll` — antraip vieno failo trūkumas nutrauktų
      //     visą įdiegimą.
      .then(k => Promise.all(APVALKALAS.map(
        u => k.add(new Request(u, { cache: 'reload' })).catch(() => {})
      )))
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
  // nepažįsta, todėl atsakom pačiu apvalkalu. Bet pirma bandom tinklą:
  // atiduoti seną index.html tuo metu, kai programa.js jau parsisiųsta nauja,
  // reikštų, kad naujas kodas ieško elementų, kurių senoje HTML dar nėra —
  // ir programėlė nulūžtų būtent dalijantis, t. y. dažniausiu atveju.
  if (u.origin === location.origin && u.pathname.endsWith('/index.html') && u.search) {
    e.respondWith(
      fetch('./index.html', { cache: 'no-cache' })
        .then(r => {
          if (r && r.ok) caches.open(KESAS).then(k => k.put('./index.html', r.clone()));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
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
