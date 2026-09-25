// tests/flashcard-pagina.test.js — La pagina delle flashcard: elementi,
// script, librerie dal sito stesso, niente annunci nel ripasso e nel quiz,
// dati solo nel browser e registrazione nel sito.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');
const HTML = leggi('utilita-web', 'flashcard', 'index.html');
const UI = leggi('js', 'flashcard-ui.js');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size >= 40, 'trovati ' + usati.size);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  for (let v = 1; v <= 4; v++) {
    assert.ok(HTML.includes('id="fc-voto-' + v + '"'), 'voto ' + v);
    assert.ok(HTML.includes('id="fc-tempo-' + v + '"'), 'tempo ' + v);
  }
  for (const id of ['fc-studio', 'fc-quiz', 'fc-avviso', 'fc-retro-box', 'fc-voti', 'fc-fine']) {
    assert.ok(new RegExp('id="' + id + '"[^>]*hidden').test(HTML), id + ' nascosto all avvio');
  }
});

test('script in ordine; le librerie arrivano da vendor/ solo quando servono', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const ui = ordine.indexOf('flashcard-ui.js');
  assert.ok(ordine.indexOf('giornaliero.js') >= 0 && ordine.indexOf('giornaliero.js') < ui);
  assert.ok(ordine.indexOf('flashcard.js') >= 0 && ordine.indexOf('flashcard.js') < ui);
  assert.ok(!/ts-fsrs|sql-wasm|fflate|fzstd/.test(HTML.replace(/<a [^>]*>[^<]*<\/a>/g, '')), 'nessuna libreria caricata dalla pagina');
  for (const m of UI.matchAll(/'(\/vendor\/[^']+)'/g)) {
    const p = m[1];
    assert.ok(fs.existsSync(path.join(RADICE, p)), p);
  }
  assert.ok(fs.existsSync(path.join(RADICE, 'vendor', 'sqljs@1.14.2', 'sql-wasm.wasm')));
});

test('nessun annuncio dentro lo strumento', () => {
  const inizio = HTML.indexOf('<div id="fc-app"');
  const fine = HTML.indexOf('su-ad--contenuto');
  assert.ok(inizio > 0 && fine > inizio);
  const app = HTML.slice(inizio, fine);
  for (const id of ['fc-studio', 'fc-quiz', 'fc-mazzi', 'fc-file']) assert.ok(app.includes('id="' + id + '"'), id);
  assert.ok(!/adsbygoogle/.test(app));
});

test('le carte non escono dal browser ed entrano solo come testo', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(UI));
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(UI));
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML/.test(leggi('js', 'flashcard.js')));
  const chiavi = [...UI.matchAll(/CHIAVE = '([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(chiavi, ['su_flashcard']);
  assert.ok(UI.includes("DB_NOME = 'strumentiutili-flashcard'"));
  // "Cancella i dati salvati" elimina anche il database delle flashcard,
  // e la pagina chiude la connessione per non bloccarlo.
  assert.ok(/'strumentiutili-flashcard'/.test(leggi('js', 'layout.js')));
  assert.ok(/onversionchange/.test(UI));
});

test('il mazzo di esempio ha domande complete e risposte sbagliate diverse dalla giusta', () => {
  const blocco = UI.slice(UI.indexOf('var ESEMPIO = ['), UI.indexOf('];', UI.indexOf('var ESEMPIO = [')));
  const righe = [...blocco.matchAll(/\[('(?:[^'\\]|\\.)*'(?:, '(?:[^'\\]|\\.)*')*)\]/g)].map((m) => [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]));
  assert.strictEqual(righe.length, 16);
  assert.ok(HTML.includes('16 domande sulla Costituzione'));
  for (const r of righe) {
    assert.ok(r.length >= 4, r[0]);
    assert.ok(!r.slice(2).includes(r[1]), r[0]);
    assert.strictEqual(new Set(r.slice(1)).size, r.length - 1, r[0]);
  }
});

test('registrata: precache, indice, sitemap, categoria, home, privacy e stile', () => {
  const sw = leggi('sw.js');
  for (const u of ['/utilita-web/flashcard/', '/js/flashcard.js', '/js/flashcard-ui.js', '/vendor/ts-fsrs@5.4.2/ts-fsrs.umd.js']) {
    assert.ok(sw.includes("'" + u + "'"), u);
  }
  assert.ok(!sw.includes('sql-wasm.wasm'), 'il lettore di Anki non si precarica');
  assert.ok(leggi('data', 'strumenti.json').includes('/utilita-web/flashcard/'));
  assert.ok(leggi('sitemap.xml').includes('/utilita-web/flashcard/'));
  assert.ok(leggi('utilita-web', 'index.html').includes('href="/utilita-web/flashcard/"'));
  assert.ok(leggi('index.html').includes('href="/utilita-web/flashcard/"'));
  assert.ok(/strumentiutili-flashcard/.test(leggi('politica-sulla-privacy.html')));
  assert.ok(leggi('src', 'input.css').includes('@source "../js/flashcard-ui.js"'));
  // crediti delle librerie
  for (const s of ['ts-fsrs', 'sql.js', 'fflate', 'fzstd', 'licenza MIT']) assert.ok(HTML.includes(s), s);
});
