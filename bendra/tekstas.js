// Teksto apdorojimas: skaidymas žodžiais, kamienavimas, nuorodų normalizavimas.
//
// SVARBU: tos pačios funkcijos naudojamos ir kuriant indeksą (iš CSV), ir
// vertinant naują puslapį. Keisdamas kamienavimą, indeksą būtina perkurti —
// kitaip užklausos žodžiai nesutaps su indekso žodžiais.

export const RODYKLE = '\u203A';   // ›

// ---------------------------------------------------------------- žodynai

// Stabdos žodžiai: per dažni, kad ką nors reikštų. RU + EN + LT.
const STOP = new Set(`
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы
по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг
ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя
ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без
будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой
совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех
никогда можно при наконец два об другой хоть после над больше тот через эти нас
про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда
лучше чуть том нельзя такой им более всегда конечно всю между это как-то

the be to of and a in that have i it for not on with he as you do at this but his
by from they we say her she or an will my one all would there their what so up out
if about who get which go me when make can like time no just him know take people
into year your good some could them see other than then now look only come its over
think also back after use two how our work first well way even new want because any
these give day most us is are was were has had does did doing being been very s t
don should very such more much own same too here own off why while both each few own

ir yra kaip bet arba tai kad su be nuo iki per prie apie tik dar jau labai jei
tada nes taip toks tokia kuris kuri kurie kurios visi visos kiekvienas savo mano
tavo jo jos mes jus jie jos as tu buvo bus gali galima reikia turi nera daug
mazai geriau geras gera naujas nauja pirmas antras kita kitas kitos siame sioje
tas ta tie tos jog o na gi ne
`.trim().split(/\s+/));

// Žodžiai, kurie techniškai dažni, bet temos neišduoda.
const TRIUKSMAS = new Set(`
video youtube watch shorts channel canal смотреть смотри видео канал подписка
обзор часть серия выпуск full hd 4k official trailer live stream streaming
part episode tutorial guide review best top new free download online com www
http https html php aspx index page item view id
`.trim().split(/\s+/));

// ---------------------------------------------------------- normalizavimas

// Mažosios raidės + lietuviškų ir rusiškų raidžių palikimas.
export function maziosios(s) {
  return (s || '').toLowerCase();
}

// Paprastas kamienavimas. Ne kalbotyra — tik tiek, kad „банков“, „банка“ ir
// „банки“ suplauktų į vieną raktą, o „indikatorius“ sutaptų su „indikatoriaus“.
// Galūnė nuimama tik jei liks bent 4 raidės.
const GALUNES = [
  // ilgesnės pirmiau
  'иями','ями','ами','ов','ев','ах','ях','ий','ый','ой','ая','ое','ые','ие',
  'ам','ям','ом','ем','их','ых','ую','юю','ей','ов','ть','ся','ся',
  'omis','emis','\u0117mis','iais','ams','oms','\u0117ms','ais','ius','ios',
  '\u0173','us','as','is','ys','os','\u0117s','ai','ei','ui','ie',
  'ings','ing','edly','ers','er','ed','es','ly','s',
  'и','ы','а','я','о','е','у','ю','ь','\u0105','\u012f','\u0119','\u0117'
];

export function kamienas(w) {
  if (w.length <= 4) return w;
  for (const g of GALUNES) {
    if (w.length - g.length >= 4 && w.endsWith(g)) return w.slice(0, w.length - g.length);
  }
  return w;
}

