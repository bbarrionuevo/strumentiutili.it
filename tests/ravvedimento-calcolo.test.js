// tests/ravvedimento-calcolo.test.js — Sanzione ridotta e interessi del
// ravvedimento operoso. Casi calcolati a mano con le percentuali della scheda
// dell'Agenzia delle Entrate e i tassi legali di data/regole-fiscali-2026.json.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/ravvedimento-calcolo.js');
const { regoleFiscali, caricaScript } = require('./helpers/carica-script.js');

const C = regoleFiscali().ravvedimento;
const conto = (importo, scadenza, pagamento, tributo) => R.calcola({ importo, scadenza, pagamento, tributo: tributo || 'IRPEF' }, C);

test('ravvedimento sprint: 1/15 dell 1,25% al giorno fino a 14 giorni', () => {
  const r = conto(1000, '2026-06-16', '2026-06-26');
  assert.strictEqual(r.giorni, 10);
  assert.strictEqual(r.sanzione, 8.33);          // 1.000 × 0,08333% × 10
  assert.strictEqual(r.interessi, 0.44);         // 1.000 × 1,6% × 10/365
  assert.strictEqual(r.totale, 1008.77);
  assert.strictEqual(r.codici.sanzione, '8901');
  assert.strictEqual(r.codici.interessi, '1989');
});

test('le fasce: entro 30 e 90 giorni, entro un anno, oltre', () => {
  assert.strictEqual(conto(1000, '2026-01-16', '2026-02-05').sanzione, 12.5);   // 20 giorni: 1,25%
  assert.strictEqual(conto(1000, '2026-01-16', '2026-03-17').sanzione, 13.89);  // 60 giorni: 1,3889%
  assert.strictEqual(conto(1000, '2025-06-16', '2026-01-02').sanzione, 31.25);  // 200 giorni: 3,125%
  assert.strictEqual(conto(1000, '2024-09-16', '2026-01-29').sanzione, 35.71);  // oltre un anno: 3,5714%
});

test('gli interessi cambiano tasso a capodanno', () => {
  // 15 giorni del 2025 al 2% e 15 del 2026 all 1,6%
  assert.strictEqual(conto(1000, '2025-12-16', '2026-01-15').interessi, 1.48);
});

test('violazioni prima del 1° settembre 2024: misure precedenti', () => {
  const r = conto(1000, '2024-06-17', '2024-07-07');   // 20 giorni: 1,5%
  assert.strictEqual(r.sanzione, 15);
  assert.strictEqual(r.nuove, false);
});

test('pagare prima della scadenza non e un ravvedimento', () => {
  assert.strictEqual(conto(1000, '2026-06-16', '2026-06-10'), null);
  assert.strictEqual(conto(1000, '2026-06-16', '2026-06-16').sanzione, 0);
});

test('il calcolatore usa questo motore', () => {
  const sorgente = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'ravvedimento.js'), 'utf8');
  assert.match(sorgente, /window\.RavvedimentoCalcolo\.calcola\(/);
  assert.doesNotMatch(sorgente, /function calcolaSanzioneRidotta/);
  assert.ok(caricaScript(['js/ravvedimento-calcolo.js']).window.RavvedimentoCalcolo);
});
