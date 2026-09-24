// tests/santi.test.js — Santi del giorno e onomastici: dalla risposta di
// Wikidata ai dati del sito, e la consultazione nel browser.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const G = require('../scripts/genera-santi.js');
const S = require('../js/santi.js');
const { risposta } = require('./fixtures/santi-sparql.js');

const R = G.trasforma(risposta().results.bindings, '2026-09-25');
const dati = R.dati;

test('giorno della festa dall etichetta inglese di Wikidata', () => {
  assert.strictEqual(G.giornoDaEtichetta('October 4'), '10-04');
  assert.strictEqual(G.giornoDaEtichetta('4 October'), '10-04');
  assert.strictEqual(G.giornoDaEtichetta('February 29'), '02-29');
  assert.strictEqual(G.giornoDaEtichetta('February 30'), null);
  assert.strictEqual(G.giornoDaEtichetta('Pentecost'), null);
});

test('il titolo davanti al nome, come si dice in italiano', () => {
  assert.strictEqual(G.nomeConTitolo('Francesco d\'Assisi', false, false), 'San Francesco d’Assisi');
  assert.strictEqual(G.nomeConTitolo('Stefano', false, false), 'Santo Stefano');
  assert.strictEqual(G.nomeConTitolo('Zeno', false, false), 'San Zeno');
  assert.strictEqual(G.nomeConTitolo('Antonio abate', false, false), 'Sant’Antonio abate');
  assert.strictEqual(G.nomeConTitolo('Agata', true, false), 'Sant’Agata');
  assert.strictEqual(G.nomeConTitolo('Rita da Cascia', true, false), 'Santa Rita da Cascia');
  assert.strictEqual(G.nomeConTitolo('Pier Giorgio Frassati', false, true), 'Beato Pier Giorgio Frassati');
  assert.strictEqual(G.nomeConTitolo('San Gennaro', false, false), 'San Gennaro');
  assert.strictEqual(G.nomeConTitolo('Sant\'Ambrogio', false, false), 'Sant’Ambrogio');
  assert.strictEqual(G.nomeConTitolo('Pietro (apostolo)', false, false), 'San Pietro');
  assert.strictEqual(G.nomeProprio('Santa Rita da Cascia'), 'Rita');
  assert.strictEqual(G.nomeProprio('Sant’Agata di Catania'), 'Agata');
  assert.strictEqual(G.nomeProprio('San Giovanni XXIII'), 'Giovanni');
});

test('ordine del giorno: santi prima dei beati, voce italiana prima dei piu citati', () => {
  const ottobre = dati.giorni['10-04'].map((s) => s[0]);
  assert.strictEqual(ottobre[0], 'San Francesco d’Assisi');
  assert.ok(ottobre.indexOf('Beato Famosissimo') > ottobre.indexOf('San Petronio di Bologna'), 'il beato va dopo i santi');
  assert.ok(ottobre.indexOf('San Petronio di Bologna') > 0, 'senza voce italiana dopo chi ce l ha');
  assert.strictEqual(dati.giorni['10-04'].filter((s) => s[1] === 'Q676555').length, 1, 'righe doppie fuse');
  assert.strictEqual(dati.giorni['02-05'][0][0], 'Sant’Agata di Catania');
  assert.strictEqual(dati.giorni['12-26'][0][0], 'Santo Stefano protomartire');
  assert.ok(!JSON.stringify(dati).includes('Q345'), 'Maria non e un santo del giorno');
  assert.ok(!JSON.stringify(dati).includes('Mario Rossi'), 'serve lo stato di santo o beato');
  for (const g of Object.values(dati.giorni)) assert.ok(g.length <= 6);
  assert.deepStrictEqual(S.problemi(dati), []);
});

