// Temų indeksas ir katalogo siūlymas.
//
// Indeksas kuriamas naršyklėje iš dviejų failų:
//   Raindrop_NotebookLM/raindrop_visi_irasai.csv  — įrašai (privaloma)
//   _raindrop/duomenys/kolekcijos.json            — pilna temų hierarchija
//                                                   (nebūtina, bet įtraukia ir
//                                                   tuščias kolekcijas)
//
// Formatas (viskas masyvais, kad JSON būtų mažas):
//   temos : [{ k: "MOKSLAS › AI", n: 371 }]
//   zod   : { kamienas: [idf, temosNr, kiek, temosNr, kiek, ...] }
//   dom   : { "youtube.com": [visoKartu, temosNr, kiek, ...] }

import { zodziai, nuorodosZodziai, domenas, kanonine, normKelias, keliasIRakta, RODYKLE } from './tekstas.js';

// 5 — pridėtas bazės nuorodų sąrašas (varnelei ant seniau išsaugotų puslapių).
export const INDEKSO_VERSIJA = 5;

// Kiek sveria žodis, atėjęs iš skirtingų puslapio vietų.
const SV_PAVADINIMAS = 1.6;
const SV_ZYMOS = 1.3;
const SV_APRASYMAS = 1.0;
const SV_NUORODA = 0.8;
// Domenas, priklausantis vienai temai, vertas maždaug vieno stipraus žodžio.
const SV_DOMENAS = 14;
// Kiek sveria antras ir tolesni pataikę žodžiai.
const SILPNESNIU_DALIS = 0.55;

// Žemiau šio balo siūlymas jau nebe atpažinimas, o atsitiktinis sutapimas.
// Riba nustatyta bandant su esama baze: taiklūs spėjimai surenka 9–35 balus,
// atsitiktiniai sutapimai — 3–8.
export const SILPNAS = 8;

// Kiek temų laikome prie vieno žodžio / domeno.
const TEMU_ZODZIUI = 12;
const TEMU_DOMENUI = 10;
// Žodis, pasitaikantis rečiau nei tiek kartų, yra atsitiktinis triukšmas.
const MIN_DF = 3;
// Žodis, pasitaikantis daugiau nei tokioje dalyje įrašų, temos neišduoda.
const MAX_DF_DALIS = 0.12;

// ------------------------------------------------------------------- CSV

