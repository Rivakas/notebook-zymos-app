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

// ---------------------------------------------------------------- įdiegimas

// Dalijimosi meniu programėlė patenka tik tada, kai Android ją įsidiegia kaip
// tikrą paketą (WebAPK). Vien piktograma-nuoroda ekrane to nepadaro, o Chrome
// meniu punktas skirtingose versijose vadinasi skirtingai ir guli skirtingose
// vietose. Todėl diegimą siūlom patys: naršyklė apie tokią galimybę praneša
// `beforeinstallprompt` įvykiu, o mes jį pasiliekam iki paspaudimo.
let diegimoPrasymas = null;

function arIdiegta() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // neleidžiam naršyklei rodyti savo juostelės
  diegimoPrasymas = e;
  piestiDiegima();
});

addEventListener('appinstalled', () => {
  diegimoPrasymas = null;
  piestiDiegima('Įdiegta. Dabar programėlė turi atsirasti ir dalijimosi meniu.');
});

function piestiDiegima(zinute) {
  const d = $('diegimas');
  const t = $('diegimo-tekstas');
  const m = $('diegti');

  if (zinute) {
    d.classList.remove('hidden');
    m.classList.add('hidden');
    t.textContent = zinute;
    return;
  }

  if (arIdiegta()) { d.classList.add('hidden'); return; }

  if (diegimoPrasymas) {
    d.classList.remove('hidden');
    m.classList.remove('hidden');
    t.textContent = 'Kad programėlė atsirastų dalijimosi meniu, ją reikia įdiegti:';
    return;
  }

  // Prašymo nėra. Priežastis dažniausiai viena iš trijų, ir naudotojui
  // svarbu žinoti, kuri — todėl parašom visas tris, o ne tylim.
  d.classList.remove('hidden');
  m.classList.add('hidden');
  t.innerHTML = 'Naršyklė įdiegti nesiūlo. Taip būna, kai: programėlė <b>jau ' +
                'įdiegta</b> (patikrink telefono programų sąraše); arba tai ' +
                '<b>ne Chrome</b> (Firefox to nepalaiko); arba puslapis dar ' +
                'nespėjo įsikrauti — perkrauk ir palauk.';
}

$('diegti').onclick = async () => {
  if (!diegimoPrasymas) return;
  const p = diegimoPrasymas;
  diegimoPrasymas = null;
  p.prompt();
  const { outcome } = await p.userChoice;
  if (outcome !== 'accepted') piestiDiegima('Įdiegimas atšauktas. Perkrovus puslapį pasiūlysiu vėl.');
};

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

  // `beforeinstallprompt` ateina ne iš karto po įkrovimo, tad sprendimą, ką
  // rodyti, atidedam — kitaip visada spėtume parašyti „nesiūlo“.
  setTimeout(() => piestiDiegima(), 2000);

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
    if (b.dataset.v === 'archyvas') piestiArchyva();
    if (b.dataset.v === 'nustatymai') { piestiDerini(); piestiZenkloBukle(); piestiZenkloJungikli(); }
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

  await piestiTurejima(p.nuoroda);

  await piestiSiulymus();
}

// Telefone nėra kur uždegti varnelės — naršyklė programėlei nesako, kokį
// puslapį žiūri. Todėl atsakymas „ar jau turiu?“ duodamas tą akimirką, kai
// nuoroda atkeliauja: aiškiai, spalvotai ir pakeičiant išsaugojimo mygtuką,
// kad antra kopija neatsirastų neapsižiūrėjus.
async function piestiTurejima(nuoroda) {
  const turim = await S.rastiPagalNuoroda(nuoroda);
  const j = $('jau-turim');
  const m = $('issaugoti');

  j.classList.toggle('hidden', !turim);
  j.classList.toggle('turim', !!turim);
  m.classList.toggle('pagrindinis', !turim);

  if (turim) {
    // Skiriam du atvejus: vienas jau NotebookLM pakete, kitas dar laukia
    // eksporto. Tas pats skirtumas kaip plėtinio varnelės paaiškinime.
    j.innerHTML = '';
    const antraste = document.createElement('div');
    antraste.className = 'turim-antraste';
    antraste.textContent = turim.baze ? '✓ Šitą jau turi — senojoje bazėje'
                                      : '✓ Šitą jau turi — išsaugota, laukia eksporto';
    const tema = document.createElement('div');
    tema.className = 'turim-tema';
    tema.textContent = turim.tema || '(be temos)';
    j.append(antraste, tema);
    m.textContent = 'Išsaugoti vis tiek';
  } else {
    m.textContent = 'Išsaugoti';
  }
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
  const irasai = await S.gautiIrasus();
  $('kiekis').textContent = irasai.length;
  await zenklasAntIkonos(irasai);
  await pranesimasSuSkaiciumi(irasai.filter(i => !i.eksportuota).length);
}

