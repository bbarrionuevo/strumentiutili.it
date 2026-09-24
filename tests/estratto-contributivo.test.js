// tests/estratto-contributivo.test.js — Analisi dell'estratto conto INPS.
//
// Le due regole che rendono il conteggio diverso da una somma: un anno solare
// vale al massimo 52 settimane anche con piu' gestioni, e i buchi vanno
// individuati sulle date reali. Qui si collaudano entrambe, piu' il fuso
// orario, che su questo tipo di calcolo e' una fonte di errori silenziosi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const E = require('../js/estratto-contributivo.js');
const REGOLE = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'));

// --- conteggio --------------------------------------------------------------

test('52 settimane fanno un anno', () => {
  assert.deepStrictEqual(E.anniESettimane(52), { anni: 1, settimane: 0, totale: 52 });
  assert.deepStrictEqual(E.anniESettimane(104), { anni: 2, settimane: 0, totale: 104 });
  assert.deepStrictEqual(E.anniESettimane(78), { anni: 1, settimane: 26, totale: 78 });
  assert.deepStrictEqual(E.anniESettimane(0), { anni: 0, settimane: 0, totale: 0 });
});

test('un anno solare non vale mai piu di 52 settimane', () => {
  // Due gestioni contemporanee nello stesso anno non raddoppiano l'anzianita.
  const r = E.analizza([
    { dal: '2020-01-01', al: '2020-12-31', settimane: 52, gestione: 'FPLD' },
    { dal: '2020-01-01', al: '2020-12-31', settimane: 52, gestione: 'Separata' }
  ], { pensioni: REGOLE.pensioni });

  assert.strictEqual(r.settimaneGrezze, 104, 'la somma grezza resta visibile');
  assert.strictEqual(r.settimaneTotali, 52, 'ma ai fini pensionistici vale 52');
  assert.strictEqual(r.settimaneEccedenti, 52);
  assert.strictEqual(r.perAnno[0].limitate, true);
});

test('le gestioni restano distinte nel riepilogo', () => {
  const r = E.analizza([
    { dal: '2018-01-01', al: '2019-12-31', settimane: 104, gestione: 'FPLD' },
    { dal: '2020-01-01', al: '2020-12-31', settimane: 52, gestione: 'Separata' }
  ], {});
  assert.deepStrictEqual(r.gestioni, { FPLD: 104, Separata: 52 });
});

// --- il fuso orario ---------------------------------------------------------

test('le date non slittano di un giorno per il fuso orario', () => {
  // new Date('2005-01-01') e UTC: a ovest di Greenwich diventerebbe il 2004.
  const r = E.analizza([{ dal: '2005-01-01', al: '2009-12-31', settimane: 260 }], {});
  assert.strictEqual(r.primoAnno, 2005, 'il primo anno non deve essere il 2004');
  assert.strictEqual(r.ultimoAnno, 2009);
  assert.deepStrictEqual(r.anniIncompleti.map((a) => a.anno), [],
    'anni fantasma con zero settimane: e il sintomo dello slittamento');
});

test('accetta anche il formato anno-mese', () => {
  const r = E.analizza([{ dal: '2015-03', al: '2015-12', settimane: 43 }], {});
  assert.strictEqual(r.primoAnno, 2015);
  assert.strictEqual(r.settimaneTotali, 43);
});

// --- buchi ------------------------------------------------------------------

test('trova il buco fra due periodi e ne misura la durata', () => {
  const r = E.analizza([
    { dal: '2005-01-01', al: '2009-12-31', settimane: 260 },
    { dal: '2012-01-01', al: '2020-12-31', settimane: 469 }
  ], {});

  assert.strictEqual(r.buchi.length, 1);
  assert.strictEqual(r.buchi[0].dal.getFullYear(), 2010);
  assert.strictEqual(r.buchi[0].al.getFullYear(), 2011);
  assert.strictEqual(r.buchi[0].settimaneMancate, 104, 'due anni scoperti');
});

test('periodi contigui o sovrapposti non generano buchi', () => {
  const contigui = E.analizza([
    { dal: '2018-01-01', al: '2018-12-31', settimane: 52 },
    { dal: '2019-01-01', al: '2019-12-31', settimane: 52 }
  ], {});
  assert.deepStrictEqual(contigui.buchi, []);

  const sovrapposti = E.analizza([
    { dal: '2018-01-01', al: '2019-06-30', settimane: 78 },
    { dal: '2019-01-01', al: '2019-12-31', settimane: 52 }
  ], {});
  assert.deepStrictEqual(sovrapposti.buchi, []);
});