// RFC 4180 skaitytuvas: kabutės, kabutės kabutėse, eilutės laužtis lauke.
export function skaitytiCsv(tekstas) {
  if (tekstas.charCodeAt(0) === 0xFEFF) tekstas = tekstas.slice(1);
  const eilutes = [];
  let laukas = '';
  let eil = [];
  let kabutese = false;
  for (let i = 0; i < tekstas.length; i++) {
    const c = tekstas[i];
    if (kabutese) {
      if (c === '"') {
        if (tekstas[i + 1] === '"') { laukas += '"'; i++; }
        else kabutese = false;
      } else laukas += c;
      continue;
    }
    if (c === '"') { kabutese = true; continue; }
    if (c === ',') { eil.push(laukas); laukas = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { eil.push(laukas); eilutes.push(eil); eil = []; laukas = ''; continue; }
    laukas += c;
  }
  if (laukas !== '' || eil.length) { eil.push(laukas); eilutes.push(eil); }
  return eilutes;
}

// Lentelė -> objektų sąrašas pagal antraštės eilutę.
export function csvIObjektus(tekstas) {
  const eil = skaitytiCsv(tekstas);
  if (!eil.length) return [];
  const antr = eil[0].map(h => h.trim().toLowerCase());
  const out = [];
  for (let i = 1; i < eil.length; i++) {
    if (eil[i].length === 1 && eil[i][0] === '') continue;
    const o = {};
    for (let j = 0; j < antr.length; j++) o[antr[j]] = eil[i][j] ?? '';
    out.push(o);
  }
  return out;
}

// ------------------------------------------------------------ kūrimas

export function kurtiIndeksa(irasai, kolekcijos, pranesk) {
  const temuNr = new Map();          // raktas -> numeris
  const temos = [];                  // { k, n }

  // Rodomas pavadinimas imamas iš to šaltinio, kuris pasitaikė pirmas —
  // todėl kolekcijos.json skaitomas anksčiau už CSV: jame vardai tokie,
  // kokie dabar yra Raindrop'e.
  function temosNr(kelias) {
    const raktas = keliasIRakta(kelias);
    if (raktas === '') return -1;
    if (temuNr.has(raktas)) return temuNr.get(raktas);
    const nr = temos.length;
    temuNr.set(raktas, nr);
    temos.push({ k: normKelias(kelias), n: 0 });
    return nr;
  }

  // 1. Pilna hierarchija iš kolekcijos.json (jei duota) — kad siūlyti galėtume
  //    ir tas šakas, kuriose įrašų kol kas nėra.
  if (Array.isArray(kolekcijos)) {
    for (const c of kolekcijos) {
      const p = c.Path || c.path || c.Title || '';
      if (p) temosNr(p);
    }
  }

  // 2. Įrašai: žodžių ir domenų dažniai.
  const tfZod = new Map();   // kamienas -> Map(temosNr -> kiek)
  const df = new Map();      // kamienas -> keliuose įrašuose
  const tfDom = new Map();   // domenas -> Map(temosNr -> kiek)
  const domViso = new Map(); // domenas -> kiek įrašų iš viso

  // Bazės nuorodos — kad plėtinys atpažintų ir tai, kas išsaugota dar
  // Raindrop laikais, ir ant tokio puslapio uždegtų varnelę.
  const nuorodos = {};

  let n = 0;
  for (const r of irasai) {
    const nr = temosNr(r.tema || r.Path || '');
    if (nr < 0) continue;
    temos[nr].n++;
    n++;

    const url = r.nuoroda || r.link || '';
    const kanon = kanonine(url);
    if (kanon) nuorodos[kanon] = nr;

    const d = (r.domenas || domenas(url) || '').toLowerCase();
    if (d) {
      domViso.set(d, (domViso.get(d) || 0) + 1);
      let m = tfDom.get(d);
      if (!m) { m = new Map(); tfDom.set(d, m); }
      m.set(nr, (m.get(nr) || 0) + 1);
    }

    const tekstas = [r.pavadinimas || '', r.aprasymas || '', r.zymos || '', r.pastaba || ''].join(' ');
    const matyti = new Set(zodziai(tekstas).concat(nuorodosZodziai(url)));
    for (const w of matyti) {
      df.set(w, (df.get(w) || 0) + 1);
      let m = tfZod.get(w);
      if (!m) { m = new Map(); tfZod.set(w, m); }
      m.set(nr, (m.get(nr) || 0) + 1);
    }
    if (pranesk && n % 1000 === 0) pranesk(n);
  }

  // 3. Retinimas ir svorių skaičiavimas.
  const maxDf = Math.max(MIN_DF + 1, Math.floor(n * MAX_DF_DALIS));
  const zod = {};
  for (const [w, m] of tfZod) {
    const d = df.get(w);
    if (d < MIN_DF || d > maxDf) continue;
    const idf = Math.log(n / d);
    const poros = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, TEMU_ZODZIUI);
    const eil = [Math.round(idf * 100) / 100];
    for (const [nr, c] of poros) { eil.push(nr, c); }
    zod[w] = eil;
  }

  const dom = {};
  for (const [d, m] of tfDom) {
    const poros = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, TEMU_DOMENUI);
    const eil = [domViso.get(d)];
    for (const [nr, c] of poros) { eil.push(nr, c); }
    dom[d] = eil;
  }

  // Nuorodų sąrašas grąžinamas atskirai nuo indekso, nes jo prireikia daug
  // dažniau (kaskart persijungus į kitą kortelę), o indeksas — dešimt kartų
  // didesnis. Saugykloje jie irgi guli po atskirais raktais.
  return {
    indeksas: {
      versija: INDEKSO_VERSIJA,
      sukurta: new Date().toISOString(),
      irasu: n,
      temos,
      zod,
      dom,
      zodziuViso: Object.keys(zod).length,
      domenuViso: Object.keys(dom).length,
      nuoroduViso: Object.keys(nuorodos).length
    },
    nuorodos
  };
}