// Skaičius ant pačios programėlės ikonos — tas pats, ką plėtinys rodo ant savo
// ikonos naršyklėje: kiek žymų dar laukia eksporto. Jau iškeliavusios
// (`eksportuota`) neskaičiuojamos, kitaip skaičius niekada nenusiramintų.
//
// Ne visur veikia. Įdiegtoms darbalaukio programėlėms — taip; Android Chrome
// šito API neturi, ir ten telieka skaičius ant skirtuko „Sąrašas“. Todėl ir
// tikrinam, ar jis apskritai yra: neradę tyliai praeinam, o ne griūvam.
// Būklę įsimenam ir parodom nustatymuose. Be jos „skaičiaus nėra“ turi tris
// skirtingas priežastis — nepalaikoma, neįdiegta, arba nulis — ir iš ekrano
// jos neatskirsi.
let zenkloBukle = 'dar netikrinta';

async function zenklasAntIkonos(irasai) {
  const laukia = irasai.filter(i => !i.eksportuota).length;

  // Kaip programėlė paleista, sprendžia viską: iš naršyklės kortelės ženklas
  // neturi kur atsirasti — ikonos juk nėra.
  const kaip = arIdiegta() ? 'paleista kaip programėlė' : 'atverta naršyklės kortelėje';

  if (!('setAppBadge' in navigator)) {
    zenkloBukle = `Laukia: ${laukia}. Naršyklė ženklo nepalaiko, tad ikonoje jo nebus (${kaip}).`;
  } else {
    try {
      if (laukia) await navigator.setAppBadge(laukia);
      else await navigator.clearAppBadge();
      const s = await S.gautiSinch();
      zenkloBukle = laukia
        ? `Nustatyta: ${laukia} · ${kaip}` +
          (s.zenklas
            ? (Notification.permission === 'granted'
                ? ' · tylus pranešimas įjungtas.'
                : ' · pranešimų teisė neduota, tad ikonoje nesimatys.')
            : ' · Android ikonoje nesimatys, kol neįjungsi tylaus pranešimo (žemiau).')
        : `Nieko nelaukia, tad ženklo ir nėra (${kaip}).`;
    } catch (e) {
      zenkloBukle = `Nepavyko: ${e.message} (${kaip}).`;
    }
  }
  piestiZenkloBukle();
}

function piestiZenkloBukle() {
  const el = document.getElementById('zenklo-bukle');
  if (el) el.textContent = zenkloBukle;
}

// Android ženkliuką ant ikonos sieja su pranešimais: `setAppBadge` pavyksta,
// bet kol programėlė nė vieno pranešimo nepaskelbė, sistema neturi ko ženklinti.
// Telefono nustatymuose tai matyti eilute „ši programa dar nepaskelbė jokių…“.
//
// Todėl skaičiui ant ikonos laikom vieną tylų pranešimą. Jis be garso, be
// vibracijos ir visada tas pats (`tag`), tad ne kaupiasi, o keičiasi. Nulis
// laukiančių — pranešimo nebelieka.
//
// Įjungiama tik pačiam paspaudus: pranešimų teisė čia užsidirbama taip pat,
// kaip plėtinyje užsidirbamos neprivalomos teisės.
const ZENKLO_ZYME = 'laukia-eksporto';

