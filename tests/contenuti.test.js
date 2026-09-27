// tests/contenuti.test.js — La qualita' dei testi che legge chi visita il sito.
//
// Le pagine piu' vecchie avevano in fondo lunghi "trattati" scritti per i
// motori di ricerca: gergo tecnico (Zero-Backend, albero DOM, Garbage
// Collection), sigle come YMYL ed E-E-A-T, una firma anonima di "ingegneri
// software indipendenti", commenti in spagnolo nel codice. A chi legge non
// servono, e per la revisione di Google AdSense sembrano testo generato. Qui
// si controlla che non tornino.
const test = require('node:test');
const assert = require('node:assert');
const C = require('./helpers/contenuti.js');

const PAGINE = C.pagineIndicizzabili();

test('niente gergo da trattato nelle pagine', () => {
  const sbagliate = PAGINE
    .map((p) => [p.percorso, (C.testoVisibile(p.html).match(C.LESSICO) || C.testoVisibile(p.html).match(/Zero-Upload|Zero-Leak|Client-Side|client-side/) || [])[0]])
    .filter((x) => x[1]);
  assert.deepStrictEqual(sbagliate, []);
});

test('titoli e descrizioni senza gergo tecnico', () => {
  const GERGO = /Zero-Backend|Zero-Upload|Zero-Leak|Client-Side|client-side|E-E-A-T|YMYL|Trattato/;
  const sbagliate = [];
  for (const p of C.tutteLePagine()) {
    for (const m of p.html.matchAll(/<title>([\s\S]*?)<\/title>|<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)" content="([^"]*)"/g)) {
      const t = m[1] || m[2];
      if (GERGO.test(t)) sbagliate.push(p.percorso + ': ' + t.slice(0, 80));
    }
  }
  assert.deepStrictEqual(sbagliate, []);
});

test('niente commenti in spagnolo o sul SEO nel codice delle pagine', () => {
  const trovati = [];
  for (const p of C.tutteLePagine()) {
    for (const m of p.html.matchAll(/<!--([\s\S]*?)-->/g)) {
      const t = m[1].trim();
      if (!/^\/?su:|^SILO/.test(t) && C.COMMENTO_VECCHIO.test(t)) trovati.push(p.percorso + ': ' + t.slice(0, 60));
    }
  }
  assert.deepStrictEqual(trovati, []);
});

test('ogni domanda dei dati strutturati FAQPage si legge nella pagina', () => {
  const mancanti = [];
  for (const p of PAGINE) {
    const testo = C.normalizza(C.testoVisibile(p.html));
    for (const d of C.domandeFaq(p.html)) if (!testo.includes(C.normalizza(d))) mancanti.push(p.percorso + ': ' + d);
  }
  assert.deepStrictEqual(mancanti, []);
});

test('ogni pagina ha titolo, descrizione e anteprima per la condivisione', () => {
  const mancano = [];
  for (const p of PAGINE) {
    for (const t of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'og:locale', 'twitter:card']) {
      if (!new RegExp('(property|name)="' + t + '" content="[^"]+"').test(p.html)) mancano.push(p.percorso + ': ' + t);
    }
    const canon = /<link rel="canonical" href="([^"]+)"/.exec(p.html);
    const og = /property="og:url" content="([^"]+)"/.exec(p.html);
    if (canon && og && canon[1] !== og[1]) mancano.push(p.percorso + ': og:url diverso dal canonical');
    if (canon && /\.html$/.test(canon[1])) mancano.push(p.percorso + ': canonical verso un indirizzo che fa redirect');
  }
  assert.deepStrictEqual(mancano, []);
});

test('in home il bollino Nuovo resta solo sulle ultime novita', () => {
  const home = PAGINE.find((p) => p.percorso === 'index.html');
  const n = (C.testoVisibile(home.html).match(/Nuovo\b/g) || []).length;
  assert.ok(n > 0 && n <= 6, n + ' bollini');
});

// --- pagine con abbastanza testo proprio --------------------------------------
//
// Il testo che conta e' quello della pagina, non della testata, del piede o
// delle briciole, uguali ovunque. Sotto le 600 parole una pagina di strumento o
// di categoria non spiega abbastanza per chi arriva da un motore di ricerca.

const L = require('../scripts/build-layout.js');
const fs = require('node:fs');

function paroleProprie(html) {
  const via = (h, a, b) => { const i = h.indexOf(a), j = h.indexOf(b); return i < 0 || j < 0 ? h : h.slice(0, i) + h.slice(j + b.length); };
  let b = html.slice(html.indexOf('<body'));
  for (const k of ['testata', 'piede', 'briciole', 'salta']) b = via(b, '<!-- su:' + k + ' -->', '<!-- /su:' + k + ' -->');
  b = b.replace(/<nav aria-label="Strumenti collegati"[\s\S]*?<\/nav>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  return C.testoVisibile(b).split(/\s+/).filter(Boolean).length;
}

const ATTIVE = L.pagineAttive().map((p) => {
  const html = fs.readFileSync(p.assoluto, 'utf8');
  return { rel: p.rel, html, ctx: L.contestoPagina(p.rel, html) };
}).filter((p) => !/<meta name="robots" content="[^"]*noindex/.test(p.html));

test('strumenti, categorie e sezioni hanno almeno 600 parole proprie', () => {
  const corte = ATTIVE
    .filter((p) => ['strumento', 'categoria', 'sezione'].includes(p.ctx.tipo))
    .map((p) => [p.rel, paroleProprie(p.html)])
    .filter((x) => x[1] < 600);
  assert.deepStrictEqual(corte, []);
});

test('le categorie spiegano quale strumento usare e rispondono alle domande', () => {
  const problemi = [];
  for (const c of L.CATEGORIE) {
    const html = fs.readFileSync(require('node:path').join(C.RADICE, c.slug, 'index.html'), 'utf8');
    if (!html.includes('<section id="guida-categoria"')) problemi.push(c.slug + ': manca «Quale strumento ti serve»');
    if ((html.match(/<details\b/g) || []).length < 4) problemi.push(c.slug + ': meno di 4 domande');
    if (!/"@type": "CollectionPage"/.test(html)) problemi.push(c.slug + ': manca CollectionPage');
    // una categoria e' un elenco, non un'applicazione in vendita
    if (/"@type": "(Offer|WebApplication|BusinessApplication|UtilitiesApplication)"/.test(html)) problemi.push(c.slug + ': dati strutturati da applicazione');
  }
  assert.deepStrictEqual(problemi, []);
});

test('le schede degli strumenti in home e nelle categorie sono scritte senza gergo', () => {
  const GERGO = /\b(Reader|Redact|Planner)\b|Aggregazione DatiRiepilogo|sigillato|TAEG\/ISC|pro rata|Computer Vision|WebCrypto|impenetrabil|Privacy assoluta|Client-Side|client-side|\bNMT\b|Algoritmo di Gauss|T\.U\.R\./;
  const trovate = [];
  for (const rel of ['index.html'].concat(L.CATEGORIE.map((c) => c.slug + '/index.html'))) {
    const html = fs.readFileSync(require('node:path').join(C.RADICE, rel), 'utf8');
    for (const m of html.matchAll(/<article\b[\s\S]*?<\/article>/g)) {
      const t = C.testoVisibile(m[0]);
      const g = t.match(GERGO);
      if (g) trovate.push(rel + ': ' + g[0]);
    }
  }
  assert.deepStrictEqual(trovate, []);
});
