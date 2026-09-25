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
