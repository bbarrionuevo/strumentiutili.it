// tests/bollo-calcolo.test.js — Il conto del bollo e del superbollo.
//
// I casi sono calcolati a mano sulle tariffe di data/regole-fiscali-2026.json
// (gli stessi esempi scritti nella pagina del calcolatore e nella guida).
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/bollo-calcolo.js');
const { regoleFiscali } = require('./helpers/carica-script.js');

const R = regoleFiscali().bollo_auto_2026;
const conto = (kw, classe, regione, anni) => B.calcola({ kw, classe, regione, anni }, R);

test('fino a 100 kW una tariffa sola, oltre la tariffa eccedente', () => {
  assert.strictEqual(conto(85, 'euro_3', 'lombardia').bollo, 229.5);        // 85 × 2,70
  assert.strictEqual(conto(85, 'euro_4_5_6', 'lombardia').bollo, 219.3);    // 85 × 2,58
  assert.strictEqual(conto(100, 'euro_4_5_6', 'piemonte').bollo, 258);      // 100 × 2,58
  assert.strictEqual(conto(101, 'euro_4_5_6', 'piemonte').bollo, 261.87);   // 258 + 3,87
});

test('le tariffe regionali caricate', () => {
  assert.strictEqual(conto(140, 'euro_4_5_6', 'toscana').bollo, 441.4);     // 100 × 2,71 + 40 × 4,26
  assert.strictEqual(conto(220, 'euro_4_5_6', 'lazio').bollo, 795.2);       // 100 × 2,84 + 120 × 4,26
  assert.strictEqual(conto(220, 'euro_4_5_6', 'campania').bollo, 874.8);    // 100 × 3,12 + 120 × 4,69
  assert.strictEqual(conto(140, 'euro_4_5_6', 'toscana').origine, 'regionale');
});

test('si conta la parte intera dei kW', () => {
  assert.strictEqual(conto('85.9', 'euro_4_5_6', 'marche').kw, 85);
  assert.strictEqual(conto('85.9', 'euro_4_5_6', 'marche').bollo, 219.3);
});

test('superbollo: 20 euro per kW oltre 185, poi a scalini con gli anni', () => {
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 0).superbollo, 700);      // 35 × 20
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 4).superbollo, 700);
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 5).superbollo, 420);      // 35 × 12
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 10).superbollo, 210);     // 35 × 6
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 15).superbollo, 105);     // 35 × 3
  assert.strictEqual(conto(220, 'euro_4_5_6', '', 20).superbollo, 0);
  assert.strictEqual(conto(185, 'euro_4_5_6', '', 0).superbollo, 0);
  const r = conto(220, 'euro_4_5_6', 'veneto', 6);
  assert.strictEqual(r.bollo, 722.4);
  assert.strictEqual(r.totale, 1142.4);
});

test('da dove viene la tariffa', () => {
  assert.strictEqual(conto(70, 'euro_4_5_6', '').origine, 'da_scegliere');
  assert.strictEqual(conto(70, 'euro_4_5_6', 'lombardia').origine, 'nazionale');
  // Regione con tariffe proprie non ancora caricate: si usa la nazionale e si avvisa
  assert.strictEqual(conto(70, 'euro_4_5_6', 'veneto').origine, 'nazionale_provvisoria');
  assert.strictEqual(conto(70, 'euro_4_5_6', 'veneto').bollo, 180.6);
});

test('dati mancanti: zero, non un errore', () => {
  assert.strictEqual(conto('', 'euro_4_5_6', 'lazio').totale, 0);
  assert.strictEqual(conto(90, 'classe_inesistente', 'lazio').bollo, 0);
});
