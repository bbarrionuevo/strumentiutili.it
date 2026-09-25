// tests/turni-pagina.test.js — La pagina "Calendario turni": elementi,
// script, precache, e che i dati restino sul dispositivo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RADICE, 'lavoro-contratti', 'calendario-turni', 'index.html'), 'utf8');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'turni-ui.js'), 'utf8');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/\$\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size >= 20, 'trovati ' + usati.size);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  for (const id of ['tu-avviso', 'tu-giorno', 'tu-personalizzato']) assert.ok(new RegExp('id="' + id + '"[^>]*hidden').test(HTML), id);
});

test('script in ordine: motori prima dell interfaccia', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const ui = ordine.indexOf('turni-ui.js');
  assert.ok(ui > 0);
  for (const js of ['festivita.js', 'turni.js', 'calendario-pdf.js', 'turni-pdf.js', 'calendario-ics.js']) {
    assert.ok(ordine.indexOf(js) !== -1 && ordine.indexOf(js) < ui, js);
  }
  // pdf-lib si scarica solo al primo PDF, dal sito stesso
  assert.ok(!/pdf-lib/.test(HTML));
  assert.ok(UI.includes("'/vendor/pdf-lib@1.17.1/pdf-lib.min.js'"));
});

test('i turni non escono dal browser e il link non porta ferie o malattie', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(UI));
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML/.test(UI), 'i nomi dei turni entrano solo con textContent');
  // il link mette lo schema dopo il #, che non arriva al server
  assert.ok(/#s=' \+ T\.codifica/.test(UI));
  const T = require('../js/turni.js');
  const s = T.daModello('quinta', '2026-10-01');
  T.segna(s, '2026-10-05', 'MA');
  assert.deepStrictEqual(T.decodifica(T.codifica(s)).eccezioni, {});
});

test('registrata: precache, indice, sitemap, categoria e privacy', () => {
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/lavoro-contratti/calendario-turni/', '/js/turni.js', '/js/turni-pdf.js', '/js/turni-ui.js', '/js/calendario-pdf.js', '/js/festivita.js']) {
    assert.ok(sw.includes("'" + u + "'"), u);
  }
  const indice = fs.readFileSync(path.join(RADICE, 'data', 'strumenti.json'), 'utf8');
  assert.ok(indice.includes('/lavoro-contratti/calendario-turni/'));
  assert.ok(fs.readFileSync(path.join(RADICE, 'sitemap.xml'), 'utf8').includes('/lavoro-contratti/calendario-turni/'));
  assert.ok(fs.readFileSync(path.join(RADICE, 'lavoro-contratti', 'index.html'), 'utf8').includes('/lavoro-contratti/calendario-turni/'));
  assert.ok(/calendario turni/.test(fs.readFileSync(path.join(RADICE, 'politica-sulla-privacy.html'), 'utf8')));
  assert.ok(fs.readFileSync(path.join(RADICE, 'src', 'input.css'), 'utf8').includes('@source "../js/turni-ui.js"'));
});
