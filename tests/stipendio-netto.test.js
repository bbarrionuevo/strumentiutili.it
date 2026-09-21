// tests/stipendio-netto.test.js — Motore busta paga (dal lordo al netto).
//
// ATTENZIONE alla natura di questi test: gli importi totali sono valori di
// CARATTERIZZAZIONE, congelati dal comportamento attuale del motore. Servono a
// far scattare un allarme se un refactoring cambia i numeri, NON a certificare
// che coincidano con quelli dell Agenzia delle Entrate: quella verifica va
// fatta a mano contro una busta paga reale.
// Le invarianti e la componente IRPEF, invece, sono verificate davvero.
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/irpef.js', 'js/stipendio-netto.js']);
const { calculateSalary } = window.StipendioNetto;
const IRPEF = window.StrumentiIrpef;
const regole = regoleFiscali();

const CASI = [
  { ral: 20000, mensilita: 13, inps: 1838, imponibileIrpef: 18162, irpefLorda: 4177.26, nettoAnnuo: 17207.58 },
  { ral: 30000, mensilita: 13, inps: 2757, imponibileIrpef: 27243, irpefLorda: 6265.89, nettoAnnuo: 23332.16 },
  { ral: 35000, mensilita: 14, inps: 3216.5, imponibileIrpef: 31783.5, irpefLorda: 7688.56, nettoAnnuo: 25937.34 },
  { ral: 50000, mensilita: 13, inps: 4595, imponibileIrpef: 45405, irpefLorda: 12183.65, nettoAnnuo: 32471.53 },
  { ral: 60000, mensilita: 13, inps: 5551.76, imponibileIrpef: 54448.24, irpefLorda: 15612.74, nettoAnnuo: 37457.96 },
  { ral: 100000, mensilita: 13, inps: 9627.76, imponibileIrpef: 90372.24, irpefLorda: 31060.06, nettoAnnuo: 57025.76 },
  { ral: 210000, mensilita: 13, inps: 20836.76, imponibileIrpef: 189163.24, irpefLorda: 73540.19, nettoAnnuo: 110837.22 }
];

for (const caso of CASI) {
  test(`RAL ${caso.ral} su ${caso.mensilita} mensilita`, () => {
    const r = calculateSalary(caso.ral, caso.mensilita, regole, {});
    assert.strictEqual(r.inps, caso.inps, 'contributi INPS');
    assert.strictEqual(r.imponibileIrpef, caso.imponibileIrpef, 'imponibile fiscale');
    assert.strictEqual(r.irpefLorda, caso.irpefLorda, 'IRPEF lorda');
    assert.strictEqual(r.nettoAnnuo, caso.nettoAnnuo, 'netto annuo');
  });
}

test('l IRPEF lorda coincide con il motore condiviso', () => {
  for (const caso of CASI) {
    const r = calculateSalary(caso.ral, caso.mensilita, regole, {});
    assert.strictEqual(
      r.irpefLorda,
      IRPEF.computeIRPEF(r.imponibileIrpef, regole.irpef),
      `RAL ${caso.ral}: la busta paga non usa il motore condiviso`
    );
  }
});

// --- REGRESSIONE del bug corretto -----------------------------------------
// Sopra i 50.000 euro il vecchio codice non entrava mai nel ciclo e cadeva in
// un fallback con 6440 e 13700 scritti a mano: modificare il JSON non aveva
// alcun effetto. Questo test lo verifica proprio dove il bug viveva.
test('sopra l ultimo scaglione la busta paga segue il JSON, non un fallback', () => {
  const ritoccate = JSON.parse(JSON.stringify(regole));
  ritoccate.irpef.scaglioni[2].aliquota = 0.45;

  const base = calculateSalary(60000, 13, regole, {});
  const dopo = calculateSalary(60000, 13, ritoccate, {});

  assert.notStrictEqual(dopo.irpefLorda, base.irpefLorda, 'il cambio di aliquota e stato ignorato');
  assert.ok(dopo.irpefLorda > base.irpefLorda, 'aliquota piu alta deve dare imposta piu alta');
  assert.ok(dopo.nettoAnnuo < base.nettoAnnuo, 'imposta piu alta deve dare netto piu basso');
});

// --- Invarianti: valgono qualunque siano le aliquote ----------------------
// Il netto PUO superare il lordo sui redditi bassi: il trattamento integrativo
// e il bonus cuneo sono erogazioni in denaro che si sommano alla busta paga.
// L invariante vera e che il netto non superi il lordo meno i contributi, piu
// quelle erogazioni.
test('il netto resta dentro i limiti di lordo, contributi ed erogazioni', () => {
  for (let ral = 0; ral <= 250000; ral += 2500) {
    const r = calculateSalary(ral, 13, regole, {});
    const massimoPossibile = ral - r.inps + r.bonusCuneo + r.trattamentoIntegrativo;
    assert.ok(r.nettoAnnuo <= massimoPossibile + 0.01, `netto fuori scala a RAL ${ral}`);
    assert.ok(r.nettoAnnuo >= 0, `netto negativo a RAL ${ral}`);
  }
});

test('le erogazioni e l imposta netta non sono mai negative', () => {
  for (let ral = 0; ral <= 60000; ral += 1000) {
    const r = calculateSalary(ral, 13, regole, {});
    assert.ok(r.bonusCuneo >= 0, `bonus cuneo negativo a RAL ${ral}`);
    assert.ok(r.trattamentoIntegrativo >= 0, `trattamento integrativo negativo a RAL ${ral}`);
    assert.ok(r.irpefNetta >= 0, `IRPEF netta negativa a RAL ${ral}`);
  }
});

test('il netto cresce al crescere del lordo', () => {
  let precedente = -1;
  for (let ral = 0; ral <= 250000; ral += 2500) {
    const netto = calculateSalary(ral, 13, regole, {}).nettoAnnuo;
    assert.ok(netto >= precedente, `il netto cala a RAL ${ral}: ${netto} < ${precedente}`);
    precedente = netto;
  }
});

test('netto mensile coerente con il numero di mensilita', () => {
  for (const mensilita of [12, 13, 14]) {
    const r = calculateSalary(35000, mensilita, regole, {});
    assert.ok(Math.abs(r.nettoMensile - r.nettoAnnuo / mensilita) < 0.01);
  }
});

test('ingressi non numerici non producono NaN', () => {
  for (const sporco of [null, undefined, '', 'abc', NaN, -1]) {
    const r = calculateSalary(sporco, 13, regole, {});
    for (const [chiave, valore] of Object.entries(r)) {
      if (typeof valore === 'number') {
        assert.ok(Number.isFinite(valore), `${chiave} = ${valore} con ingresso ${String(sporco)}`);
      }
    }
  }
});

test('meno giorni lavorati non aumentano il netto', () => {
  const pieno = calculateSalary(30000, 13, regole, { workedDays: 365 });
  const meta = calculateSalary(30000, 13, regole, { workedDays: 180 });
  assert.ok(meta.nettoAnnuo <= pieno.nettoAnnuo);
});
