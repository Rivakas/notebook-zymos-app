// Suliejimo taisyklės ir sinchronizacijos eiga.
//
// Kertinis sprendimas: repo kataloge `zymos/` kiekvienas įrenginys turi SAVO
// failą (`namu-chrome.json`, `telefonas.json`) ir rašo tik į jį, o skaito
// visus. Todėl du įrenginiai niekada nerašo į tą pačią vietą — nereikia nei
// užraktų, nei konfliktų sprendimo protokolo, o suliejimas lieka paprasta
// sąjunga. Tai ir yra visa gudrybė; likusi failo dalis — jos smulkmenos.
//
// Kiekvienas įrašas nešiojasi `keista` (kada) ir `kur` (kuriame įrenginyje).
// Susidūrus dviem to paties `id` versijoms laimi naujesnė. Redaguodamas žymą
// įrenginys pasiima ją savo vardu (`kur` = jis pats), tad pataisymas visada
// atsiduria kieno nors publikuojamame faile.
//
// Čia nėra nė vieno `chrome.*` kreipinio — tą patį failą naudoja ir telefono
// programėlė, tik su savo saugyklos adapteriu.

import { kanonine } from './tekstas.js';
import { sarasas, skaityti, rasyti } from './nuotolis.js';

export const KATALOGAS = 'zymos';
export const DOKUMENTO_VERSIJA = 1;

// Įrenginio vardas tampa failo vardu, tad iš jo išmetam viską, kas keliuose
// nepageidautina. Lietuviškos raidės virsta lotyniškomis.
export function sauguVardas(s) {
  const raides = { 'ą':'a','č':'c','ę':'e','ė':'e','į':'i','š':'s','ų':'u','ū':'u','ž':'z' };
  return String(s || '').toLowerCase()
    .replace(/[ąčęėįšųūž]/g, m => raides[m])
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'irenginys';
}

export function failoKelias(irenginys) {
  return `${KATALOGAS}/${sauguVardas(irenginys)}.json`;
}

function laikas(s) {
  const t = Date.parse(s || '');
  return Number.isFinite(t) ? t : 0;
}

// Trumpas rinkinio „parašas“ palyginimui. Lyginti ištisus tekstus netiktų:
// raktų tvarka skirtinguose klientuose gali skirtis, o reikšminga tik tai,
// kokie įrašai, kada keisti ir kam priklauso.
function parasas(d) {
  return JSON.stringify([
    (d.irasai || []).map(i => [i.id, i.keista || '', i.kur || '']).sort(),
    (d.istrinti || []).map(a => [a.id, a.kada || '']).sort()
  ]);
}

// ------------------------------------------------------------- suliejimas

// Įeina vietinė būsena ir bet kiek nuotolinių dokumentų; išeina viena bendra
// tiesa. Funkcija gryna ir idempotentiška — paleista du kartus su tais pačiais
// duomenimis duoda tą patį rezultatą, todėl saugu ją kartoti kada nori.
export function sulieti(vietiniai, vietiniaiAntkapiai, dokumentai) {
  const irasai = new Map();      // id -> įrašas
  const antkapiai = new Map();   // id -> antkapis

  function priimtiIrasa(i) {
    if (!i || !i.id) return;
    const senas = irasai.get(i.id);
    if (!senas || laikas(i.keista) > laikas(senas.keista)) irasai.set(i.id, i);
  }
  function priimtiAntkapi(a) {
    if (!a || !a.id) return;
    const senas = antkapiai.get(a.id);
    if (!senas || laikas(a.kada) > laikas(senas.kada)) antkapiai.set(a.id, a);
  }

  for (const i of vietiniai || []) priimtiIrasa(i);
  for (const a of vietiniaiAntkapiai || []) priimtiAntkapi(a);
  for (const d of dokumentai || []) {
    for (const i of (d.irasai || [])) priimtiIrasa(i);
    for (const a of (d.istrinti || [])) priimtiAntkapi(a);
  }

  // Antkapis nusveria įrašą tik tada, kai yra už jį naujesnis. Kitaip
  // nebūtų kaip atkurti žymos: išsaugai tą patį puslapį iš naujo, o senas
  // trynimas jį vėl nušluotų.
  for (const [id, a] of antkapiai) {
    const i = irasai.get(id);
    if (i && laikas(a.kada) >= laikas(i.keista)) irasai.delete(id);
  }

  const { liko, sujungta } = sujungtiDublikatus([...irasai.values()], antkapiai);

  // Naujausi viršuje — taip pat, kaip juos deda pridetiIrasa.
  liko.sort((a, b) => laikas(b.sukurta) - laikas(a.sukurta));

  const buve = new Set((vietiniai || []).map(i => i.id));
  const dabar = new Set(liko.map(i => i.id));
  return {
    irasai: liko,
    istrinti: [...antkapiai.values()],
    gauta: liko.filter(i => !buve.has(i.id)).length,
    pasalinta: [...buve].filter(id => !dabar.has(id)).length,
    sujungta
  };
}