// ------------------------------------------------------------ siūlymas

// Grąžina surikiuotą sąrašą: [{ nr, kelias, balas, dalis, kodel: [...] }]
export function siulyti(indeksas, puslapis, opt = {}) {
  const kiek = opt.kiek || 6;
  const paskutines = opt.paskutines || [];   // neseniai naudotų temų keliai
  if (!indeksas || !indeksas.temos || !indeksas.temos.length) return [];

  const balai = new Map();
  const priezastys = new Map();

  function pridek(nr, sv, kodel) {
    balai.set(nr, (balai.get(nr) || 0) + sv);
    if (kodel) {
      let a = priezastys.get(nr);
      if (!a) { a = []; priezastys.set(nr, a); }
      a.push({ kodel, sv });
    }
  }

  // 1. Domenas. P(tema | domenas), pridusinta pagal to domeno įrašų kiekį —
  //    vienas įrašas iš domeno dar nieko neįrodo.
  const d = puslapis.domenas || domenas(puslapis.nuoroda || '');
  const de = d && indeksas.dom[d];
  if (de) {
    const viso = de[0];
    const pasitikejimas = viso / (viso + 2);
    for (let i = 1; i < de.length; i += 2) {
      const nr = de[i], c = de[i + 1];
      const p = c / viso;
      if (p < 0.03) continue;
      pridek(nr, SV_DOMENAS * p * pasitikejimas, 'domenas ' + d + ' (' + c + ' iš ' + viso + ')');
    }
  }

  // 2. Žodžiai. Tas pats žodis sveria skirtingai priklausomai nuo to, kur
  //    puslapyje jis rastas — pavadinime jis reiškia daugiau nei aprašyme.
  const uzklausa = new Map();
  const suvesk = (tekstas, sv) => {
    for (const w of zodziai(tekstas)) {
      if ((uzklausa.get(w) || 0) < sv) uzklausa.set(w, sv);
    }
  };
  suvesk(puslapis.pavadinimas || '', SV_PAVADINIMAS);
  suvesk(puslapis.zymos || '', SV_ZYMOS);
  suvesk(puslapis.aprasymas || '', SV_APRASYMAS);
  for (const w of nuorodosZodziai(puslapis.nuoroda || '')) {
    if ((uzklausa.get(w) || 0) < SV_NUORODA) uzklausa.set(w, SV_NUORODA);
  }

  const pataike = new Map();   // nr -> [[žodis, svoris]]
  for (const [w, wsv] of uzklausa) {
    const e = indeksas.zod[w];
    if (!e) continue;
    const idf = e[0];
    for (let i = 1; i < e.length; i += 2) {
      const nr = e[i], c = e[i + 1];
      const t = indeksas.temos[nr];
      if (!t) continue;
      // Vertinamas ne dažnis, o *santykis*: kiek kartų dažniau žodis pasitaiko
      // šioje temoje nei visoje bazėje. Kitaip tokie žodžiai kaip „basic" ar
      // „open" laimėtų vien todėl, kad jų daug — nors temos jie neišduoda.
      //   P(žodis|tema) = c / temos dydis
      //   P(žodis)      = exp(-idf)          (nes idf = ln(N / df))
      const santykis = (c / Math.max(1, t.n)) * Math.exp(idf);
      // Vienas pataikymas dar ne dėsningumas — kol pataikymų mažai, balas mažinamas.
      const tikrumas = c / (c + 2);
      const sv = wsv * Math.log2(1 + santykis) * tikrumas;
      let a = pataike.get(nr);
      if (!a) { a = []; pataike.set(nr, a); }
      a.push([w, sv]);
    }
  }

  // Žodžių balai sudedami su mažėjančia grąža. Sudėjus tiesiai, keli silpni
  // bendriniai žodžiai („basic", „tutorial", „step") nusvertų vieną tikslų
  // („supertrend") — nors iš tikrųjų jie sako beveik tą patį.
  for (const [nr, a] of pataike) {
    a.sort((x, y) => y[1] - x[1]);
    let suma = a[0][1];
    for (let i = 1; i < a.length; i++) suma += SILPNESNIU_DALIS * a[i][1];
    pridek(nr, suma, null);
  }
  for (const [nr, a] of pataike) {
    let arr = priezastys.get(nr);
    if (!arr) { arr = []; priezastys.set(nr, arr); }
    arr.push({ kodel: 'žodžiai: ' + a.slice(0, 4).map(x => x[0]).join(', '), sv: 0 });
  }

  // 3. Neseniai naudotos temos — mažas postūmis, kad kasdienis darbas
  //    nesikaitaliotų. Naujų temų į sąrašą neįtraukia, tik pakelia esamas.
  if (paskutines.length) {
    const kelioNr = new Map();
    indeksas.temos.forEach((t, i) => kelioNr.set(t.k, i));
    paskutines.forEach((k, i) => {
      const nr = kelioNr.get(k);
      if (nr === undefined || !balai.has(nr)) return;
      pridek(nr, 2.0 * (1 - i / paskutines.length), 'neseniai naudota');
    });
  }

  const eil = [...balai.entries()]
    .map(([nr, b]) => ({ nr, kelias: indeksas.temos[nr].k, irasu: indeksas.temos[nr].n, balas: b }))
    .filter(x => x.balas > 0.05)
    .sort((a, b) => b.balas - a.balas)
    .slice(0, kiek);

  const maks = eil.length ? eil[0].balas : 1;
  for (const x of eil) {
    x.dalis = Math.max(0.04, Math.min(1, x.balas / maks));
    const pr = (priezastys.get(x.nr) || []).slice().sort((a, b) => b.sv - a.sv);
    x.kodel = pr.map(p => p.kodel).slice(0, 2);
  }
  return eil;
}

