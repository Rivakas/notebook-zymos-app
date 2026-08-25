// Telefono programėlė. Tas pats sąrašas ir tos pačios temos kaip plėtinyje —
// siūlymo variklis (bendra\indeksas.js) čia įkeliamas nepakeistas.
//
// Ko telefone nėra ir negali būti: puslapio aprašymo bei raktažodžių. Naršyklė
// dalijasi tik antrašte ir nuoroda, o parsisiųsti puslapio iš svetimo domeno
// programėlei neleidžia naršyklės saugumo taisyklės. Todėl siūlymas remiasi
// domenu ir antrašte — praktiškai to beveik visada užtenka.

import { siulyti, ieskotiTemu, SILPNAS } from './bendra/indeksas.js';
import { domenas, normKelias, keliasIRakta, RODYKLE } from './bendra/tekstas.js';
import { sinchronizuoti as vykdyti, santrauka } from './bendra/suliejimas.js';
import { skaityti, patikrinti } from './bendra/nuotolis.js';
import * as S from './saugykla.js';

const $ = id => document.getElementById(id);

let indeksas = null;
let pasirinkta = '';
let dalinamasi = null;   // { nuoroda, pavadinimas, aprasymas }

// --------------------------------------------------------------- paleidimas

(async function pradeti() {
  indeksas = await S.gautiIndeksa();
  await piestiKieki();
  await piestiRysi();
  await piestiDerini();
  priimtiDalijimasi();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* be jo veiks, tik ne neprisijungus */ });
  }

  // Atsivėrus programėlei pasitikrinam, ar kompiuteryje neatsirado naujo.
  // Tyliai: jei telefonas be ryšio, tai ne klaida, o įprasta būsena.
  if (await S.arPrijungta()) sinchronizuoti(true);
})();

// Android „Dalintis“ atiduoda duomenis adreso parametrais. Kartais nuoroda
// atsiduria ne `url`, o `text` lauke (taip elgiasi dalis programų), todėl
// tikrinam abu.
function priimtiDalijimasi() {
  const p = new URLSearchParams(location.search);
  const tekstas = p.get('text') || '';
  let nuoroda = p.get('url') || '';
  if (!nuoroda) {
    const m = tekstas.match(/https?:\/\/\S+/);
    if (m) nuoroda = m[0];
  }
  if (!nuoroda) return;

  // Jei nuoroda buvo tekste, likutis tinka aprašymui — bet ne tada, kai
  // tekstas tėra ta pati nuoroda.
  const likutis = tekstas.replace(nuoroda, '').trim();
  pradetiIrasyma({
    nuoroda,
    pavadinimas: p.get('title') || likutis.split('\n')[0] || '',
    aprasymas: likutis
  });

  // Adresą išvalom, kad perkrovus puslapį tas pats dalijimasis nepasikartotų.
  history.replaceState(null, '', location.pathname);
}

// ------------------------------------------------------------------ vaizdai

document.querySelectorAll('.skirtukas').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.skirtukas').forEach(x => x.classList.toggle('aktyvus', x === b));
    document.querySelectorAll('.vaizdas').forEach(v => v.classList.add('hidden'));
    $('v-' + b.dataset.v).classList.remove('hidden');
    if (b.dataset.v === 'sarasas') piestiSarasa();
    if (b.dataset.v === 'nustatymai') piestiDerini();
    scrollTo(0, 0);
  };
});

function rodyti(vardas) {
  const b = document.querySelector(`.skirtukas[data-v="${vardas}"]`);
  if (b) b.click();
}

// ----------------------------------------------------------------- įrašymas