test('onomastici: il santo piu noto, e le eccezioni della tradizione italiana', () => {
  assert.deepStrictEqual(dati.onomastici.giulia, ['Giulia', '05-22']);
  assert.deepStrictEqual(dati.onomastici.rita, ['Rita', '05-22', 'Santa Rita da Cascia']);
  assert.deepStrictEqual(dati.onomastici.nicola, ['Nicola', '12-06', 'San Nicola']);
  assert.deepStrictEqual(dati.onomastici.giuseppe, ['Giuseppe', '03-19', 'San Giuseppe']);
  assert.deepStrictEqual(dati.onomastici.maria, ['Maria', '09-12', 'Santissimo Nome di Maria']);
  assert.ok(R.eccezioni.some((e) => e.startsWith('Maria: assente -> 09-12')));
  // ogni eccezione e' una data vera e ha il suo perche'
  for (const [k, e] of Object.entries(G.ECCEZIONI)) {
    assert.strictEqual(k, S.normalizza(e[0]));
    assert.ok(/^\d{2}-\d{2}$/.test(e[1]) && dati.giorni[e[1]], k);
    assert.ok(e[2] && e[3], k + ': santo e motivo');
  }
});

test('consultazione: giorno, onomastico senza accenti, suggerimenti', () => {
  const A = S.crea(dati);
  const oggi = A.delGiorno('2026-10-04');
  assert.strictEqual(oggi[0].nome, 'San Francesco d’Assisi');
  assert.strictEqual(oggi[0].wikipedia, 'https://it.wikipedia.org/wiki/Francesco_d\'Assisi');
  assert.deepStrictEqual(A.delGiorno('13-40'), []);
  const f = A.onomastico('  FRANCÈSCO ');
  assert.deepStrictEqual([f.nome, f.data, f.santo.nome], ['Francesco', '10-04', 'San Francesco d’Assisi']);
  assert.ok(f.santo.wikipedia, 'il santo fissato a mano si ritrova nella lista con il suo link');
  assert.strictEqual(A.onomastico('Maria').santo.nome, 'Santissimo Nome di Maria');
  assert.strictEqual(A.onomastico('Giulia Maria').nome, 'Giulia', 'conta il primo nome');
  assert.strictEqual(A.onomastico('Xyzzy'), null);
  assert.ok(A.onomasticiDelGiorno('05-22').includes('Giulia') && A.onomasticiDelGiorno('05-22').includes('Rita'));
  assert.ok(A.suggerimenti('giu').includes('Giulia') && A.suggerimenti('giu').includes('Giuseppe'));
  assert.deepStrictEqual(A.suggerimenti(''), []);
  assert.strictEqual(S.normalizza('Niccolò'), 'niccolo');
  assert.strictEqual(S.normalizza("D'Angelo"), 'dangelo');
});

test('serializzazione: un giorno per riga, stessi dati', () => {
  const testo = G.serializza(dati);
  assert.deepStrictEqual(JSON.parse(testo), dati);
  assert.strictEqual(testo.split('\n').filter((r) => /^ {4}"\d{2}-\d{2}": /.test(r)).length, 366);
});

test('i controlli trovano i buchi', () => {
  const rotto = JSON.parse(JSON.stringify(dati));
  rotto.giorni['02-29'] = [];
  rotto.onomastici.Giulia = ['Giulia', '05-22'];
  const p = S.problemi(rotto);
  assert.ok(p.includes('02-29: nessun santo'));
  assert.ok(p.includes('chiave non normalizzata: Giulia'));
  assert.deepStrictEqual(S.problemi(null), ['formato non valido']);
});

// Quando i dati veri ci sono, devono passare gli stessi controlli e i santi
// piu' noti devono essere al loro posto.
const VERI = path.join(__dirname, '..', 'data', 'santi.json');
test('i dati veri (se presenti): completi e con i santi noti al loro giorno', { skip: !fs.existsSync(VERI) }, () => {
  const veri = JSON.parse(fs.readFileSync(VERI, 'utf8'));
  assert.deepStrictEqual(S.problemi(veri), []);
  const A = S.crea(veri);
  const attesi = { '01-17': 'Antonio', '02-03': 'Biagio', '03-19': 'Giuseppe', '04-25': 'Marco', '06-13': 'Antonio', '06-24': 'Giovanni',
    '07-22': 'Maria Maddalena', '08-10': 'Lorenzo', '10-04': 'Francesco', '11-11': 'Martino', '12-13': 'Lucia', '12-26': 'Stefano' };
  for (const [g, nome] of Object.entries(attesi)) {
    const nomi = A.delGiorno(g).map((s) => s.nome);
    assert.ok(nomi.some((n) => n.includes(nome)), g + ': ' + nomi.join(', '));
  }
  assert.strictEqual(A.onomastico('Giuseppe').data, '03-19');
});
