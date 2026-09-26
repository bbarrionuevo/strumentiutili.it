// tests/imu.test.js — Il motore dell'IMU (js/imu.js).
// Casi calcolati a mano: rendita × 1,05 × coefficiente × aliquota (per mille)
// × quota × mesi/12, con le riduzioni di legge (L. 160/2019).
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/imu.js']);
const I = regoleFiscali().imu;
const imu = (d) => window.IMUCalculator.calcola(Object.assign({ quota: 100, mesi: 12 }, d), I);

test('seconda casa: rendita 900, A/2, 10,6 per mille', () => {
  const r = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6 });
  assert.strictEqual(r.baseImponibile, 151200);           // 900 × 1,05 × 160
  assert.ok(Math.abs(r.impostaLorda - 1602.72) < 1e-9);
  assert.strictEqual(r.impostaAnnua, 1603);
  assert.strictEqual(r.acconto, 801);
  assert.strictEqual(r.saldo, 802);
  assert.strictEqual(r.codiceTributo, '3918');
});

test('comodato e canone concordato', () => {
  assert.strictEqual(imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, isComodato: true }).impostaAnnua, 801);   // base al 50%
  assert.strictEqual(imu({ rendita: 700, categoria: 'A/3', aliquota: 10.6, isConcordato: true }).impostaAnnua, 935); // 1.246,56 × 75%
  // il comodato non vale per le abitazioni di lusso
  assert.strictEqual(imu({ rendita: 900, categoria: 'A/8', aliquota: 6, isComodato: true }).baseImponibile, 151200);
});

test('quota e mesi di possesso', () => {
  const r = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, quota: 50, mesi: 6 });
  assert.strictEqual(r.impostaAnnua, 401);  // 1.602,72 × 50% × 6/12 = 400,68
  assert.strictEqual(r.acconto, 200);
  assert.strictEqual(r.saldo, 201);
});

test('gruppo D: 0,76% allo Stato (3925), il resto al Comune (3930)', () => {
  const r = imu({ rendita: 4000, categoria: 'D/7', aliquota: 10.6 });
  assert.strictEqual(r.baseImponibile, 273000);           // 4.000 × 1,05 × 65
  assert.strictEqual(r.impostaAnnua, 2894);
  // JSON: gli oggetti vengono da un altro contesto vm, con altri prototipi
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.ripartizione)), [
    { codice: '3925', ente: 'Stato', importo: 2075 },
    { codice: '3930', ente: 'Comune', importo: 819 }
  ]);
});

test('terreni e negozi', () => {
  assert.strictEqual(imu({ rendita: 1000, categoria: 'TERRENO', aliquota: 7.6 }).baseImponibile, 1000 * 1.25 * 135);
  assert.strictEqual(imu({ rendita: 1000, categoria: 'C/1', aliquota: 10.6 }).baseImponibile, 1000 * 1.05 * 55);
  assert.strictEqual(imu({ rendita: 1000, categoria: 'TERRENO', aliquota: 7.6 }).codiceTributo, '3914');
});