// Paieška temų sąraše (naudotojui vedant tekstą).
export function ieskotiTemu(indeksas, uzklausa, kiek = 40) {
  if (!indeksas || !indeksas.temos) return [];
  const q = (uzklausa || '').trim().toLowerCase();
  if (!q) {
    return indeksas.temos
      .map((t, nr) => ({ nr, kelias: t.k, irasu: t.n }))
      .sort((a, b) => b.irasu - a.irasu)
      .slice(0, kiek);
  }
  // Skirtukai laikomi tarpais — kad rastų ir įrašius visą kelią
  // („MOKSLAS / SOKIAI / Bachata"), ne tik atskirus žodžius.
  const dalys = q.split(/[\s›/>]+/).filter(Boolean);
  if (!dalys.length) return [];
  const rez = [];
  for (let nr = 0; nr < indeksas.temos.length; nr++) {
    const t = indeksas.temos[nr];
    const k = t.k.toLowerCase();
    if (!dalys.every(d => k.includes(d))) continue;
    // atitikmuo paskutiniame kelio segmente svarbesnis už atitikmenį šaknyje
    const pask = k.split(RODYKLE).pop().trim();
    const bonus = pask.startsWith(dalys[0]) ? 1000 : (pask.includes(dalys[0]) ? 400 : 0);
    rez.push({ nr, kelias: t.k, irasu: t.n, r: bonus + t.n });
  }
  rez.sort((a, b) => b.r - a.r);
  return rez.slice(0, kiek);
}
