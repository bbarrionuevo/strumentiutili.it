// tests/concordato.test.js — Convenienza del Concordato Preventivo Biennale.
//
// Le aliquote dell'imposta sostitutiva e il tetto di 85.000 euro sono dati di
// legge e vanno verificati come tali. Il resto sono invarianti: il concordato
// conviene quando si guadagna piu' di quanto proposto, e non conviene quando si
// guadagna meno. Se questi test cambiano segno, qualcosa si e' rotto.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const C = require('../js/concordato.js');
const REGOLE = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'));
const CPB = REGOLE.concordato_preventivo;

const BASE = {
  redditoPrecedente: 40000,
  isa: 9,
  aliquotaContributi: 0.26,
  aliquotaAddizionali: 0.0203
};

function caso(extra) {
  return C.confronta(Object.assign({}, BASE, extra), REGOLE);
}

// --- dati di legge ----------------------------------------------------------

test('le regole del concordato ci sono e indicano la scadenza', () => {
  assert.ok(CPB, 'manca il nodo concordato_preventivo');
  assert.strictEqual(CPB.scadenza_adesione, '2026-10-31');
  assert.deepStrictEqual(CPB.biennio, [2026, 2027]);
});

test('l aliquota della sostitutiva segue il punteggio ISA', () => {
  // 10% con ISA da 8 a 10, 12% con 6 o 7, 15% da 5 in giu'.
  for (const isa of [8, 9, 10]) assert.strictEqual(C.aliquotaSostitutiva(isa, CPB), 0.10, 'ISA ' + isa);
  for (const isa of [6, 6.5, 7]) assert.strictEqual(C.aliquotaSostitutiva(isa, CPB), 0.12, 'ISA ' + isa);
  for (const isa of [0, 3, 5]) assert.strictEqual(C.aliquotaSostitutiva(isa, CPB), 0.15, 'ISA ' + isa);
});

test('sopra gli 85.000 di eccedenza si applica il 43%', () => {
  const r = C.impostaSostitutiva(100000, 9, CPB);
  // 85.000 al 10% piu' 15.000 al 43%
  assert.strictEqual(r.imposta, 85000 * 0.10 + 15000 * 0.43);
  assert.strictEqual(r.oltreTetto, 15000);

  // esattamente al tetto non scatta nulla di piu' caro
  assert.strictEqual(C.impostaSostitutiva(85000, 9, CPB).imposta, 8500);
  assert.strictEqual(C.impostaSostitutiva(85000, 9, CPB).oltreTetto, 0);
});

test('senza eccedenza non si paga sostitutiva', () => {
  assert.strictEqual(C.impostaSostitutiva(0, 9, CPB).imposta, 0);
  assert.strictEqual(C.impostaSostitutiva(-5000, 9, CPB).imposta, 0);
});

// --- invarianti di convenienza ---------------------------------------------

test('guadagnare piu del concordato conviene', () => {
  const r = caso({ anni: [{ concordato: 45000, effettivo: 60000 }, { concordato: 47000, effettivo: 62000 }] });
  assert.strictEqual(r.conviene, true);
  assert.ok(r.risparmio > 0);
  assert.ok(r.totali.senza > r.totali[r.miglioreConcordato]);
});

test('guadagnare meno del concordato non conviene', () => {
  const r = caso({ anni: [{ concordato: 45000, effettivo: 30000 }, { concordato: 47000, effettivo: 30000 }] });
  assert.strictEqual(r.conviene, false);
  assert.ok(r.risparmio < 0, 'con un reddito piu basso il concordato deve risultare piu caro');
});

test('piu si guadagna oltre il concordato, piu il vantaggio cresce', () => {
  let precedente = -Infinity;
  for (const effettivo of [50000, 60000, 70000, 90000]) {
    const r = caso({ anni: [{ concordato: 45000, effettivo: effettivo }, { concordato: 45000, effettivo: effettivo }] });
    assert.ok(r.risparmio > precedente, 'il vantaggio non cresce a ' + effettivo);
    precedente = r.risparmio;
  }
});

test('la sostitutiva non e mai peggio della tassazione ordinaria sul concordato', () => {
  // E' facoltativa: chi aderisce sceglie l'opzione migliore, quindi lo
  // strumento non deve mai consigliare quella piu' cara.
  for (const isa of [3, 6, 9]) {
    for (const concordato of [42000, 50000, 80000, 200000]) {
      const r = caso({ isa: isa, anni: [{ concordato: concordato, effettivo: concordato }, { concordato: concordato, effettivo: concordato }] });
      const scelto = r.totali[r.miglioreConcordato];
      assert.ok(scelto <= Math.max(r.totali.conOrdinaria, r.totali.conSostitutiva) + 0.01);
      assert.strictEqual(scelto, Math.min(r.totali.conOrdinaria, r.totali.conSostitutiva));
    }
  }
});

// --- il punto che costa caro ------------------------------------------------

test('per le casse private i contributi restano sul reddito reale', () => {
  // E' l'equivoco piu' costoso: l'INPS segue il concordato, le casse dei
  // professionisti no.
  const anni = [{ concordato: 45000, effettivo: 70000 }, { concordato: 47000, effettivo: 70000 }];
  const inps = caso({ anni: anni, contributiSulReale: false });
  const cassa = caso({ anni: anni, contributiSulReale: true });

  assert.strictEqual(inps.scenari.conSostitutiva[0].baseContributi, 45000, 'INPS: base = concordato');
  assert.strictEqual(cassa.scenari.conSostitutiva[0].baseContributi, 70000, 'cassa: base = reddito reale');
  assert.ok(cassa.risparmio < inps.risparmio, 'con la cassa privata il vantaggio deve essere minore');
});

test('con l INPS la base contributiva non scende mai sotto il concordato', () => {
  const r = caso({ anni: [{ concordato: 50000, effettivo: 20000 }], contributiSulReale: false });
  assert.strictEqual(r.scenari.conSostitutiva[0].baseContributi, 50000);
});

// --- robustezza -------------------------------------------------------------

test('l IRPEF del concordato usa il motore condiviso', () => {
  const IRPEF = require('../js/irpef.js');
  const r = caso({ anni: [{ concordato: 45000, effettivo: 45000 }] });
  assert.strictEqual(r.scenari.conOrdinaria[0].irpef, IRPEF.computeIRPEF(45000, REGOLE.irpef));
});

test('ingressi vuoti o assurdi non producono NaN', () => {
  for (const sporco of [null, undefined, '', 'abc', NaN, -1]) {
    const r = C.confronta({
      redditoPrecedente: sporco, isa: sporco, aliquotaContributi: sporco, aliquotaAddizionali: sporco,
      anni: [{ concordato: sporco, effettivo: sporco }]
    }, REGOLE);
    for (const k of ['senza', 'conOrdinaria', 'conSostitutiva']) {
      assert.ok(Number.isFinite(r.totali[k]), k + ' = ' + r.totali[k] + ' con ingresso ' + String(sporco));
    }
  }
});

test('senza regole si ferma invece di inventare', () => {
  assert.throws(() => C.confronta({ anni: [] }, null), /Regole non caricate/);
});

test('lo strumento dichiara cosa non modella', () => {
  const r = caso({ anni: [{ concordato: 45000, effettivo: 50000 }] });
  assert.ok(Array.isArray(r.nonModellato) && r.nonModellato.length >= 3,
    'la stima deve dire quali aspetti restano fuori');
});