$('ranka-toliau').onclick = () => {
  const u = $('ranka-nuoroda').value.trim();
  if (!/^https?:\/\//.test(u)) { $('ranka-nuoroda').focus(); return; }
  pradetiIrasyma({ nuoroda: u, pavadinimas: '', aprasymas: '' });
};

async function pradetiIrasyma(p) {
  dalinamasi = p;
  pasirinkta = '';
  rodyti('irasyti');
  $('nera-ko').classList.add('hidden');
  $('forma').classList.remove('hidden');
  $('f-pavadinimas').value = p.pavadinimas || p.nuoroda;
  $('f-nuoroda').textContent = p.nuoroda;
  $('f-pastaba').value = '';
  $('f-paieska').value = '';
  $('paieskos-rezultatai').innerHTML = '';
  $('irasymo-bukle').textContent = '';
  $('pasirinkta-tema').textContent = '—';
  $('issaugoti').disabled = true;

  const turim = await S.rastiPagalNuoroda(p.nuoroda);
  const j = $('jau-turim');
  j.classList.toggle('hidden', !turim);
  if (turim) j.textContent = 'Šią nuorodą jau turi → ' + (turim.tema || '(be temos)');

  await piestiSiulymus();
}

async function piestiSiulymus() {
  const ul = $('siulymai');
  ul.innerHTML = '';
  $('silpna').classList.add('hidden');

  if (!indeksas) {
    ul.innerHTML = '<li class="tuscias">Indekso nėra — temų pasiūlyti negaliu. ' +
                   'Parsisiųsk jį skiltyje „Nustatymai“.</li>';
    return;
  }

  const s = siulyti(indeksas, {
    nuoroda: dalinamasi.nuoroda,
    domenas: domenas(dalinamasi.nuoroda),
    pavadinimas: $('f-pavadinimas').value,
    aprasymas: dalinamasi.aprasymas || '',
    zymos: ''
  }, { kiek: 6, paskutines: await S.gautiPaskutines() });

  if (!s.length) {
    ul.innerHTML = '<li class="tuscias">Nieko panašaus bazėje nerasta.</li>';
    return;
  }

  s.forEach((x, i) => {
    const li = document.createElement('li');
    li.dataset.kelias = x.kelias;

    const juosta = document.createElement('span');
    juosta.className = 'juostele';
    juosta.style.width = Math.round(x.dalis * 100) + '%';
    li.append(juosta);

    const k = document.createElement('div');
    k.className = 'kelias';
    k.append(paryskintiKelia(x.kelias));
    li.append(k);

    if (x.kodel && x.kodel.length) {
      const d = document.createElement('div');
      d.className = 'kodel';
      d.textContent = x.kodel.join(' · ');
      li.append(d);
    }

    li.onclick = () => pasirinktiTema(x.kelias);
    ul.append(li);
  });

  // Pirmą siūlymą pažymim tik tada, kai jis tvirtas — taip pat, kaip plėtinyje.
  if (s[0].balas >= SILPNAS) pasirinktiTema(s[0].kelias);
  else $('silpna').classList.remove('hidden');
}

function paryskintiKelia(kelias) {
  const dalys = kelias.split(RODYKLE).map(x => x.trim());
  const el = document.createElement('span');
  el.append(dalys.slice(0, -1).join(' ' + RODYKLE + ' '));
  if (dalys.length > 1) el.append(' ' + RODYKLE + ' ');
  const b = document.createElement('b');
  b.textContent = dalys[dalys.length - 1];
  el.append(b);
  return el;
}

function pasirinktiTema(kelias) {
  pasirinkta = kelias;
  $('pasirinkta-tema').textContent = kelias;
  $('issaugoti').disabled = !kelias;
  document.querySelectorAll('#siulymai li, #paieskos-rezultatai li')
    .forEach(li => li.classList.toggle('zymeta', li.dataset.kelias === kelias));
}

$('f-paieska').oninput = () => {
  const q = $('f-paieska').value.trim();
  const ul = $('paieskos-rezultatai');
  ul.innerHTML = '';
  if (!q || !indeksas) return;

  const rez = ieskotiTemu(indeksas, q, 12);
  for (const r of rez) {
    const li = document.createElement('li');
    li.dataset.kelias = r.kelias;
    li.append(paryskintiKelia(r.kelias));
    li.onclick = () => pasirinktiTema(r.kelias);
    ul.append(li);
  }

  // Naujos temos kūrimas siūlomas tik tada, kai įrašytas visas kelias su
  // skirtuku ir tokios temos dar nėra — kaip ir plėtinyje.
  if (q.includes('/')) {
    const naujas = normKelias(q);
    const raktas = keliasIRakta(naujas);
    if (!indeksas.temos.some(t => keliasIRakta(t.k) === raktas)) {
      const li = document.createElement('li');
      li.dataset.kelias = naujas;
      li.className = 'nauja';
      li.append('Sukurti naują: ', paryskintiKelia(naujas));
      li.onclick = () => pasirinktiTema(naujas);
      ul.append(li);
    }
  }
};

$('issaugoti').onclick = async () => {
  if (!pasirinkta || !dalinamasi) return;
  $('issaugoti').disabled = true;
  await S.pridetiIrasa({
    tema: pasirinkta,
    pavadinimas: $('f-pavadinimas').value,
    nuoroda: dalinamasi.nuoroda,
    aprasymas: dalinamasi.aprasymas || '',
    pastaba: $('f-pastaba').value
  });
  const b = $('irasymo-bukle');
  b.className = 'bukle gerai';
  b.textContent = 'Išsaugota → ' + pasirinkta;
  await piestiKieki();

  dalinamasi = null;
  $('forma').classList.add('hidden');
  $('nera-ko').classList.remove('hidden');
  $('ranka-nuoroda').value = '';

  if (await S.arPrijungta()) sinchronizuoti(true);
};

// ------------------------------------------------------------------ sąrašas

async function piestiKieki() {
  $('kiekis').textContent = (await S.gautiIrasus()).length;
}

$('paieska').oninput = () => piestiSarasa();

async function piestiSarasa() {
  const q = $('paieska').value.trim().toLowerCase();
  const irasai = await S.gautiIrasus();
  const rodomi = q
    ? irasai.filter(i => (i.pavadinimas + ' ' + i.nuoroda + ' ' + i.tema).toLowerCase().includes(q))
    : irasai;

  const s = $('sarasas');
  s.innerHTML = '';
  if (!rodomi.length) {
    s.innerHTML = '<div class="tuscias">' + (q ? 'Nieko nerasta.' : 'Žymų kol kas nėra.') + '</div>';
    return;
  }

  for (const i of rodomi.slice(0, 300)) {
    const d = document.createElement('div');
    d.className = 'irasas';

    const pav = document.createElement('div');
    pav.className = 'pav';
    pav.textContent = i.pavadinimas || i.nuoroda;
    d.append(pav);

    const a = document.createElement('a');
    a.className = 'nuor';
    a.href = i.nuoroda;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = i.domenas || i.nuoroda;
    d.append(a);

    if (i.tema) {
      const t = document.createElement('div');
      t.className = 'tema';
      t.textContent = i.tema;
      d.append(t);
    }

    const tr = document.createElement('button');
    tr.className = 'trinti';
    tr.textContent = 'Ištrinti';
    tr.onclick = async () => {
      if (!confirm('Ištrinti šią žymą? Ji dings ir kompiuteryje.')) return;
      await S.trintiIrasus([i.id]);
      await piestiKieki();
      await piestiSarasa();
      if (await S.arPrijungta()) sinchronizuoti(true);
    };
    d.append(tr);

    s.append(d);
  }
}

// ----------------------------------------------------------- sinchronizacija

const ADAPTERIS = {
  gautiIrasus: S.gautiIrasus,
  irasytiIrasus: S.irasytiIrasus,
  gautiAntkapius: S.gautiAntkapius,
  irasytiAntkapius: S.irasytiAntkapius,
  valytiAntkapius: S.valytiAntkapius
};

let sinchVyksta = false;

async function sinchronizuoti(tyliai) {
  if (sinchVyksta) return;
  if (!await S.arPrijungta()) {
    if (!tyliai) parodyti('n-bukle', 'Pirma prijunk.', false);
    return;
  }
  sinchVyksta = true;
  const cfg = await S.gautiSinch();
  try {
    if (!tyliai) parodyti('n-bukle', 'Sinchronizuojama…', null);
    const r = await vykdyti(cfg, ADAPTERIS, t => { if (!tyliai) parodyti('n-bukle', t, null); });
    const z = santrauka(r);
    await S.irasytiSinch({ paskutine: new Date().toISOString(), bukle: z });
    if (!tyliai) parodyti('n-bukle', z, true);
    await piestiKieki();
    await piestiRysi();
    if (!$('v-sarasas').classList.contains('hidden')) await piestiSarasa();
  } catch (e) {
    await S.irasytiSinch({ bukle: 'Nepavyko: ' + e.message });
    if (!tyliai) parodyti('n-bukle', 'Nepavyko: ' + e.message, false);
    await piestiRysi();
  } finally {
    sinchVyksta = false;
  }
}

function parodyti(id, tekstas, gerai) {
  const el = $(id);
  el.className = 'bukle' + (gerai === true ? ' gerai' : gerai === false ? ' bloga' : '');
  el.textContent = tekstas;
}

async function piestiRysi() {
  const s = await S.gautiSinch();
  const el = $('rysys');
  if (!(s.savininkas && s.repo && s.raktas)) { el.textContent = 'neprijungta'; return; }
  el.textContent = s.paskutine
    ? 'atnaujinta ' + new Date(s.paskutine).toLocaleString('lt-LT', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })
    : 'prijungta';
}

