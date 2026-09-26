// tests/naspi-calcolo.test.js — Importo, durata e riduzione della NASpI.
//
// Casi calcolati a mano con i parametri 2026 di data/regole-fiscali-2026.json
// (soglia 1.456,72 €, massimale 1.584,70 €, 75% + 25%, 4,33 settimane al mese).
const test = require('node:test');
const assert = require('node:assert');
const N = require('../js/naspi-calcolo.js');
const { regoleFiscali } = require('./helpers/carica-script.js');

const R = regoleFiscali().naspi_parametri_2026;
const vicino = (a, b) => assert.ok(Math.abs(a - b) < 0.005, a + ' invece di ' + b);

test('sotto la soglia: il 75% della retribuzione media mensile', () => {
  const r = N.calcola({ eta: 40, retribuzione: 60000, settimane: 200 }, R);
  vicino(r.rmm, 1299);            // 60.000 / 200 × 4,33
  vicino(r.importoBase, 974.25);  // 1.299 × 75%
  assert.strictEqual(r.settimaneSpettanti, 100);
  assert.strictEqual(r.mesi, 23); // 100 / 4,33 = 23,09
});

test('sopra la soglia: 25% della parte in piu, entro il massimale', () => {
  const r = N.calcola({ eta: 40, retribuzione: 120000, settimane: 200 }, R);
  vicino(r.importoBase, 1377.86); // 1.456,72 × 75% + (2.598 − 1.456,72) × 25%
  const alto = N.calcola({ eta: 40, retribuzione: 200000, settimane: 200 }, R);
  vicino(alto.importoBase, 1584.70);
});

test('il taglio del 3% parte dal sesto mese, dall ottavo con 55 anni', () => {
  const r = N.calcola({ eta: 40, retribuzione: 60000, settimane: 200 }, R);
  assert.strictEqual(r.piano[4].taglio, 0);         // quinto mese pieno
  vicino(r.piano[5].lordo, 974.25 * 0.97);          // sesto
  vicino(r.piano[6].lordo, 974.25 * 0.97 * 0.97);   // settimo: cumulativo
  const over = N.calcola({ eta: 55, retribuzione: 60000, settimane: 200 }, R);
  assert.strictEqual(over.mesePartenzaDecalage, 8);
  assert.strictEqual(over.piano[6].taglio, 0);
  vicino(over.piano[7].lordo, 974.25 * 0.97);
});

test('durata massima di 104 settimane e settimane gia usate', () => {
  assert.strictEqual(N.calcola({ eta: 40, retribuzione: 150000, settimane: 520 }, R).mesi, 24);
  const scomputo = N.calcola({ eta: 40, retribuzione: 60000, settimane: 200, scomputo: 60 }, R);
  assert.strictEqual(scomputo.settimaneSpettanti, 70);
});

test('requisiti e dati mancanti', () => {
  assert.strictEqual(N.calcola({ eta: 40, retribuzione: 5000, settimane: 12 }, R).esito, 'settimane_insufficienti');
  assert.strictEqual(N.calcola({ eta: 40, retribuzione: 0, settimane: 100 }, R).esito, 'dati_mancanti');
  assert.strictEqual(N.calcola({ eta: 40, retribuzione: 5000, settimane: 13 }, R).esito, 'ok');
});
