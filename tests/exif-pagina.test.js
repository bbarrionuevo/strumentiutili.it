// tests/exif-pagina.test.js — La pagina "Togliere i dati nascosti dalle
// foto": elementi, script, precache e condivisione.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RADICE, 'utilita-web', 'rimuovi-dati-foto', 'index.html'), 'utf8');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'exif-ui.js'), 'utf8');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size >= 9);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  // i pulsanti per scaricare compaiono solo dopo la pulizia
  for (const id of ['exf-azioni', 'exf-scarica', 'exf-condividi']) assert.ok(new RegExp('id="' + id + '"[^>]*hidden').test(HTML), id);
  assert.ok(/id="exf-orientamento"[^>]*checked/.test(HTML), 'il verso della foto si tiene di norma');
});

test('script in ordine: condivisi.js dopo l interfaccia', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ordine.indexOf('exif.js') !== -1 && ordine.indexOf('exif.js') < ordine.indexOf('exif-ui.js'));
  assert.ok(ordine.indexOf('exif-ui.js') < ordine.indexOf('condivisi.js'), 'l interfaccia deve ascoltare prima che arrivino i file condivisi');
});

test('le foto non escono dal browser', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage/.test(UI));
  // l'unico indirizzo esterno e' il link alla mappa, che si apre solo se lo tocchi
  const esterni = [...UI.matchAll(/https?:\/\/[^'"\s]+/g)].map((m) => m[0]);
  assert.deepStrictEqual([...new Set(esterni.map((u) => new URL(u).host))], ['www.openstreetmap.org']);
  assert.ok(/target="_blank" rel="noopener noreferrer"/.test(UI));
});

test('riceve JPG e PNG condivisi, e funziona offline', () => {
  assert.ok(/<input id="exf-file"[^>]*data-condivisi/.test(HTML));
  const C = require('../js/condivisi.js');
  for (const f of [{ name: 'foto.jpg', type: 'image/jpeg' }, { name: 'schermata.png', type: 'image/png' }]) {
    assert.ok(C.azioni([f]).some((a) => a.percorso === '/utilita-web/rimuovi-dati-foto/'), f.name);
  }
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/utilita-web/rimuovi-dati-foto/', '/js/exif.js', '/js/exif-ui.js']) assert.ok(sw.includes("'" + u + "'"), u);
  const indice = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'strumenti.json'), 'utf8'));
  assert.ok(JSON.stringify(indice).includes('/utilita-web/rimuovi-dati-foto/'));
});
