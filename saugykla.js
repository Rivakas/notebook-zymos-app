// Telefono saugykla. Atkartoja plėtinio bendra\saugykla.js sąsają, tik vietoj
// chrome.storage naudoja IndexedDB — localStorage netiktų, nes į jo 5 MB
// netilptų nė temų indeksas.
//
// Sąsaja ta pati sąmoningai: suliejimo kodas (bendra\suliejimas.js) tada
// nežino, kuriame įrenginyje sukasi, ir abiejose pusėse veikia tas pats.

import { kanonine, domenas as domenasIs, kalba as kalbaIs } from './bendra/tekstas.js';

const BAZE = 'notebook-zymos';
const LENTYNA = 'reiksmes';

let bazePr = null;

function baze() {
  if (bazePr) return bazePr;
  bazePr = new Promise((ok, blogai) => {
    const uz = indexedDB.open(BAZE, 1);
    uz.onupgradeneeded = () => uz.result.createObjectStore(LENTYNA);
    uz.onsuccess = () => ok(uz.result);
    uz.onerror = () => blogai(uz.error);
  });
  return bazePr;
}

async function gauti(raktas) {
  const db = await baze();
  return new Promise((ok, blogai) => {
    const uz = db.transaction(LENTYNA, 'readonly').objectStore(LENTYNA).get(raktas);
    uz.onsuccess = () => ok(uz.result);
    uz.onerror = () => blogai(uz.error);
  });
}

async function rasyti(raktas, reiksme) {
  const db = await baze();
  return new Promise((ok, blogai) => {
    const t = db.transaction(LENTYNA, 'readwrite');
    t.objectStore(LENTYNA).put(reiksme, raktas);
    t.oncomplete = () => ok();
    t.onerror = () => blogai(t.error);
  });
}

// -------------------------------------------------------------- įrašai

export async function gautiIrasus() {
  return (await gauti('irasai')) || [];
}

export async function irasytiIrasus(irasai) {
  await rasyti('irasai', irasai);
}

export async function pridetiIrasa(irasas) {
  const irasai = await gautiIrasus();
  const dabar = new Date().toISOString();
  const s = await gautiSinch();
  const naujas = {
    id: irasas.id || ('tel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)),
    tema: irasas.tema || '',
    pavadinimas: (irasas.pavadinimas || '').trim(),
    nuoroda: irasas.nuoroda || '',
    domenas: irasas.domenas || domenasIs(irasas.nuoroda || ''),
    zymos: Array.isArray(irasas.zymos) ? irasas.zymos : String(irasas.zymos || '').split(',').map(x => x.trim()).filter(Boolean),
    aprasymas: (irasas.aprasymas || '').trim(),
    pastaba: (irasas.pastaba || '').trim(),
    sukurta: dabar,
    kalba: kalbaIs((irasas.pavadinimas || '') + ' ' + (irasas.aprasymas || '')),
    keista: dabar,
    kur: s.irenginys
  };
  irasai.unshift(naujas);
  await irasytiIrasus(irasai);
  if (naujas.tema) await pridetiPaskutine(naujas.tema);
  return naujas;
}

export async function atnaujintiIrasa(id, keitimai) {
  const irasai = await gautiIrasus();
  const i = irasai.findIndex(x => x.id === id);
  if (i < 0) return null;
  const s = await gautiSinch();
  irasai[i] = { ...irasai[i], ...keitimai, keista: new Date().toISOString(), kur: s.irenginys };
  await irasytiIrasus(irasai);
  return irasai[i];
}

export async function rastiPagalNuoroda(url) {
  const k = kanonine(url);
  if (!k) return null;
  const irasai = await gautiIrasus();
  return irasai.find(i => kanonine(i.nuoroda) === k) || null;
}

// ----------------------------------------------------------- antkapiai

export async function gautiAntkapius() {
  return (await gauti('istrinti')) || [];
}

export async function irasytiAntkapius(istrinti) {
  await rasyti('istrinti', istrinti);
}

export async function trintiIrasus(ids) {
  const aibe = new Set(ids);
  if (!aibe.size) return;
  const irasai = await gautiIrasus();
  const kada = new Date().toISOString();
  const s = await gautiSinch();
  const seni = await gautiAntkapius();
  const turim = new Set(seni.map(a => a.id));
  const nauji = [...aibe].filter(id => !turim.has(id)).map(id => ({ id, kada, kur: s.irenginys }));
  await irasytiAntkapius(valytiAntkapius([...nauji, ...seni]));
  await irasytiIrasus(irasai.filter(x => !aibe.has(x.id)));
}

const ANTKAPIO_AMZIUS = 90 * 24 * 3600 * 1000;

export function valytiAntkapius(istrinti, saugoti) {
  const riba = Date.now() - ANTKAPIO_AMZIUS;
  return istrinti.filter(a => {
    if (saugoti && saugoti.has(a.id)) return true;
    const t = Date.parse(a.kada || '');
    return !Number.isFinite(t) || t > riba;
  });
}

// ------------------------------------------------------------ indeksas

export async function gautiIndeksa() {
  return (await gauti('indeksas')) || null;
}

export async function irasytiIndeksa(ix) {
  await rasyti('indeksas', ix);
}

// --------------------------------------------------------- paskutinės

export async function gautiPaskutines() {
  return (await gauti('paskutines')) || [];
}

export async function pridetiPaskutine(kelias) {
  let p = await gautiPaskutines();
  p = [kelias, ...p.filter(x => x !== kelias)].slice(0, 12);
  await rasyti('paskutines', p);
}

// ------------------------------------------------------------- derinys

const SINCH_NUTYLEJIMU = {
  savininkas: '', repo: '', raktas: '', irenginys: 'telefonas',
  paskutine: '', bukle: '', indeksoData: ''
};

export async function gautiSinch() {
  return { ...SINCH_NUTYLEJIMU, ...((await gauti('sinch')) || {}) };
}

export async function irasytiSinch(s) {
  await rasyti('sinch', { ...(await gautiSinch()), ...s });
}

export async function arPrijungta() {
  const s = await gautiSinch();
  return !!(s.savininkas && s.repo && s.raktas && s.irenginys);
}
