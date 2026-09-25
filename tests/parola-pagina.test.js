// tests/parola-pagina.test.js — La pagina della "Parola del giorno": elementi,
// script, niente annunci nel gioco, crediti degli elenchi e registrazione.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');
const HTML = leggi('utilita-web', 'parola-del-giorno', 'index.html');
const UI = leggi('js', 'parola-ui.js');

test('ogni id usato dallo script esiste nella pagina, con tutti i tasti', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size >= 20, 'trovati ' + usati.size);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  for (const c of 'abcdefghijklmnopqrstuvwxyz') assert.ok(HTML.includes('data-tasto="' + c + '"'), c);
  for (const t of ['invio', 'cancella']) assert.ok(HTML.includes('data-tasto="' + t + '"'), t);
  assert.strictEqual((HTML.match(/class="pa-riga" role="group"/g) || []).length, 6);
  assert.ok(/id="pa-fine" hidden/.test(HTML));
});

test('script in ordine: elenchi e motore prima dell interfaccia', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const ui = ordine.indexOf('parola-ui.js');
  assert.ok(ui > 0);
  let prima = -1;
  for (const js of ['giornaliero.js', 'parole-soluzioni.js', 'parole-valide.js', 'parola.js']) {
    const i = ordine.indexOf(js);
    assert.ok(i > prima && i < ui, js);
    prima = i;
  }
  // anche il sudoku ora prende data e serie da giornaliero.js
  const sudoku = [...leggi('utilita-web', 'sudoku-del-giorno', 'index.html').matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sudoku.indexOf('giornaliero.js') >= 0 && sudoku.indexOf('giornaliero.js') < sudoku.indexOf('sudoku.js'));
});

test('nessun annuncio nel gioco, nelle statistiche o nelle regole', () => {
  const inizio = HTML.indexOf('<div id="pa-app"');
  const fine = HTML.indexOf('su-ad--contenuto');
  assert.ok(inizio > 0 && fine > inizio);
  const gioco = HTML.slice(inizio, fine);
  assert.ok(gioco.includes('pa-griglia') && gioco.includes('pa-tastiera') && gioco.includes('pa-archivio') && gioco.includes('t-regole'));
  assert.ok(!/adsbygoogle/.test(gioco));
});

test('la partita non esce dal browser e le parole entrano solo come testo', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(UI));
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML/.test(UI));
  const chiavi = [...UI.matchAll(/CHIAVE = '([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(chiavi, ['su_parola']);
  // l'unico link esterno del gioco e' il vocabolario, in una scheda nuova
  assert.ok(/id="pa-significato" href="https:\/\/www\.treccani\.it\/vocabolario\/" target="_blank" rel="noopener"/.test(HTML));
});

test('crediti e numeri della guida coerenti con gli elenchi', () => {
  for (const s of ['wordfreq', 'Robyn Speer', 'an-array-of-italian-words', 'CC BY-SA 4.0', 'licenza MIT']) assert.ok(HTML.includes(s), s);
  const valide = require('../js/parole-valide.js').length;
  const soluzioni = require('../js/parole-soluzioni.js').length;
  assert.ok(HTML.includes('circa 5.000') && Math.abs(valide - 5000) < 500, 'valide: ' + valide);
  assert.ok(HTML.includes('oltre 900') && soluzioni >= 900 && soluzioni < 1000, 'soluzioni: ' + soluzioni);
  // "due anni e mezzo" di parole senza ripetizioni
  assert.ok(soluzioni >= 365 * 2.5);
  for (const f of ['parole-soluzioni.js', 'parole-valide.js']) assert.ok(/CC BY-SA 4\.0|wordfreq/.test(leggi('js', f)), f);
});

test('registrata: precache, indice, sitemap, categoria, home e privacy', () => {
  const sw = leggi('sw.js');
  for (const u of ['/utilita-web/parola-del-giorno/', '/js/giornaliero.js', '/js/parole-soluzioni.js', '/js/parole-valide.js', '/js/parola.js', '/js/parola-ui.js']) {
    assert.ok(sw.includes("'" + u + "'"), u);
  }
  assert.ok(leggi('data', 'strumenti.json').includes('/utilita-web/parola-del-giorno/'));
  assert.ok(leggi('sitemap.xml').includes('/utilita-web/parola-del-giorno/'));
  assert.ok(leggi('utilita-web', 'index.html').includes('href="/utilita-web/parola-del-giorno/"'));
  assert.ok(leggi('index.html').includes('href="/utilita-web/parola-del-giorno/"'));
  assert.ok(leggi('utilita-web', 'sudoku-del-giorno', 'index.html').includes('href="/utilita-web/parola-del-giorno/"'));
  assert.ok(/parola del giorno/.test(leggi('politica-sulla-privacy.html')));
  assert.ok(leggi('src', 'input.css').includes('@source "../js/parola-ui.js"'));
});
