// Bendra vieta, kurioje susitinka visi įrenginiai: privatus GitHub repo,
// pasiekiamas per Contents API. Serverio prižiūrėti nereikia, failai
// versijuojami (jei kas susijauks, GitHub'e matysi visą istoriją), o
// privatumas tikras — ne „secret gist“, kurį mato kiekvienas turintis nuorodą.
//
// Šis failas apie žymas nieko nežino: jis moka tik skaityti ir rašyti tekstinį
// failą. Suliejimo taisyklės — sinchronizacija.js.
//
// Naudojamas ir plėtinyje, ir telefono programėlėje, todėl čia nėra nė vieno
// `chrome.*` kreipinio.

const API = 'https://api.github.com';

function antrastes(cfg, papildomos) {
  return {
    'Authorization': 'Bearer ' + cfg.raktas,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(papildomos || {})
  };
}

function saknis(cfg) {
  return `${API}/repos/${encodeURIComponent(cfg.savininkas)}/${encodeURIComponent(cfg.repo)}`;
}

// Kreipinys, kuris nemeta nieko neaiškaus. `fetch` nulūžta ne tik dingus
// internetui: plėtinyje ji lūžta lygiai taip pat ir tada, kai neduota teisė
// kreiptis į api.github.com — o „Failed to fetch“ tokiu atveju nieko nepasako.
async function kreiptis(url, opt) {
  try {
    return await fetch(url, opt);
  } catch (e) {
    throw new Error('Nepavyko pasiekti GitHub. Arba nėra interneto, arba ' +
                    'plėtiniui neduota teisė kreiptis į api.github.com ' +
                    '(nustatymuose spausk „Įrašyti ir prijungti“). Smulkiau: ' + e.message);
  }
}

// GitHub klaidas verčiam į žmogui suprantamas: „401“ pačiam nieko nesako, o
// „raktas netinka arba baigėsi galiojimas“ pasako, ką daryti.
async function klaida(r) {
  let smulkiau = '';
  try {
    const j = await r.json();
    smulkiau = j.message || '';
  } catch { /* atsakymas ne JSON */ }

  if (r.status === 401) return new Error('Raktas netinka arba baigėsi jo galiojimas.');
  if (r.status === 403 && /rate limit/i.test(smulkiau)) return new Error('GitHub laikinai atsisako — per daug kreipinių. Pabandyk po valandos.');
  if (r.status === 403) return new Error('Raktui neduota teisė rašyti į šį repo (reikia Contents: Read and write).');
  if (r.status === 404) return new Error('Repo nerastas. Patikrink savininką, vardą ir ar raktui duota prieiga būtent prie jo.');
  if (r.status === 409 || r.status === 422) return new Error('Failas pasikeitė tuo pačiu metu kitame įrenginyje.');
  return new Error(`GitHub atsakė ${r.status}${smulkiau ? ': ' + smulkiau : ''}`);
}

// ------------------------------------------------------------------ base64

// btoa nemoka daugiabaičių simbolių, o žymų pavadinimuose jų pilna. Todėl
// pirma į baitus, tik paskui į base64 — ir gabalais, nes String.fromCharCode
// su keliais šimtais tūkstančių argumentų peržengia steko ribą (indeksas!).
export function iBase64(tekstas) {
  const baitai = new TextEncoder().encode(tekstas);
  let s = '';
  for (let i = 0; i < baitai.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, baitai.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function isBase64(b64) {
  const s = atob((b64 || '').replace(/\s+/g, ''));
  const baitai = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) baitai[i] = s.charCodeAt(i);
  return new TextDecoder().decode(baitai);
}

// ------------------------------------------------------------------- failai

// Katalogo turinys. Nesamas katalogas — ne klaida: repo iš pradžių tuščias.
export async function sarasas(cfg, katalogas) {
  const r = await kreiptis(`${saknis(cfg)}/contents/${katalogas}`, { headers: antrastes(cfg) });
  if (r.status === 404) return [];
  if (!r.ok) throw await klaida(r);
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j.filter(x => x.type === 'file')
          .map(x => ({ vardas: x.name, kelias: x.path, sha: x.sha, dydis: x.size }));
}

// Grąžina { tekstas, sha } arba null, jei failo nėra.
export async function skaityti(cfg, kelias) {
  const r = await kreiptis(`${saknis(cfg)}/contents/${kelias}`, { headers: antrastes(cfg) });
  if (r.status === 404) return null;
  if (!r.ok) throw await klaida(r);
  const j = await r.json();

  // Contents API turinį atiduoda tik iki 1 MB. Didesnius (indeksas!) imam per
  // blobs API — ten riba 100 MB.
  if (!j.content && j.sha) return { tekstas: await skaitytiBloba(cfg, j.sha), sha: j.sha };
  return { tekstas: isBase64(j.content), sha: j.sha };
}

export async function skaitytiBloba(cfg, sha) {
  const r = await kreiptis(`${saknis(cfg)}/git/blobs/${sha}`, {
    headers: antrastes(cfg, { 'Accept': 'application/vnd.github.raw' })
  });
  if (!r.ok) throw await klaida(r);
  return await r.text();
}

// `sha` privalomas, kai failas jau yra — taip GitHub užtikrina, kad neperrašai
// to, ko nematei. Perrašymo lenktynių čia beveik nebūna: kiekvienas įrenginys
// rašo tik savo failą.
export async function rasyti(cfg, kelias, tekstas, sha, zinute) {
  const r = await kreiptis(`${saknis(cfg)}/contents/${kelias}`, {
    method: 'PUT',
    headers: antrastes(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message: zinute || ('žymos: ' + kelias),
      content: iBase64(tekstas),
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok) throw await klaida(r);
  const j = await r.json();
  return { sha: j.content && j.content.sha };
}

// Ar derinys apskritai veikia? Naudojama nustatymų mygtuko „Patikrinti ryšį“.
export async function patikrinti(cfg) {
  const r = await kreiptis(saknis(cfg), { headers: antrastes(cfg) });
  if (!r.ok) throw await klaida(r);
  const j = await r.json();
  if (!j.private) {
    throw new Error('Šis repo viešas. Žymoms reikia privataus — sukurk privatų arba pakeisk šito matomumą.');
  }
  if (j.permissions && j.permissions.push === false) {
    throw new Error('Raktas šį repo mato, bet rašyti negali (reikia Contents: Read and write).');
  }
  return { vardas: j.full_name, privatus: j.private };
}
