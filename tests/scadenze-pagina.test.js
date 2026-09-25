// tests/scadenze-pagina.test.js — La pagina "Scadenziario": elementi, script,
// precache, e che le scadenze restino sul dispositivo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RADICE, 'identita-burocrazia', 'scadenziario', 'index.html'), 'utf8');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'scadenze-ui.js'), 'utf8');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/\$\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size >= 18, 'trovati ' + usati.size);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  for (const id of ['sc-aiuto', 'sc-usa', 'sc-annulla']) assert.ok(new RegExp('id="' + id + '"[^>]*hidden').test(HTML), id);
});

test('script in ordine e nessun invio di dati', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const ui = ordine.indexOf('scadenze-ui.js');
  for (const js of ['festivita.js', 'scadenze.js', 'calendario-ics.js']) assert.ok(ordine.indexOf(js) !== -1 && ordine.indexOf(js) < ui, js);
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(UI));
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML/.test(UI), 'i nomi entrano solo con textContent');
  // l'unico indirizzo esterno e' Google Calendar, che si apre solo se lo tocchi
  const esterni = [...fs.readFileSync(path.join(RADICE, 'js', 'calendario-ics.js'), 'utf8').matchAll(/https?:\/\/[^'"\s]+/g)].map((m) => new URL(m[0]).host);
  assert.deepStrictEqual([...new Set(esterni)], ['calendar.google.com']);
  assert.ok(/rel = 'noopener noreferrer'/.test(UI));
});

test('registrata: precache, indice, sitemap, categoria e privacy', () => {
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/identita-burocrazia/scadenziario/', '/js/scadenze.js', '/js/scadenze-ui.js', '/js/calendario-ics.js']) assert.ok(sw.includes("'" + u + "'"), u);
  assert.ok(fs.readFileSync(path.join(RADICE, 'data', 'strumenti.json'), 'utf8').includes('/identita-burocrazia/scadenziario/'));
  assert.ok(fs.readFileSync(path.join(RADICE, 'sitemap.xml'), 'utf8').includes('/identita-burocrazia/scadenziario/'));
  assert.ok(fs.readFileSync(path.join(RADICE, 'identita-burocrazia', 'index.html'), 'utf8').includes('/identita-burocrazia/scadenziario/'));
  assert.ok(/scadenziario/.test(fs.readFileSync(path.join(RADICE, 'politica-sulla-privacy.html'), 'utf8')));
  assert.ok(fs.readFileSync(path.join(RADICE, 'src', 'input.css'), 'utf8').includes('@source "../js/scadenze-ui.js"'));
});