test('le interruzioni brevi non vengono segnalate come buchi', () => {
  // Fra un contratto e l'altro qualche giorno e normale: allarmare su quello
  // renderebbe lo strumento inutile.
  const r = E.analizza([
    { dal: '2018-01-01', al: '2018-06-30', settimane: 26 },
    { dal: '2018-07-10', al: '2018-12-31', settimane: 25 }
  ], {});
  assert.deepStrictEqual(r.buchi, []);
});

// --- requisiti --------------------------------------------------------------

test('dice quanto manca alla vecchiaia e all anticipata', () => {
  const r = E.analizza([{ dal: '2006-01-01', al: '2025-12-31', settimane: 520 }],
    { pensioni: REGOLE.pensioni, sesso: 'M' });

  const vecchiaia = r.requisiti.find((q) => /vecchiaia/i.test(q.nome));
  assert.ok(vecchiaia);
  assert.strictEqual(vecchiaia.settimaneNecessarie, 20 * 52, '20 anni di contributi');
  assert.strictEqual(vecchiaia.settimaneMancanti, 20 * 52 - 520);
  assert.strictEqual(vecchiaia.raggiunto, false);
});

test('i requisiti dell anticipata cambiano fra uomini e donne', () => {
  const periodi = [{ dal: '2000-01-01', al: '2025-12-31', settimane: 1352 }];
  const u = E.analizza(periodi, { pensioni: REGOLE.pensioni, sesso: 'M' });
  const d = E.analizza(periodi, { pensioni: REGOLE.pensioni, sesso: 'F' });

  const ant = (r) => r.requisiti.find((q) => /anticipata/i.test(q.nome));
  assert.ok(ant(u).settimaneNecessarie > ant(d).settimaneNecessarie,
    'agli uomini servono piu contributi che alle donne');
});

test('un requisito raggiunto viene dichiarato tale', () => {
  const r = E.analizza([{ dal: '1990-01-01', al: '2025-12-31', settimane: 1872 }],
    { pensioni: REGOLE.pensioni, sesso: 'M' });
  const vecchiaia = r.requisiti.find((q) => /vecchiaia/i.test(q.nome));
  assert.strictEqual(vecchiaia.raggiunto, true);
  assert.strictEqual(vecchiaia.settimaneMancanti, 0);
});

test('senza le regole delle pensioni non inventa requisiti', () => {
  const r = E.analizza([{ dal: '2020-01-01', al: '2020-12-31', settimane: 52 }], {});
  assert.deepStrictEqual(r.requisiti, []);
});

// --- robustezza -------------------------------------------------------------

test('i periodi non validi vengono scartati dicendo perche', () => {
  const r = E.analizza([
    { dal: '2020-01-01', al: '2020-12-31', settimane: 52 },
    { dal: 'non una data', al: '2021-12-31', settimane: 52 },
    { dal: '2022-12-31', al: '2022-01-01', settimane: 52 }
  ], {});

  assert.strictEqual(r.periodi.length, 1);
  assert.strictEqual(r.scartati.length, 2);
  assert.match(r.scartati[0].motivo, /date/);
  assert.match(r.scartati[1].motivo, /precede/);
});

test('senza settimane indicate le ricava dalla durata', () => {
  const r = E.analizza([{ dal: '2020-01-01', al: '2020-12-31' }], {});
  assert.ok(r.settimaneTotali >= 52 - 1 && r.settimaneTotali <= 52,
    'un anno intero deve valere circa 52 settimane, ottenute ' + r.settimaneTotali);
});

test('elenco vuoto o assurdo non produce NaN', () => {
  for (const input of [[], null, undefined]) {
    const r = E.analizza(input, { pensioni: REGOLE.pensioni });
    assert.strictEqual(r.settimaneTotali, 0);
    assert.strictEqual(r.primoAnno, null);
    assert.ok(Array.isArray(r.buchi));
  }
});

test('i periodi vengono ordinati anche se arrivano alla rinfusa', () => {
  const r = E.analizza([
    { dal: '2020-01-01', al: '2020-12-31', settimane: 52 },
    { dal: '2010-01-01', al: '2010-12-31', settimane: 52 }
  ], {});
  assert.strictEqual(r.periodi[0].dal.getFullYear(), 2010);
  assert.strictEqual(r.primoAnno, 2010);
});
