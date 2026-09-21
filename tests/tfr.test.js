// tests/tfr.test.js — Calcolo TFR e tassazione separata.
// Come per la busta paga: gli importi sono valori di CARATTERIZZAZIONE
// congelati dal comportamento attuale, le invarianti sono verificate davvero.
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/irpef.js', 'js/tfr.js']);
const { calculateTFR } = window.TFRCalculator;
const regole = regoleFiscali();

const CASI = [
  { ral: 25000, anni: 5, tfrLordo: 8634.25, tassazione: 1985.88, aliquota: 23, tfrNetto: 6648.37 },
  { ral: 30000, anni: 10, tfrLordo: 20722.2, tassazione: 4766.11, aliquota: 23, tfrNetto: 15956.09 },
  { ral: 45000, anni: 20, tfrLordo: 62166.6, tassazione: 15848.32, aliquota: 25.49, tfrNetto: 46318.28 }
];

for (const caso of CASI) {
  test(`RAL ${caso.ral} per ${caso.anni} anni`, () => {
    const r = calculateTFR(caso.ral, caso.ral, caso.anni, regole);
    assert.strictEqual(r.tfrLordo, caso.tfrLordo, 'TFR lordo');
    assert.strictEqual(r.tassazione, caso.tassazione, 'tassazione separata');
    assert.strictEqual(r.aliquotaApplicata, caso.aliquota, 'aliquota applicata');
    assert.strictEqual(r.tfrNetto, caso.tfrNetto, 'TFR netto');
  });
}

test('il TFR lordo cresce in proporzione agli anni', () => {
  const cinque = calculateTFR(30000, 30000, 5, regole).tfrLordo;
  const dieci = calculateTFR(30000, 30000, 10, regole).tfrLordo;
  assert.ok(Math.abs(dieci - cinque * 2) < 0.01, 'il TFR non e lineare negli anni');
});

test('l aliquota non scende mai sotto il primo scaglione', () => {
  const minima = regole.irpef.scaglioni[0].aliquota * 100;
  for (let ral = 10000; ral <= 200000; ral += 5000) {
    for (const anni of [1, 5, 15, 35]) {
      const r = calculateTFR(ral, ral, anni, regole);
      assert.ok(r.aliquotaApplicata >= minima - 1e-9, `aliquota ${r.aliquotaApplicata} a RAL ${ral}/${anni} anni`);
    }
  }
});

test('il netto non supera mai il lordo e non e negativo', () => {
  for (let ral = 0; ral <= 200000; ral += 5000) {
    for (const anni of [0, 1, 10, 40]) {
      const r = calculateTFR(ral, ral, anni, regole);
      assert.ok(r.tfrNetto <= r.tfrLordo + 1e-9, `netto > lordo a RAL ${ral}/${anni}`);
      assert.ok(r.tfrNetto >= 0, `netto negativo a RAL ${ral}/${anni}`);
    }
  }
});

test('zero anni o zero RAL danno zero, non NaN', () => {
  for (const [ral, anni] of [[0, 10], [30000, 0], [0, 0]]) {
    const r = calculateTFR(ral, ral, anni, regole);
    assert.strictEqual(r.tfrLordo, 0);
    assert.strictEqual(r.tassazione, 0);
    assert.strictEqual(r.tfrNetto, 0);
  }
});

test('ingressi non numerici non producono NaN', () => {
  for (const sporco of [null, undefined, '', 'abc', NaN, -1]) {
    const r = calculateTFR(sporco, sporco, 10, regole);
    for (const [chiave, valore] of Object.entries(r)) {
      if (typeof valore === 'number') {
        assert.ok(Number.isFinite(valore), `${chiave} = ${valore} con ingresso ${String(sporco)}`);
      }
    }
  }
});

// --- REGRESSIONE -----------------------------------------------------------
// La vecchia copia indicizzava scaglioni[0..2] a mano: un ritocco alle
// aliquote alte poteva non arrivare mai al calcolo.
test('un cambio di aliquota nel JSON si riflette sulla tassazione', () => {
  const ritoccate = JSON.parse(JSON.stringify(regole));
  ritoccate.irpef.scaglioni[2].aliquota = 0.45;

  // RAL alto e pochi anni: il reddito di riferimento finisce nell ultimo scaglione
  const base = calculateTFR(200000, 200000, 2, regole);
  const dopo = calculateTFR(200000, 200000, 2, ritoccate);

  assert.ok(dopo.tassazione > base.tassazione, 'il cambio di aliquota e stato ignorato');
});
