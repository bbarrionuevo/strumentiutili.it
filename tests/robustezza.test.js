// tests/robustezza.test.js — Correzioni della revisione del 25 settembre 2026
// che non hanno un motore a parte: decimali della fattura elettronica,
// IMU del gruppo D, dati fiscali freschi nella PWA, versioni fissate.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');

function funzione(sorgente, nome) {
  const i = sorgente.indexOf('function ' + nome + '(');
  assert.ok(i >= 0, nome + ' non trovata');
  let livello = 0, j = sorgente.indexOf('{', i);
  for (; j < sorgente.length; j++) {
    if (sorgente[j] === '{') livello++;
    else if (sorgente[j] === '}' && --livello === 0) break;
  }
  return sorgente.slice(i, j + 1);
}

test('fattura elettronica: prezzo e quantita con i decimali veri (scarto 00423)', () => {
  const s = leggi('js/fatturapa.js');
  const decimali = new Function(funzione(s, 'decimali') + '; return decimali;')();
  assert.strictEqual(decimali(3), '3.00');
  assert.strictEqual(decimali(0.125), '0.125');
  assert.strictEqual(decimali(1.5), '1.50');
  assert.strictEqual(decimali(12.3456789), '12.3456789');
  assert.strictEqual(decimali(0.123456789), '0.12345679', 'al massimo 8 decimali');
  assert.match(s, /<PrezzoUnitario>\$\{decimali\(price\)\}<\/PrezzoUnitario>/);
  assert.match(s, /<Quantita>\$\{decimali\(qty\)\}<\/Quantita>/);
});

test('IMU gruppo D: 0,76% allo Stato (3925), il resto al Comune (3930)', () => {
  global.window = {};
  delete require.cache[require.resolve('../js/imu.js')];
  require('../js/imu.js');
  const I = global.window.IMUCalculator;
  const d = I.calcola({ rendita: 10000, categoria: 'D/1', aliquota: 10.6, quota: 100, mesi: 12 });
  assert.deepStrictEqual(d.ripartizione.map((r) => [r.codice, r.importo]), [['3925', 5187], ['3930', 2048]]);
  assert.strictEqual(d.ripartizione[0].importo + d.ripartizione[1].importo, d.impostaAnnua);
  assert.match(d.codiceTributo, /3925.*3930/);
  const solo = I.calcola({ rendita: 10000, categoria: 'D/1', aliquota: 7.6 });
  assert.strictEqual(solo.codiceTributo, '3925');
  assert.strictEqual(I.calcola({ rendita: 1000, categoria: 'A/2', aliquota: 10.6 }).ripartizione, null);
  delete global.window;
});

test('la PWA prende i dati fiscali dalla rete prima che dalla cache', () => {
  const sw = leggi('sw.js');
  const i = sw.indexOf("url.pathname.startsWith('/data/')");
  const j = sw.indexOf('if (STATICI.test(url.pathname))');
  assert.ok(i > 0 && i < j, 'i dati vanno gestiti prima degli statici (che rispondono dalla cache)');
});

test('versioni fissate e valori salvati letti con prudenza', () => {
  for (const f of ['js/workers/llm-worker.js', 'ia/assistente-documenti/index.html']) {
    assert.ok(!/esm\.run\/@mlc-ai\/web-llm"/.test(leggi(f)), f + ': web-llm senza versione');
    assert.match(leggi(f), /esm\.run\/@mlc-ai\/web-llm@\d+\.\d+\.\d+"/, f);
  }
  assert.ok(!/let esami = JSON\.parse\(localStorage/.test(leggi('js/media-universitaria.js')));
  // l'anno massimo del bollo segue il calendario
  assert.match(leggi('js/bollo-auto.js'), /\.max = String\(new Date\(\)\.getFullYear\(\) \+ 1\)/);
});
