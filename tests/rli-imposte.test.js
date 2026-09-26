// tests/rli-imposte.test.js — Registro e bollo per registrare un affitto.
// Casi calcolati a mano con rli_parametri di data/regole-fiscali-2026.json.
const test = require('node:test');
const assert = require('node:assert');
const I = require('../js/rli-imposte.js');
const { regoleFiscali, caricaScript } = require('./helpers/carica-script.js');

const R = regoleFiscali().rli_parametri;

test('registro: 2% del canone annuo, 70% della base per il canone concordato', () => {
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1' }, R).registro, 192);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L2' }, R).registro, 134.4);  // 9.600 × 70% × 2%
  assert.strictEqual(I.calcola({ canone: 18000, tipo: 'S1' }, R).registro, 360);
});

test('mai meno di 67 euro, anche per i fondi rustici allo 0,5%', () => {
  const basso = I.calcola({ canone: 3000, tipo: 'L1' }, R);
  assert.strictEqual(basso.registro, 67);
  assert.strictEqual(basso.minimoApplicato, true);
  assert.strictEqual(I.calcola({ canone: 10000, tipo: 'T2' }, R).registro, 67);    // 50 → 67
  assert.strictEqual(I.calcola({ canone: 20000, tipo: 'T2' }, R).registro, 100);   // 0,5%
});

test('bollo: 16 euro ogni quattro facciate, per copia', () => {
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 4, copie: 2 }, R).bollo, 32);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 5, copie: 2 }, R).bollo, 64);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 8, copie: 3 }, R).bollo, 96);
});

test('con la cedolare secca niente registro e niente bollo', () => {
  const r = I.calcola({ canone: 9600, tipo: 'L1', cedolare: true, pagine: 8, copie: 2 }, R);
  assert.strictEqual(r.registro, 0);
  assert.strictEqual(r.bollo, 0);
});

test('il compilatore RLI usa questo motore', () => {
  const sorgente = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'rli.js'), 'utf8');
  assert.match(sorgente, /window\.RliImposte\.calcola\(/);
  assert.doesNotMatch(sorgente, /canone \* 0\.005/, 'il conto non deve essere duplicato nella pagina');
  assert.ok(caricaScript(['js/rli-imposte.js']).window.RliImposte);
});
