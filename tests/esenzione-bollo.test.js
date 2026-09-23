// tests/esenzione-bollo.test.js — Esenzione del bollo auto 2027.
//
// La norma e' stata annunciata il 16 settembre 2026 e non e' ancora legge.
// Questi test fissano le due cose che le fonti confermano davvero (limite di
// 80 kW per le auto, un solo veicolo a persona scelto per potenza minore) e
// verificano che il resto continui a essere presentato come incerto.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const E = require('../js/esenzione-bollo.js');
const REGOLE = JSON.parse(
  fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8')
).esenzione_bollo_2027;

test('le regole esistono e dichiarano di non essere ancora legge', () => {
  assert.ok(REGOLE, 'manca il nodo esenzione_bollo_2027');
  assert.strictEqual(REGOLE.in_vigore, false,
    'finche la misura non e approvata questo deve restare false');
  assert.strictEqual(REGOLE.stato, 'annunciata');
  assert.match(REGOLE.data_annuncio, /^\d{4}-\d{2}-\d{2}$/);
});

test('un auto entro gli 80 kW rientra, una sopra no', () => {
  assert.strictEqual(E.valuta([{ tipo: 'auto', kw: 51 }], REGOLE).applicabile, true);
  assert.strictEqual(E.valuta([{ tipo: 'auto', kw: 80 }], REGOLE).applicabile, true, '80 kW e il limite, incluso');
  assert.strictEqual(E.valuta([{ tipo: 'auto', kw: 81 }], REGOLE).applicabile, false);
  assert.strictEqual(E.valuta([{ tipo: 'auto', kw: 110 }], REGOLE).applicabile, false);
});

test('con piu auto agevolabili l esenzione va a quella di potenza minore', () => {
  const r = E.valuta([
    { tipo: 'auto', kw: 77 },
    { tipo: 'auto', kw: 51 },
    { tipo: 'auto', kw: 66 }
  ], REGOLE);
  assert.strictEqual(r.applicabile, true);
  assert.strictEqual(r.veicoloScelto.kw, 51);
  assert.strictEqual(r.candidati, 3, 'i candidati vanno contati tutti');
  assert.strictEqual(r.indiceScelto, 1);
});

test('un solo veicolo esente, mai due', () => {
  for (const quanti of [2, 3, 5]) {
    const veicoli = [];
    for (let i = 0; i < quanti; i++) veicoli.push({ tipo: 'auto', kw: 50 + i });
    const r = E.valuta(veicoli, REGOLE);
    assert.strictEqual(r.indiceScelto !== null, true);
    assert.strictEqual(typeof r.veicoloScelto, 'object');
  }
  assert.strictEqual(REGOLE.veicoli_per_persona, 1);
});

test('il superbollo resta dovuto', () => {
  // E l equivoco piu facile: l esenzione riguarda la tassa regionale, non
  // l addizionale erariale oltre i 185 kW.
  assert.strictEqual(REGOLE.superbollo_incluso, false);
  assert.strictEqual(E.valuta([{ tipo: 'auto', kw: 51 }], REGOLE).superbolloResta, true);
});

test('la misura copre solo le scadenze del 2027', () => {
  assert.strictEqual(REGOLE.periodo.dal, '2027-01-01');
  assert.strictEqual(REGOLE.periodo.al, '2027-12-31');
});

test('ogni risultato avverte che la norma non e definitiva', () => {
  const r = E.valuta([{ tipo: 'auto', kw: 51 }], REGOLE);
  const norma = r.avvertenze.filter((a) => a.tipo === 'norma');
  assert.strictEqual(norma.length, 1, 'manca l avvertenza sullo stato della norma');
  assert.match(norma[0].testo, /non e ancora legge|simulazione/);
});

test('le regole controverse restano segnalate come tali', () => {
  // Le fonti non concordano sui motocicli: finche e cosi, chi indica una moto
  // deve vedere l avvertenza. Se un giorno il punto si chiarisce, si cambia
  // "certezza" nel JSON e questo test lo ricorda.
  assert.strictEqual(REGOLE.moto.certezza, 'controversa');
  const r = E.valuta([{ tipo: 'moto', kw: 35 }], REGOLE);
  assert.ok(r.avvertenze.some((a) => a.tipo === 'moto'),
    'con una moto indicata deve comparire l avvertenza sui motocicli');
});

test('ingressi vuoti o assurdi non producono risultati falsi', () => {
  assert.strictEqual(E.valuta([], REGOLE).applicabile, false);
  assert.strictEqual(E.valuta(null, REGOLE).applicabile, false);
  for (const kw of [0, -5, NaN, null, undefined, 'abc']) {
    const r = E.valuta([{ tipo: 'auto', kw: kw }], REGOLE);
    assert.strictEqual(r.applicabile, false, 'kW = ' + String(kw) + ' non deve dare esenzione');
  }
});

test('senza regole la funzione si ferma invece di inventare', () => {
  assert.throws(() => E.valuta([{ tipo: 'auto', kw: 51 }], null), /Regole non caricate/);
});
