// tests/sudoku-pagina.test.js — La pagina del sudoku del giorno: script,
// precache, comandi raggiungibili e nessun annuncio attaccato al gioco.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RADICE, 'utilita-web', 'sudoku-del-giorno', 'index.html'), 'utf8');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'sudoku-ui.js'), 'utf8');

test('script nell ordine giusto; pdf-lib solo al primo clic su Stampa', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ordine.indexOf('sudoku.js') >= 0 && ordine.indexOf('sudoku.js') < ordine.indexOf('sudoku-ui.js'));
  assert.ok(ordine.indexOf('sudoku-pdf.js') < ordine.indexOf('sudoku-ui.js'));
  assert.ok(!HTML.includes('pdf-lib'));
  const lib = UI.match(/'(\/vendor\/[^']+)'/)[1];
  assert.ok(fs.existsSync(path.join(RADICE, lib)), lib);
});

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size > 15);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id + ' manca nella pagina');
  for (let d = 1; d <= 9; d++) assert.ok(HTML.includes('data-cifra="' + d + '"'), 'tasto ' + d);
  for (const l of ['facile', 'medio', 'difficile']) assert.ok(HTML.includes('data-livello="' + l + '"'), l);
});

test('nessun annuncio fra la griglia e i suoi comandi', () => {
  const gioco = HTML.slice(HTML.indexOf('<section id="gioco"'), HTML.indexOf('</section>', HTML.indexOf('<section id="gioco"')));
  assert.ok(gioco.includes('sdk-griglia') && gioco.includes('sdk-tastierino'));
  assert.ok(!/su-ad|adsbygoogle/.test(gioco), 'annuncio dentro la sezione del gioco');
  // il primo annuncio del contenuto viene dopo la sezione della serie
  assert.ok(HTML.indexOf('su-ad--contenuto') > HTML.indexOf('id="sdk-archivio"'));
});

test('funziona offline: pagina e script nel precache', () => {
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/utilita-web/sudoku-del-giorno/', '/js/sudoku.js', '/js/sudoku-pdf.js', '/js/sudoku-ui.js']) {
    assert.ok(sw.includes("'" + u + "'"), u);
  }
});

test('la partita si salva in una chiave su_, cancellabile dal pie di pagina', () => {
  const chiavi = [...UI.matchAll(/CHIAVE = '([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(chiavi, ['su_sudoku']);
});
