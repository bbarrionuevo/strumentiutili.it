// tests/esenzione-bollo.test.js — Esenzione del bollo auto 2027.
//
// La norma e' l'art. 2 del decreto-legge 17 settembre 2026, n. 162, letto su
// Normattiva. Ogni test richiama il comma da cui viene la regola: se il
// Parlamento cambia il testo in sede di conversione, qui si vede cosa rivedere.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const E = require('../js/esenzione-bollo.js');
const REGOLE = JSON.parse(
  fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8')
).esenzione_bollo_2027;

const auto = (kw, extra) => Object.assign({ tipo: 'auto', kw }, extra);
const moto = (kw, extra) => Object.assign({ tipo: 'moto', kw }, extra);
const ciclo = (anno, extra) => Object.assign({ tipo: 'ciclomotore', kw: null, immatricolazione: anno }, extra);

test('le regole indicano il decreto, la data di vigore e il periodo', () => {
  assert.strictEqual(REGOLE.stato, 'decreto_legge');
  assert.strictEqual(REGOLE.in_vigore, true);
  assert.match(REGOLE.norma, /17 settembre 2026, n\. 162, art\. 2/);
  assert.strictEqual(REGOLE.in_vigore_dal, '2026-09-18');
  assert.deepStrictEqual([REGOLE.periodo.dal, REGOLE.periodo.al], ['2027-01-01', '2027-12-31']);
  assert.match(REGOLE.fonte, /^https:\/\/www\.normattiva\.it\/.*decreto\.legge:2026-09-17;162~art2$/);
});

test('comma 2: auto a benzina o gasolio fino a 80 kW, 80 compresi', () => {
  assert.strictEqual(E.valuta([auto(80)], REGOLE).applicabile, true);
  assert.strictEqual(E.valuta([auto(80.5)], REGOLE).applicabile, false);
  assert.strictEqual(E.valuta([auto(51, { benzina: false })], REGOLE).applicabile, false, 'un’auto elettrica non rientra');
});

test('comma 2: fra piu auto idonee vale quella di potenza minore', () => {
  const r = E.valuta([auto(74), auto(51), auto(110)], REGOLE);
  assert.strictEqual(r.indiceScelto, 1);
  assert.strictEqual(r.candidati, 2);
  assert.match(r.motivo, /potenza minore/);
});

test('comma 2: a parita di potenza si avverte che conta il bollo piu basso', () => {
  const r = E.valuta([auto(51), auto(51)], REGOLE);
  assert.strictEqual(r.applicabile, true);
  assert.ok(r.avvertenze.some((a) => a.tipo === 'parita'));
});

test('comma 3: le moto rientrano solo senza auto fino a 80 kW', () => {
  // con un’auto idonea la moto resta fuori, anche se ha meno kW
  const conAuto = E.valuta([auto(55), moto(10)], REGOLE);
  assert.strictEqual(conAuto.indiceScelto, 0);
  assert.strictEqual(conAuto.esiti[1].esito.si, false);
  // basta un’auto fino a 80 kW di qualsiasi alimentazione, anche elettrica
  const elettrica = E.valuta([auto(60, { benzina: false }), moto(10)], REGOLE);
  assert.strictEqual(elettrica.applicabile, false);
  // con un’auto oltre gli 80 kW la moto rientra
  const grande = E.valuta([auto(120), moto(35)], REGOLE);
  assert.strictEqual(grande.indiceScelto, 1);
});

test('comma 3: fra piu motocicli il meno potente, fra i ciclomotori il piu vecchio', () => {
  assert.strictEqual(E.valuta([moto(35), moto(11)], REGOLE).indiceScelto, 1);
  assert.strictEqual(E.valuta([ciclo(2019), ciclo(2008), ciclo(2015)], REGOLE).indiceScelto, 1);
  assert.strictEqual(E.valuta([moto(11, { benzina: false })], REGOLE).applicabile, false, 'moto elettrica');
});

test('un solo veicolo esente, mai due', () => {
  const r = E.valuta([auto(40), auto(50), auto(60), moto(10)], REGOLE);
  assert.strictEqual(r.esiti.filter((e) => e.indice === r.indiceScelto).length, 1);
});

test('comma 1: le avvertenze dicono decreto-legge, assicurazione e Regioni a statuto speciale', () => {
  const testi = E.avvertenze(REGOLE, [auto(60)], { parita: false, misto: false }).map((a) => a.testo).join(' ');
  assert.match(testi, /in vigore dal 18 settembre 2026/);
  assert.match(testi, /convertirlo in legge entro 60 giorni/);
  assert.match(testi, /regolarmente assicurato/);
  assert.match(testi, /statuto speciale/);
  assert.doesNotMatch(testi, /\d{4}-\d{2}-\d{2}|non e confermato|un auto/);
});

test('ingressi vuoti o assurdi non producono risultati falsi', () => {
  for (const kw of [null, '', 0, -5, 'abc', NaN]) {
    const r = E.valuta([{ tipo: 'auto', kw: kw }], REGOLE);
    assert.strictEqual(r.applicabile, false, 'kW = ' + String(kw) + ' non deve dare esenzione');
  }
  assert.strictEqual(E.valuta([], REGOLE).applicabile, false);
});

test('senza regole la funzione si ferma invece di inventare', () => {
  assert.throws(() => E.valuta([{ tipo: 'auto', kw: 51 }], null), /Regole non caricate/);
});