async function pranesimasSuSkaiciumi(laukia) {
  const s = await S.gautiSinch();
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  // Išjungus ar nuliui — nuimam ir seną pranešimą, jei toks kabo.
  if (!s.zenklas || !laukia || Notification.permission !== 'granted') {
    for (const p of await reg.getNotifications({ tag: ZENKLO_ZYME })) p.close();
    return;
  }

  // `silent` sąmoningai NENURODYTAS. MIUI (ir dalis kitų paleidiklių) tyliems
  // pranešimams ženkliuko ant ikonos nerodo — o ženkliukas čia ir yra visas
  // tikslas. Patikrinta 2026-08-29: su `silent: true` pranešimas skydelyje
  // matėsi, o ikona liko tuščia.
  //
  // Erzinti tai neturėtų: žymė ta pati, o `renotify: false` reiškia, kad tą
  // patį pranešimą pakeitus naujas garsas nebeskamba. Suskamba tik pirmasis.
  await reg.showNotification('Notebook žymos', {
    body: `${laukia} ${laukia === 1 ? 'žyma laukia' : 'žymos laukia'} eksporto`,
    tag: ZENKLO_ZYME,
    renotify: false,
    icon: './ikonos/192.png',
    badge: './ikonos/192.png'
  });
}

$('n-zenklas').onchange = async e => {
  if (e.target.checked) {
    let leidimas = Notification.permission;
    if (leidimas === 'default') leidimas = await Notification.requestPermission();
    if (leidimas !== 'granted') {
      e.target.checked = false;
      zenkloBukle = 'Be pranešimų teisės Android ženkliuko ant ikonos nerodo.';
      piestiZenkloBukle();
      return;
    }
  }
  await S.irasytiSinch({ zenklas: e.target.checked });
  await piestiKieki();
};

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

// ------------------------------------------------------------------ archyvas

// Senoji bazė: 9490 įrašų, tik skaitomų. Sinchronizacijos ji neliečia —
// nesikeičia, tad ir siųsti pirmyn atgal nėra ko.
let archyvas = null;

async function piestiArchyva() {
  if (!archyvas) archyvas = await S.gautiArchyva();
  const b = $('archyvo-bukle');
  const s = $('archyvo-sarasas');

  if (!archyvas) {
    b.className = 'bukle';
    b.textContent = '';
    s.innerHTML = '<div class="tuscias"><p><b>Archyvo nėra.</b></p>' +
                  '<p>Parsisiųsk jį skiltyje „Nustatymai“ — po to galėsi naršyti ' +
                  'visą senąją bazę ir be interneto.</p></div>';
    return;
  }

  const q = $('archyvo-paieska').value.trim().toLowerCase();
  const dalys = q.split(/\s+/).filter(Boolean);

  // Be užklausos rodom tik pradžią: devynių tūkstančių eilučių piešimas
  // telefone užtruktų sekundes, o prasmės neturi.
  let rasta = 0;
  const rodomi = [];
  for (const e of archyvas.irasai) {
    if (dalys.length) {
      const t = (e[1] + ' ' + e[2] + ' ' + (archyvas.temos[e[0]] || '')).toLowerCase();
      if (!dalys.every(d => t.includes(d))) continue;
    }
    rasta++;
    if (rodomi.length < 200) rodomi.push(e);
  }

  b.className = 'bukle';
  b.textContent = dalys.length
    ? `Rasta ${rasta}${rasta > rodomi.length ? `, rodomi pirmi ${rodomi.length}` : ''}.`
    : `Archyve ${archyvas.irasai.length} įrašų. Rodomi pirmi ${rodomi.length} — ieškok.`;

  s.innerHTML = '';
  if (!rodomi.length) {
    s.innerHTML = '<div class="tuscias">Nieko nerasta.</div>';
    return;
  }

  const gabalas = document.createDocumentFragment();
  for (const [nr, pavadinimas, nuoroda, data] of rodomi) {
    const d = document.createElement('div');
    d.className = 'irasas';

    const a = document.createElement('a');
    a.className = 'pav';
    a.href = nuoroda;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = pavadinimas || nuoroda;
    d.append(a);

    const t = document.createElement('div');
    t.className = 'tema';
    t.textContent = archyvas.temos[nr] || '';
    d.append(t);

    const meta = document.createElement('div');
    meta.className = 'nuor';
    meta.textContent = [domenas(nuoroda), data].filter(Boolean).join(' · ');
    d.append(meta);

    gabalas.append(d);
  }
  s.append(gabalas);
}