// Du įrenginiai gali nepriklausomai išsaugoti tą patį puslapį — id skirsis,
// nuoroda ta pati. Paliekam naujesnę versiją, bet iš senesnės pasiimam tai,
// ko naujesnė neturi: telefone išsaugota žyma dažnai būna be temos, o prie
// kompiuterio ta pati nuoroda jau sutvarkyta.
function sujungtiDublikatus(irasai, antkapiai) {
  const pagalNuoroda = new Map();
  const isbraukti = new Set();
  let sujungta = 0;

  for (const i of irasai) {
    const k = kanonine(i.nuoroda || '');
    if (!k) continue;
    const kitas = pagalNuoroda.get(k);
    if (!kitas) { pagalNuoroda.set(k, i); continue; }

    const [laimi, pralaimi] = laikas(i.keista) >= laikas(kitas.keista) ? [i, kitas] : [kitas, i];
    for (const laukas of ['tema', 'aprasymas', 'pastaba', 'pavadinimas']) {
      if (!laimi[laukas] && pralaimi[laukas]) laimi[laukas] = pralaimi[laukas];
    }
    if (!laimi.zymos || !laimi.zymos.length) laimi.zymos = pralaimi.zymos || [];
    // Sukūrimo laiką paliekam ankstyvesnį — žyma atsirado tada.
    if (laikas(pralaimi.sukurta) && laikas(pralaimi.sukurta) < laikas(laimi.sukurta)) {
      laimi.sukurta = pralaimi.sukurta;
    }
    isbraukti.add(pralaimi.id);
    // Antkapis pralaimėjusiam — kitaip jis grįžtų iš savo įrenginio failo.
    antkapiai.set(pralaimi.id, { id: pralaimi.id, kada: new Date().toISOString(), kur: 'dublikatas' });
    pagalNuoroda.set(k, laimi);
    sujungta++;
  }

  return { liko: irasai.filter(i => !isbraukti.has(i.id)), sujungta };
}

// ------------------------------------------------------------ sinchronizacija

// `adapteris` — vienintelis skirtumas tarp plėtinio ir telefono:
//   { gautiIrasus, irasytiIrasus, gautiAntkapius, irasytiAntkapius, valytiAntkapius }
export async function sinchronizuoti(cfg, adapteris, pranesk) {
  const zinia = t => { if (pranesk) pranesk(t); };
  const mano = failoKelias(cfg.irenginys);

  zinia('Skaitomi kitų įrenginių failai…');
  const failai = await sarasas(cfg, KATALOGAS);
  const dokumentai = [];
  const nuotoliniaiId = new Set();
  let manoSha = null;

  for (const f of failai) {
    if (!/\.json$/i.test(f.vardas)) continue;
    if (f.kelias === mano) manoSha = f.sha;
    const g = await skaityti(cfg, f.kelias);
    if (!g) continue;
    let d;
    try { d = JSON.parse(g.tekstas); } catch { continue; }   // sugadintas failas nestabdo kitų
    if (!d || !Array.isArray(d.irasai)) continue;
    dokumentai.push(d);
    for (const i of d.irasai) nuotoliniaiId.add(i.id);
  }

  const vietiniai = await adapteris.gautiIrasus();
  const vietiniaiAntkapiai = await adapteris.gautiAntkapius();
  const r = sulieti(vietiniai, vietiniaiAntkapiai, dokumentai);

  // Įrašus be `kur` — išsaugotus dar iki sinchronizacijos — pasiimam sau, ir
  // padarom tai prieš rašydami į vietinę saugyklą: kitaip savininkas liktų
  // neįrašytas ir kas kartą tektų pasisavinti iš naujo.
  for (const i of r.irasai) if (!i.kur) i.kur = cfg.irenginys;

  const antkapiai = adapteris.valytiAntkapius
    ? adapteris.valytiAntkapius(r.istrinti, nuotoliniaiId)
    : r.istrinti;

  // Į vietinę saugyklą rašom tik tada, kai tikrai kas nors pasikeitė. Ne dėl
  // greičio: plėtinyje kiekvienas įrašymas pažadina sinchronizaciją per
  // storage.onChanged, tad besąlygiškas rašymas suktųsi ratu be galo.
  if (parasas({ irasai: vietiniai, istrinti: vietiniaiAntkapiai }) !==
      parasas({ irasai: r.irasai, istrinti: antkapiai })) {
    await adapteris.irasytiIrasus(r.irasai);
    await adapteris.irasytiAntkapius(antkapiai);
  }

  // Publikuojam tik tai, kas priklauso šiam įrenginiui.
  const mane = r.irasai.filter(i => i.kur === cfg.irenginys);
  const manoAntkapiai = antkapiai.filter(a => !a.kur || a.kur === cfg.irenginys || a.kur === 'dublikatas');

  const dokumentas = {
    versija: DOKUMENTO_VERSIJA,
    irenginys: cfg.irenginys,
    atnaujinta: new Date().toISOString(),
    irasai: mane,
    istrinti: manoAntkapiai
  };

  // Jei niekas nepasikeitė, naujo commit'o nedarom — kitaip istorija
  // prisipildytų tuščių įrašų kas penkiolika minučių.
  const senas = dokumentai.find(d => d.irenginys === cfg.irenginys);
  const pokytis = !senas || parasas(senas) !== parasas(dokumentas);

  if (pokytis) {
    zinia('Siunčiama…');
    await rasyti(cfg, mano, JSON.stringify(dokumentas, null, 1), manoSha,
                 `žymos: ${cfg.irenginys} (${mane.length})`);
  }

  return {
    gauta: r.gauta,
    pasalinta: r.pasalinta,
    sujungta: r.sujungta,
    issiusta: pokytis ? mane.length : 0,
    irenginiai: dokumentai.length,
    isViso: r.irasai.length
  };
}

// Trumpa žinutė būklės eilutei.
export function santrauka(r) {
  const d = [];
  if (r.gauta) d.push(`gauta ${r.gauta}`);
  if (r.pasalinta) d.push(`pašalinta ${r.pasalinta}`);
  if (r.sujungta) d.push(`sujungti dublikatai: ${r.sujungta}`);
  if (r.issiusta) d.push('išsiųsta');
  return d.length ? `Sinchronizuota — ${d.join(', ')}. Iš viso: ${r.isViso}.`
                  : `Sinchronizuota, pokyčių nėra. Iš viso: ${r.isViso}.`;
}