// ------------------------------------------------------------- nustatymai

async function piestiDerini() {
  const s = await S.gautiSinch();
  $('n-savininkas').value = s.savininkas;
  $('n-repo').value = s.repo;
  $('n-raktas').value = s.raktas;
  $('n-irenginys').value = s.irenginys;

  const k = $('derinio-bukle');
  const ijungta = s.savininkas && s.repo && s.raktas && s.irenginys;
  k.className = ijungta ? 'kortele' : 'kortele tuscia';
  k.innerHTML = ijungta
    ? `<b>Prijungta</b> — ${s.savininkas}/${s.repo}<br>Šis įrenginys: ${s.irenginys}<br>` +
      `Paskutinį kartą: ${s.paskutine ? new Date(s.paskutine).toLocaleString('lt-LT') : '—'}<br>` +
      `<span class="smulkiai">${s.bukle || ''}</span>`
    : '<b>Neprijungta.</b> Žymos guls tik šiame telefone.';

  $('indekso-bukle').textContent = indeksas
    ? `Indeksas: ${indeksas.temos.length} temų${s.indeksoData ? ', parsisiųsta ' + new Date(s.indeksoData).toLocaleDateString('lt-LT') : ''}.`
    : 'Indekso nėra — temos nebus siūlomos.';
}

