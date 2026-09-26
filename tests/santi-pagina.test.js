// tests/santi-pagina.test.js — La pagina "Santo del giorno": il modello ha
// tutto quello che lo script cerca, il calendario si scrive dai dati, e
// quando la pagina esiste e' coerente con data/santi.json e registrata.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../scripts/pagina-santi.js');
const G = require('../scripts/genera-santi.js');
const S = require('../js/santi.js');
const { risposta } = require('./fixtures/santi-sparql.js');

const RADICE = path.join(__dirname, '..');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'santi-ui.js'), 'utf8');
const MODELLO = P.pagina();
const DATI = G.trasforma(risposta().results.bindings, '2026-09-25').dati;

test('ogni id usato dallo script esiste nel modello', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size > 20);
  for (const id of usati) {
    if (id === 'sdg-crea-auguri') continue;   // lo crea lo script nel risultato
    assert.ok(MODELLO.includes('id="' + id + '"'), id);
  }
});

test('script nell ordine giusto e annunci lontani dai pulsanti', () => {
  const ordine = [...MODELLO.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  for (const m of ['festivita.js', 'sole.js', 'santi.js', 'auguri.js']) {
    assert.ok(ordine.indexOf(m) >= 0 && ordine.indexOf(m) < ordine.indexOf('santi-ui.js'), m);
  }
  for (const id of ['sdg-oggi', 'sdg-onomastico', 'sdg-auguri', 'sdg-breve']) {
    const i = MODELLO.indexOf('<section id="' + id + '"');
    const sezione = MODELLO.slice(i, MODELLO.indexOf('</section>', i));
    assert.ok(!/su-ad|adsbygoogle/.test(sezione), id);
  }
});

test('il calendario dei santi si scrive dai dati, 366 giorni, sempre uguale', () => {
  const html = P.aggiorna(MODELLO, DATI);
  const giorni = html.slice(html.indexOf('<!-- su:santi:calendario -->'), html.indexOf('<!-- /su:santi:calendario -->'));
  assert.strictEqual((giorni.match(/<details /g) || []).length, 12);
  assert.strictEqual((giorni.match(/<li /g) || []).length, 366);
  assert.ok(giorni.includes('4 ottobre</span><span class="text-gray-700">San Francesco d’Assisi <span class="text-gray-500">e altri 3</span>'));
  assert.ok(html.includes('dati del 25/09/2026'));
  assert.strictEqual(P.aggiorna(html, DATI), html, 'riscrivere non cambia nulla');
  // i nomi arrivano da Wikidata: niente HTML che passi
  const sporco = JSON.parse(JSON.stringify(DATI));
  sporco.giorni['01-01'][0][0] = '<img src=x onerror=alert(1)>';
  assert.ok(!P.aggiorna(MODELLO, sporco).includes('<img src=x'));
});

// Quando la pagina e i dati esistono davvero, devono essere coerenti e la
// pagina deve essere registrata come le altre.
const PAGINA = path.join(RADICE, 'utilita-web', 'santo-del-giorno', 'index.html');
const ESISTE = fs.existsSync(PAGINA) && fs.existsSync(path.join(RADICE, 'data', 'santi.json'));
test('pagina pubblicata: coerente con i dati e registrata', { skip: !ESISTE }, () => {
  const html = fs.readFileSync(PAGINA, 'utf8');
  const veri = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'santi.json'), 'utf8'));
  assert.deepStrictEqual(S.problemi(veri), []);
  assert.strictEqual(P.aggiorna(html, veri), html, 'esegui node scripts/genera-santi.js --da-dati');
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/utilita-web/santo-del-giorno/', '/js/sole.js', '/js/santi.js', '/js/auguri.js', '/js/santi-ui.js']) {
    assert.ok(sw.includes("'" + u + "'"), u + ' non e nel precache');
  }
});

test('pagina pubblicata: indice, sitemap, home, categoria, fonti e privacy', { skip: !ESISTE }, () => {
  const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');
  const u = '/utilita-web/santo-del-giorno/';
  assert.ok(leggi('sw.js').includes("'/data/santi.json'"), 'i dati servono anche offline');
  assert.ok(leggi('data', 'strumenti.json').includes(u));
  assert.ok(leggi('sitemap.xml').includes(u));
  assert.ok(leggi('index.html').includes('href="' + u + '"'));
  assert.ok(leggi('utilita-web', 'index.html').includes('href="' + u + '"'));
  const html = fs.readFileSync(PAGINA, 'utf8');
  assert.ok(html.includes('Calendario romano generale') && html.includes('Wikidata'), 'le due fonti citate');
  assert.match(leggi('politica-sulla-privacy.html'), /Santo del giorno[^<]*alba e tramonto/);
});
