// tests/calendario-pagina.test.js — La pagina del calendario da stampare:
// le parti legate all'anno sono rigenerate, gli script ci sono e nell'ordine
// giusto, il cambio d'anno funziona con un comando.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const G = require('../scripts/genera-calendario.js');
const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(G.PAGINA, 'utf8');

test('la pagina e rigenerata: node scripts/genera-calendario.js non cambia nulla', () => {
  const anno = G.annoDellaPagina(HTML);
  assert.strictEqual(G.rigenera(HTML, anno), HTML, 'esegui node scripts/genera-calendario.js');
});

test('l anno della pagina e nel titolo, nell h1 e nelle tabelle', () => {
  const anno = G.annoDellaPagina(HTML);
  assert.ok(HTML.includes('<title>Calendario ' + anno + ' da stampare'));
  assert.ok(new RegExp('<h1[^>]*>Calendario ' + anno + ' da stampare</h1>').test(HTML));
  assert.ok(HTML.includes('>Gennaio ' + anno + '</caption>'));
  assert.ok(HTML.includes('>Dicembre ' + anno + '</caption>'));
  // domande frequenti uguali nel JSON-LD e nella pagina
  for (const f of G.domande(anno)) {
    assert.ok(HTML.includes(JSON.stringify(f.d)), 'JSON-LD: ' + f.d);
  }
  const ld = HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map((s) => JSON.parse(s.replace(/<\/?script[^>]*>/g, '')));
  assert.ok(ld.some((x) => x['@graph'] && x['@graph'].some((n) => n['@type'] === 'FAQPage')));
});

test('passare all anno dopo e un comando, e si torna indietro identici', () => {
  const anno = G.annoDellaPagina(HTML);
  const dopo = G.rigenera(HTML, anno + 1);
  assert.strictEqual(G.annoDellaPagina(dopo), anno + 1);
  assert.ok(dopo.includes('<title>Calendario ' + (anno + 1) + ' da stampare'));
  assert.ok(!dopo.includes('>Gennaio ' + anno + '</caption>'));
  assert.strictEqual(G.rigenera(dopo, anno + 1), dopo, 'idempotente');
  assert.strictEqual(G.rigenera(dopo, anno), HTML, 'reversibile');
});

test('script: le dipendenze prima di chi le usa, e pdf-lib esiste in vendor/', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const pos = (n) => ordine.indexOf(n);
  for (const n of ['festivita.js', 'calendario-vista.js', 'calendario-pdf.js', 'calendario-ics.js', 'calendario-stampa.js']) {
    assert.ok(pos(n) >= 0, n + ' manca');
    assert.ok(fs.existsSync(path.join(RADICE, 'js', n)), n + ' non esiste');
  }
  assert.ok(pos('festivita.js') < pos('calendario-stampa.js'));
  assert.ok(pos('calendario-vista.js') < pos('calendario-stampa.js'));
  assert.ok(pos('calendario-pdf.js') < pos('calendario-stampa.js'));
  const ui = fs.readFileSync(path.join(RADICE, 'js', 'calendario-stampa.js'), 'utf8');
  const lib = ui.match(/'(\/vendor\/[^']+)'/)[1];
  assert.ok(fs.existsSync(path.join(RADICE, lib)), lib);
  // pdf-lib pesa: non si carica con la pagina, solo al primo clic
  assert.ok(!HTML.includes('pdf-lib'), 'pdf-lib non va caricato con la pagina');
});

test('funziona offline: pagina e script nel precache del service worker', () => {
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/utilita-web/calendario-da-stampare/', '/js/festivita.js', '/js/calendario-vista.js',
    '/js/calendario-pdf.js', '/js/calendario-ics.js', '/js/calendario-stampa.js']) {
    assert.ok(sw.includes("'" + u + "'"), u + ' non e nel precache');
  }
});

test('i controlli del modulo hanno un’etichetta', () => {
  const id = [...HTML.matchAll(/<(?:select|input)\b[^>]*\bid="(cal-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(id.length >= 8);
  for (const x of id) {
    const perFor = HTML.includes('for="' + x + '"');
    const dentroLabel = new RegExp('<label[^>]*>\\s*<input[^>]*id="' + x + '"').test(HTML);
    assert.ok(perFor || dentroLabel, x + ' senza etichetta');
  }
});
