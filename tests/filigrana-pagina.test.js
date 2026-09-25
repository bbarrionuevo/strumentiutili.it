// tests/filigrana-pagina.test.js — La pagina "Proteggere la copia di un
// documento": elementi, script, privacy dei campi, precache e condivisione.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RADICE, 'identita-burocrazia', 'proteggi-documento', 'index.html'), 'utf8');
const UI = fs.readFileSync(path.join(RADICE, 'js', 'filigrana-ui.js'), 'utf8');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.ok(usati.size > 15);
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"'), id);
  for (const nome of ['fil-colore', 'fil-dimensione', 'fil-formato']) assert.ok(HTML.includes('name="' + nome + '"'), nome);
});

test('script in ordine: condivisi.js dopo l interfaccia, librerie PDF solo quando servono', () => {
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ordine.indexOf('filigrana.js') < ordine.indexOf('filigrana-ui.js'));
  assert.ok(ordine.indexOf('filigrana-ui.js') < ordine.indexOf('condivisi.js'), 'l interfaccia deve ascoltare prima che arrivino i file condivisi');
  assert.ok(!/pdf-lib|pdfjs/.test(HTML));
  for (const lib of [...UI.matchAll(/'(\/vendor\/[^']+)'/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(RADICE, lib)), lib);
});

test('i dati della pratica non si salvano nel browser', () => {
  for (const id of ['fil-destinatario', 'fil-altro', 'fil-data']) {
    assert.ok(new RegExp('id="' + id + '"[^>]*data-no-save').test(HTML), id + ' senza data-no-save');
  }
  const salvato = UI.slice(UI.indexOf('function ricorda()'), UI.indexOf('function opzioni()'));
  assert.ok(!/fil-destinatario|fil-altro/.test(salvato), 'ricorda() non deve salvare destinatario o testo libero');
});

test('riceve foto e PDF condivisi, e funziona offline', () => {
  assert.ok(/<input id="fil-file"[^>]*data-condivisi/.test(HTML));
  const C = require('../js/condivisi.js');
  for (const f of [{ name: 'carta.jpg', type: 'image/jpeg' }, { name: 'carta.pdf', type: 'application/pdf' }]) {
    assert.ok(C.azioni([f]).some((a) => a.percorso === '/identita-burocrazia/proteggi-documento/'), f.name);
  }
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  for (const u of ['/identita-burocrazia/proteggi-documento/', '/js/filigrana.js', '/js/filigrana-ui.js']) assert.ok(sw.includes("'" + u + "'"), u);
});
