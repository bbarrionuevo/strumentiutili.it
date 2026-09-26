// tests/navigazione.test.js — Come ci si muove nel sito: mappa del sito,
// pagina 404, ricerca in testata, blocco «Strumenti collegati».
//
// Sono le cose che guarda chi valuta un sito (anche il revisore di AdSense):
// ogni pagina deve essere raggiungibile da una pagina per persone, un
// indirizzo sbagliato non deve finire su una pagina vuota di Vercel, e la
// ricerca deve funzionare anche premendo Invio o senza JavaScript.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const L = require('../scripts/build-layout.js');
const M = require('../scripts/genera-mappa.js');
const { tutteLePagine, pagineIndicizzabili } = require('./helpers/contenuti.js');

const indicizzabile = (html) => !/<meta[^>]+name="robots"[^>]+noindex/i.test(html);

const leggi = (rel) => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const MAPPA = leggi('mappa-del-sito/index.html');
const INDICE = JSON.parse(leggi('data/strumenti.json')).strumenti;

// Il file servito per un percorso del sito ("/pdf/" -> pdf/index.html).
function fileDi(percorso) {
  const p = percorso.split(/[?#]/)[0].replace(/^\//, '');
  if (!p || p.endsWith('/')) return path.join(RADICE, p, 'index.html');
  return path.join(RADICE, p);
}

test('la mappa del sito e aggiornata', () => {
  assert.strictEqual(M.aggiorna(MAPPA), MAPPA,
    'mappa non aggiornata. Esegui: node scripts/genera-mappa.js');
});

test('la mappa elenca ogni strumento dell\'indice della ricerca', () => {
  const mancanti = INDICE
    .filter((v) => !v.variante && !v.percorso.includes('?'))
    .filter((v) => !MAPPA.includes('href="' + v.percorso + '"'))
    .map((v) => v.percorso);
  assert.deepStrictEqual(mancanti, []);
});

test('ogni collegamento della mappa porta a una pagina che esiste', () => {
  const regione = MAPPA.slice(MAPPA.indexOf('<!-- su:mappa -->'), MAPPA.indexOf('<!-- /su:mappa -->'));
  const rotti = [...regione.matchAll(/href="(\/[^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => !fs.existsSync(fileDi(h)) && !fs.existsSync(fileDi(h.replace(/\/$/, '') + '.html')));
  assert.deepStrictEqual(rotti, []);
});

test('la mappa e indicizzabile, nel sitemap e filtrabile', () => {
  assert.ok(indicizzabile(MAPPA));
  assert.match(MAPPA, /<link rel="canonical" href="https:\/\/strumentiutili\.it\/mappa-del-sito\/"/);
  assert.match(leggi('sitemap.xml'), /<loc>https:\/\/strumentiutili\.it\/mappa-del-sito\/<\/loc>/);
  assert.match(MAPPA, /<input id="mappa-cerca" name="q"/);
  assert.match(MAPPA, /<script defer src="\/js\/mappa\.js"><\/script>/);
  assert.ok((MAPPA.match(/data-mappa="/g) || []).length >= 90);
});

test('la pagina 404 aiuta a ritrovare la strada e non si indicizza', () => {
  const html = leggi('404.html');
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.doesNotMatch(html, /rel="canonical"/, 'una 404 non ha un indirizzo canonico');
  assert.match(html, /<h1[^>]*>Questa pagina non c’è<\/h1>/);
  assert.match(html, /<form action="\/mappa-del-sito\/" method="get" role="search"/);
  for (const c of L.CATEGORIE) assert.ok(html.includes('href="/' + c.slug + '/"'), 'manca la categoria ' + c.slug);
  assert.ok(html.includes('href="/mappa-del-sito/"'));
  assert.doesNotMatch(html, /class="su-ad/, 'niente annunci su una pagina di errore');
  assert.doesNotMatch(leggi('sitemap.xml'), /404/);
});

test('il piede porta alla mappa del sito', () => {
  assert.match(L.piede(null), /href="\/mappa-del-sito\/"[^>]*>Mappa del sito</);
});

test('la ricerca in testata funziona anche senza JavaScript', () => {
  const testa = L.intestazione({});
  assert.match(testa, /<form action="\/mappa-del-sito\/" method="get" role="search"/);
  assert.match(testa, /<input[^>]*id="search"[^>]*name="q"|<input[^>]*name="q"[^>]*id="search"/);
});

test('Invio nella ricerca apre un risultato', () => {
  const js = leggi('js/layout.js');
  const gestore = js.slice(js.indexOf("campo.addEventListener('keydown'"));
  assert.match(gestore, /e\.key === 'Enter'/);
  assert.match(gestore, /e\.preventDefault\(\)/, 'senza preventDefault il form andrebbe alla mappa anche con un risultato');
  assert.match(gestore, /trovati\[0\]\.percorso/, 'senza voce evidenziata si apre il primo risultato');
  assert.match(gestore, /e\.isComposing/, 'Invio che conferma un carattere IME non deve cercare');
});

test('le voci della barra delle categorie non vanno a capo', () => {
  const testa = L.intestazione({});
  // la barra da computer (il menu da telefono e' in colonna e puo' andare a capo)
  const barra = testa.slice(testa.indexOf('<nav class="hidden lg:flex'), testa.indexOf('</nav>'));
  const voci = [...barra.matchAll(/<a href="\/([a-z-]+)\/"[^>]*class="([^"]*)"/g)]
    .filter((m) => L.CATEGORIE.some((c) => c.slug === m[1]));
  assert.ok(voci.length >= L.CATEGORIE.length);
  for (const v of voci) assert.match(v[2], /\bwhitespace-nowrap\b/, v[1]);
});

test('un solo blocco «Strumenti collegati», con lo stesso titolo', () => {
  const diversi = [];
  for (const p of tutteLePagine()) {
    if (/Strumenti Correlati/i.test(p.html)) diversi.push(p.percorso + ': «Strumenti correlati»');
    const titoli = [...p.html.matchAll(/<(h[1-6])[^>]*>\s*Strumenti collegati\s*<\/\1>/g)];
    if (titoli.length > 1) diversi.push(p.percorso + ': ' + titoli.length + ' blocchi');
    for (const t of titoli) if (t[1] !== 'h2') diversi.push(p.percorso + ': <' + t[1] + '>');
  }
  assert.deepStrictEqual(diversi, []);
});

test('i dati strutturati puntano agli indirizzi puliti', () => {
  const vecchi = [];
  for (const p of tutteLePagine()) {
    for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const trovati = m[1].match(/https:\/\/strumentiutili\.it\/[^"]*\.html\b/g);
      if (trovati) vecchi.push(p.percorso + ': ' + trovati.join(', '));
    }
  }
  assert.deepStrictEqual(vecchi, []);
});

test('niente parole inglesi rimaste nei pulsanti', () => {
  const inglesi = [];
  for (const p of pagineIndicizzabili()) {
    for (const m of p.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      const testo = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^(Reset|Download\b|Submit|Clear|Upload\b)/i.test(testo)) inglesi.push(p.percorso + ': ' + testo);
    }
    if (/Zero Upload/.test(p.html)) inglesi.push(p.percorso + ': Zero Upload');
  }
  assert.deepStrictEqual(inglesi, []);
});

// I commenti nel codice sono in italiano, come il sito: prima una parte dei
// file pubblici aveva ancora i commenti in spagnolo della prima stesura.
test('i commenti del codice pubblico sono in italiano', () => {
  const SPAGNOLO = /[ñáíóúÁÍÓÚÑ¿¡]|\b(los|las|el|para|que|hacemos|usamos|enviamos|matamos|instanciamos|archivo|nuevo|nueva|también|aquí|cuando|pero|está|están|esto|este)\b/;
  const trovati = [];
  function commenti(codice) {
    const fuori = [];
    codice.split('\n').forEach((r, i) => {
      const m = r.match(/(?:^|[^:'"\\])\/\/(.*)$/) || r.match(/\/\*(.*?)(\*\/|$)/) || r.match(/^\s*\*\s(.*)$/);
      if (m) fuori.push([i + 1, m[1]]);
    });
    return fuori;
  }
  const js = [];
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, v.name);
      if (v.isDirectory()) giro(p);
      else if (v.name.endsWith('.js')) js.push(p);
    }
  })(path.join(RADICE, 'js'));
  js.push(path.join(RADICE, 'sw.js'));
  for (const f of js) {
    for (const [n, c] of commenti(fs.readFileSync(f, 'utf8'))) {
      if (SPAGNOLO.test(c)) trovati.push(path.relative(RADICE, f) + ':' + n + ' ' + c.trim());
    }
  }
  for (const p of tutteLePagine()) {
    const codice = [...p.html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    for (const [, c] of commenti(codice)) {
      if (SPAGNOLO.test(c)) trovati.push(p.percorso + ' ' + c.trim());
    }
  }
  assert.deepStrictEqual(trovati, []);
});