// Tekstas -> unikalių kamienų sąrašas.
export function zodziai(s) {
  if (!s) return [];
  const raw = maziosios(s).match(/[\u0400-\u04FF]+|[a-z\u0105\u010D\u0119\u0117\u012F\u0161\u0173\u016B\u017E0-9]+/g) || [];
  const out = [];
  const seen = new Set();
  for (const w of raw) {
    if (w.length < 3 || w.length > 24) continue;
    if (/^\d+$/.test(w)) continue;
    if (STOP.has(w) || TRIUKSMAS.has(w)) continue;
    const k = kamienas(w);
    if (k.length < 3 || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// Iš nuorodos ištraukiami prasmingi kelio žodžiai (be domeno).
export function nuorodosZodziai(url) {
  try {
    const u = new URL(url);
    const tekstas = decodeURIComponent(u.pathname + ' ' + u.search)
      .replace(/[-_+/=&?.]+/g, ' ');
    return zodziai(tekstas).slice(0, 15);
  } catch { return []; }
}

export function domenas(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

// Nuorodos normalizavimas dublikatų paieškai.
// Ta pati logika kaip _raindrop/rd-lib.ps1 Get-CanonLink.
export function kanonine(url) {
  if (!url) return '';
  let c = url.toLowerCase();
  if (/youtu\.?be/.test(c)) {
    let m = c.match(/[?&]v=([\w-]{6,})/) || c.match(/youtu\.be\/([\w-]{6,})/) || c.match(/\/shorts\/([\w-]{6,})/);
    if (m) return 'yt:' + m[1];
  }
  c = c.replace(/[?&](utm_[^&]*|fbclid|gclid|si|feature|ab_channel)=[^&]*/g, '');
  c = c.replace(/\/+$/, '');
  c = c.replace(/^https?:\/\/(www\.|m\.)?/, '');
  return c;
}

// Kalbos spėjimas — tas pats principas kaip 4-notebooklm.ps1.
export function kalba(t) {
  if (!t) return 'EN';
  const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length;
  if (cyr > t.length / 8) return 'RU';
  if (/[\u0105\u010D\u0119\u0117\u012F\u0161\u0173\u016B\u017E]/.test(t)) return 'LT';
  if (/\b(kaip|yra|nuo|apie|kad|labai|galima|reikia)\b/i.test(t)) return 'LT';
  if (/[\u00BF\u00F1]/.test(t)) return 'ES';
  if (/[\u00E4\u00F6\u00FC\u00DF]/.test(t) && /\b(und|der|die|das|mit|ist|nicht)\b/i.test(t)) return 'DE';
  return 'EN';
}

// -------------------------------------------------------------- temos kelias

// Kelias iš bet kurio pavidalo (CSV „A › B“ arba kolekcijos.json „A / B“)
// paverčiamas vienodu segmentų sąrašu: nuimama bendra šaknis „BOOKMARKS:“,
// nuimami dvitaškiai gale, pašalinami tušti segmentai.
export function keliasISegmentu(kelias) {
  if (!kelias) return [];
  return String(kelias)
    .split(/\s*(?:\u203A|\/|>)\s*/)
    .map(s => s.replace(/\s*:\s*$/, '').trim())
    .filter(s => s !== '' && s.toUpperCase() !== 'BOOKMARKS');
}

export function segmentaiIKelia(segs) {
  return segs.join(' ' + RODYKLE + ' ');
}

export function normKelias(kelias) {
  return segmentaiIKelia(keliasISegmentu(kelias));
}

// Raktas temų sulyginimui. Griežtesnis už normKelias: nepaiso raidžių dydžio,
// brūkšnelių ir tarpų. To reikia todėl, kad tas pats katalogas skirtinguose
// failuose užrašytas skirtingai — `kolekcijos.json` turi
// „TREIDINGAS & INVESTAVIMAS", o senesnis CSV — „TREIDINGAS-&-INVESTAVIMAS".
// Be šito ta pati tema indekse atsidurtų du kartus, o įrašai pasidalintų
// pusiau ir siūlymas nusilptų.
export function keliasIRakta(kelias) {
  return keliasISegmentu(kelias)
    .map(s => s.toLowerCase()
               .replace(/[\s_-]+/g, ' ')
               .replace(/\s*&\s*/g, '&')
               .trim())
    .join('/');
}