// Paieška atidedama: kiekvienas paspaustas klavišas perbėga 9490 įrašų, o
// telefone tai jaustųsi kaip užstrigusi klaviatūra.
let archyvoLaikmatis = null;
$('archyvo-paieska').oninput = () => {
  clearTimeout(archyvoLaikmatis);
  archyvoLaikmatis = setTimeout(piestiArchyva, 200);
};

// ----------------------------------------------------------- sinchronizacija

const ADAPTERIS = {
  gautiIrasus: S.gautiIrasus,
  irasytiIrasus: S.irasytiIrasus,
  gautiAntkapius: S.gautiAntkapius,
  irasytiAntkapius: S.irasytiAntkapius,
  valytiAntkapius: S.valytiAntkapius
};

let sinchVyksta = false;

// Kol programėlė matoma, retkarčiais pasitikrinam patys — kad kompiuteryje
// išsaugota žyma atsirastų be jokio paspaudimo. Nematomoje kortelėje to
// nedarom: telefonas ten nieko nerodo, o duomenys ir baterija eikvojami.
//
// Uždarytos programėlės pažadinti neįmanoma. Tai ne nustatymas, o žiniatinklio
// programėlių riba: kol jos nėra atverta, jokio kodo nėra kam vykdyti. Todėl
// atvėrimas ir lieka anksčiausias momentas, kada telefonas gali sužinoti naujo.
const MATOMOS_MS = 60 * 1000;
let matomosLaikmatis = null;

function paleistiPeriodini() {
  if (matomosLaikmatis) clearInterval(matomosLaikmatis);
  matomosLaikmatis = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (await S.arPrijungta()) sinchronizuoti(true);
  }, MATOMOS_MS);
}

// Grįžus į programėlę iš kito lango puslapis iš naujo nekraunamas, tad
// pradinis patikrinimas nepasikartotų — o kaip tik tada naujo dažniausiai ir
// esama.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (await S.arPrijungta()) sinchronizuoti(true);
});

paleistiPeriodini();

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

  if (!archyvas) archyvas = await S.gautiArchyva();
  const dalys = [
    indeksas ? `indeksas: ${indeksas.temos.length} temų` : 'indekso nėra — temos nebus siūlomos',
    archyvas ? `archyvas: ${archyvas.irasai.length} įrašų` : 'archyvo nėra',
    s.indeksoData ? 'parsisiųsta ' + new Date(s.indeksoData).toLocaleDateString('lt-LT') : ''
  ].filter(Boolean);
  $('indekso-bukle').textContent = dalys.join(', ') + '.';
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
  try {
    parodyti('indekso-bukle', 'Siunčiamas indeksas… (apie 1 MB)', null);
    const g = await skaityti(cfg, 'indeksas.json');
    if (!g) {
      parodyti('indekso-bukle', 'Repo indekso nėra — įkelk jį iš kompiuterio ' +
               '(Nustatymai → Sinchronizacija → Nusiųsti indeksą ir archyvą).', false);
      return;
    }
    const ix = JSON.parse(g.tekstas);
    await S.irasytiIndeksa(ix);
    indeksas = ix;

    // Archyvas neprivalomas: be jo veikia viskas, tik nebus ko naršyti.
    // Todėl jo nebuvimas — ne klaida, o pastaba.
    let apieArchyva = ', archyvo repo nėra';
    parodyti('indekso-bukle', 'Siunčiamas archyvas… (apie 1 MB)', null);
    const ga = await skaityti(cfg, 'archyvas.json');
    if (ga) {
      const a = JSON.parse(ga.tekstas);
      await S.irasytiArchyva(a);
      S.pamirstiArchyvoKesa();
      archyvas = a;
      apieArchyva = `, archyve ${a.irasai.length} įrašų`;
    }

    await S.irasytiSinch({ indeksoData: new Date().toISOString() });
    parodyti('indekso-bukle', `Parsisiųsta: ${ix.temos.length} temų${apieArchyva}.`, true);
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

async function piestiZenkloJungikli() {
  const s = await S.gautiSinch();
  $('n-zenklas').checked = !!s.zenklas;
}
