// tests/irpef.test.js — Motore IRPEF condiviso.
// Questi valori NON sono congelati dall'implementazione: sono calcolati a mano
// dagli scaglioni, quindi se il codice sbaglia il test lo dice davvero.
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/irpef.js']);
const IRPEF = window.StrumentiIrpef;
const regole = regoleFiscali();
const conf = regole.irpef;

test('imposta zero su reddito nullo o negativo', () => {
  assert.strictEqual(IRPEF.computeIRPEF(0, conf), 0);
  assert.strictEqual(IRPEF.computeIRPEF(-5000, conf), 0);
});

test('primo scaglione: 23% pieno', () => {
  assert.strictEqual(IRPEF.computeIRPEF(10000, conf), 2300);
  assert.strictEqual(IRPEF.computeIRPEF(28000, conf), 6440);
});

test('secondo scaglione: 6440 + 33% sull eccedenza', () => {
  // 6440 + 1 * 0,33
  assert.strictEqual(IRPEF.computeIRPEF(28001, conf), 6440.33);
  // 6440 + 12000 * 0,33 = 10400
  assert.strictEqual(IRPEF.computeIRPEF(40000, conf), 10400);
  // 6440 + 22000 * 0,33 = 13700
  assert.strictEqual(IRPEF.computeIRPEF(50000, conf), 13700);
});

test('terzo scaglione: 13700 + 43% sull eccedenza', () => {
  assert.strictEqual(IRPEF.computeIRPEF(50001, conf), 13700.43);
  // 13700 + 10000 * 0,43 = 18000
  assert.strictEqual(IRPEF.computeIRPEF(60000, conf), 18000);
  // 13700 + 150000 * 0,43 = 78200
  assert.strictEqual(IRPEF.computeIRPEF(200000, conf), 78200);
});

test('la funzione e monotona: piu reddito, mai meno imposta', () => {
  let precedente = -1;
  for (let reddito = 0; reddito <= 120000; reddito += 250) {
    const imposta = IRPEF.computeIRPEF(reddito, conf);
    assert.ok(imposta >= precedente, `regressione a ${reddito}: ${imposta} < ${precedente}`);
    precedente = imposta;
  }
});

test('l aliquota marginale non supera mai quella dell ultimo scaglione', () => {
  const massima = Math.max(...conf.scaglioni.map((s) => s.aliquota));
  for (let reddito = 1000; reddito <= 300000; reddito += 1000) {
    const marginale = (IRPEF.computeIRPEF(reddito, conf) - IRPEF.computeIRPEF(reddito - 1000, conf)) / 1000;
    assert.ok(marginale <= massima + 1e-9, `marginale ${marginale} a ${reddito}`);
  }
});

// --- REGRESSIONE: il bug che questo motore ha risolto ---------------------
// La vecchia copia dentro stipendio-netto.js indicizzava scaglioni[0..2] a mano
// e, sopra l ultimo limite, cadeva in un fallback con le aliquote scritte nel
// codice. Con un quarto scaglione nel JSON il risultato non cambiava.
test('un quarto scaglione aggiunto al JSON viene davvero applicato', () => {
  const confQuattro = {
    scaglioni: [
      { limite: 28000, aliquota: 0.23, base: 0 },
      { limite: 50000, aliquota: 0.33, base: 6440 },
      { limite: 120000, aliquota: 0.43, base: 13700 },
      { limite: null, aliquota: 0.50, base: 43800 }
    ]
  };
  // 13700 + 70000 * 0,43 = 43800 alla soglia dei 120.000
  assert.strictEqual(IRPEF.computeIRPEF(120000, confQuattro), 43800);
  // 43800 + 30000 * 0,50 = 58800: solo un motore generico ci arriva
  assert.strictEqual(IRPEF.computeIRPEF(150000, confQuattro), 58800);
});

// Lo scenario realistico: non un quarto scaglione, ma il semplice aggiornamento
// annuale di un aliquota. La vecchia implementazione, sopra l ultimo limite,
// restituiva comunque il 43% scritto nel fallback.
test('cambiare un aliquota nel JSON cambia il risultato', () => {
  const ritoccato = {
    scaglioni: [
      { limite: 28000, aliquota: 0.23, base: 0 },
      { limite: 50000, aliquota: 0.33, base: 6440 },
      { limite: null, aliquota: 0.45, base: 13700 }
    ]
  };
  // 13700 + 10000 * 0,45 = 18200, non 18000
  assert.strictEqual(IRPEF.computeIRPEF(60000, ritoccato), 18200);
  assert.notStrictEqual(IRPEF.computeIRPEF(60000, ritoccato), IRPEF.computeIRPEF(60000, conf));
});

test('gli scaglioni disordinati vengono ordinati, non sbagliati', () => {
  const disordinato = {
    scaglioni: [
      { limite: null, aliquota: 0.43 },
      { limite: 28000, aliquota: 0.23 },
      { limite: 50000, aliquota: 0.33 }
    ]
  };
  assert.strictEqual(IRPEF.computeIRPEF(60000, disordinato), 18000);
});

// --- Nessun fallback silenzioso: se i dati mancano, si rompe forte ---------
test('configurazione assente o malformata solleva errore', () => {
  assert.throws(() => IRPEF.computeIRPEF(30000, null), /Scaglioni mancanti/);
  assert.throws(() => IRPEF.computeIRPEF(30000, {}), /Scaglioni mancanti/);
  assert.throws(() => IRPEF.computeIRPEF(30000, { scaglioni: [] }), /Scaglioni mancanti/);
  assert.throws(
    () => IRPEF.computeIRPEF(30000, { scaglioni: [{ limite: 28000, aliquota: 'boh' }] }),
    /Aliquota non valida/
  );
  assert.throws(
    () => IRPEF.computeIRPEF(30000, { scaglioni: [{ limite: 28000, aliquota: 0.23 }] }),
    /Manca lo scaglione aperto/
  );
});

test('aliquota media effettiva coerente con l imposta', () => {
  const media = IRPEF.computeAliquotaMedia(60000, conf);
  assert.ok(Math.abs(media - 18000 / 60000) < 1e-9);
  // sempre sotto l aliquota marginale massima
  assert.ok(media < 0.43);
});
