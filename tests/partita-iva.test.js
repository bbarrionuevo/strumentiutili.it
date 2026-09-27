// tests/partita-iva.test.js — Il motore del regime forfettario (js/partita-iva.js).
// Casi calcolati a mano con partitaIvaForfettario di data/regole-fiscali-2026.json:
// reddito = ricavi × coefficiente; contributi sul reddito; imposta sostitutiva
// sul reddito meno i contributi.
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/partita-iva.js']);
const P = regoleFiscali().partitaIvaForfettario;
const conto = (ricavi, regime, attivita) => window.PartitaIvaForfettaria.calculatePartitaIva(ricavi, regime, attivita, P);

test('professionista in gestione separata al 15%', () => {
  const r = conto(40000, 'standard', 'professionisti');
  assert.strictEqual(r.baseImponibile, 31200);        // 40.000 × 78%
  assert.strictEqual(r.inps, 8133.84);                // 31.200 × 26,07%
  assert.strictEqual(r.imponibileImposta, 23066.16);
  assert.strictEqual(r.impostaSostitutiva, 3459.92);  // × 15%
  assert.strictEqual(r.nettoAnno, 28406.24);
});

test('nuova attivita al 5%', () => {
  const r = conto(40000, 'new', 'professionisti');
  assert.strictEqual(r.impostaSostitutiva, 1153.31);
  assert.strictEqual(r.nettoAnno, 30712.85);
});

test('commerciante: quota fissa fino al minimale e percentuale sopra', () => {
  const r = conto(60000, 'standard', 'commercianti');
  assert.strictEqual(r.baseImponibile, 24000);        // 60.000 × 40%
  assert.strictEqual(r.dettaglioInps.quotaVariabile, 1271);  // (24.000 − 18.808) × 24,48%
  assert.strictEqual(r.inps, 5882.64);                // 4.611,64 + 1.271,00
  assert.strictEqual(r.impostaSostitutiva, 2717.6);
  assert.strictEqual(r.nettoAnno, 51399.76);
});

test('le soglie di 85.000 e 100.000 euro', () => {
  assert.strictEqual(conto(85000, 'standard', 'professionisti').alertLevel, 'OK');
  assert.strictEqual(conto(90000, 'standard', 'professionisti').alertLevel, 'WARN_85K');
  assert.strictEqual(conto(101000, 'standard', 'professionisti').alertLevel, 'DANGER_100K');
});