$('n-irasyti').onclick = async () => {
  const cfg = {
    savininkas: $('n-savininkas').value.trim().replace(/^@/, ''),
    repo: $('n-repo').value.trim(),
    raktas: $('n-raktas').value.trim(),
    irenginys: $('n-irenginys').value.trim()
  };
  if (!cfg.savininkas || !cfg.repo || !cfg.raktas || !cfg.irenginys) {
    parodyti('n-bukle', 'Užpildyk visus keturis laukus.', false);
    return;
  }
  parodyti('n-bukle', 'Tikrinamas ryšys…', null);
  try {
    const r = await patikrinti(cfg);
    await S.irasytiSinch(cfg);
    parodyti('n-bukle', `Prisijungta prie ${r.vardas}.`, true);
    await sinchronizuoti(false);
    await piestiDerini();
  } catch (e) {
    parodyti('n-bukle', e.message, false);
  }
};

$('n-dabar').onclick = () => sinchronizuoti(false);

$('n-indeksas').onclick = async () => {
  const cfg = await S.gautiSinch();
  if (!cfg.savininkas || !cfg.repo || !cfg.raktas) {
    parodyti('indekso-bukle', 'Pirma prijunk.', false);
    return;
  }
  parodyti('indekso-bukle', 'Siunčiama… (apie 1 MB)', null);
  try {
    const g = await skaityti(cfg, 'indeksas.json');
    if (!g) {
      parodyti('indekso-bukle', 'Repo indekso nėra — įkelk jį iš kompiuterio ' +
               '(Nustatymai → Sinchronizacija → Nusiųsti indeksą telefonui).', false);
      return;
    }
    const ix = JSON.parse(g.tekstas);
    await S.irasytiIndeksa(ix);
    await S.irasytiSinch({ indeksoData: new Date().toISOString() });
    indeksas = ix;
    parodyti('indekso-bukle', `Parsisiųsta: ${ix.temos.length} temų.`, true);
  } catch (e) {
    parodyti('indekso-bukle', 'Nepavyko: ' + e.message, false);
  }
};

$('n-atjungti').onclick = async () => {
  if (!confirm('Atjungti? Žymos liks telefone, bet nustos keliauti į kompiuterį.')) return;
  await S.irasytiSinch({ savininkas: '', repo: '', raktas: '', paskutine: '', bukle: '' });
  await piestiDerini();
  await piestiRysi();
  parodyti('n-bukle', 'Atjungta.', null);
};
