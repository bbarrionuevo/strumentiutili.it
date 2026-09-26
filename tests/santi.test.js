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
  // il santo principale del giorno, dal Calendario romano generale
  const primi = { '01-17': 'Sant’Antonio abate', '01-20': 'San Sebastiano', '01-21': 'Sant’Agnese', '01-31': 'San Giovanni Bosco',
    '02-03': 'San Biagio', '02-05': 'Sant’Agata', '02-14': 'San Valentino', '03-19': 'San Giuseppe', '04-23': 'San Giorgio',
    '04-25': 'San Marco evangelista', '04-29': 'Santa Caterina da Siena', '05-22': 'Santa Rita da Cascia', '06-13': 'Sant’Antonio di Padova',
    '06-24': 'Natività di San Giovanni Battista', '06-29': 'Santi Pietro e Paolo', '07-22': 'Santa Maria Maddalena', '07-26': 'Santi Gioacchino e Anna',
    '08-08': 'San Domenico', '08-10': 'San Lorenzo', '08-11': 'Santa Chiara d’Assisi', '08-15': 'Assunzione di Maria', '08-16': 'San Rocco',
    '09-19': 'San Gennaro', '09-23': 'San Pio da Pietrelcina', '09-29': 'Santi Michele, Gabriele e Raffaele', '10-04': 'San Francesco d’Assisi',
    '11-01': 'Tutti i Santi', '11-11': 'San Martino di Tours', '11-22': 'Santa Cecilia', '12-04': 'Santa Barbara', '12-06': 'San Nicola',
    '12-07': 'Sant’Ambrogio', '12-13': 'Santa Lucia', '12-25': 'Natale del Signore', '12-26': 'Santo Stefano', '12-31': 'San Silvestro' };
  for (const [g, nome] of Object.entries(primi)) assert.strictEqual(A.delGiorno(g)[0].nome, nome, g);
  // i santi del calendario non ricompaiono in altri giorni con date vecchie
  assert.ok(!A.delGiorno('08-15').some((s) => /Domenico di Guzm/.test(s.nome)), '15 agosto');
  const onomastici = { Giuseppe: '03-19', Giovanni: '06-24', Luigi: '06-21', Giorgio: '04-23', Pio: '09-23', Gregorio: '09-03', Rocco: '08-16',
    Valentino: '02-14', Sebastiano: '01-20', Bartolomeo: '08-24', Simone: '10-28', Marta: '07-29', Mattia: '05-14', Domenico: '08-08',
    Francesca: '03-09', Agostino: '08-28', Anna: '07-26', Carlo: '11-04', Teresa: '10-15', Barbara: '12-04' };
  for (const [nome, g] of Object.entries(onomastici)) assert.strictEqual(A.onomastico(nome).data, g, nome);
  // nomi puliti: niente etichette inglesi o titoli doppi
  const tutti = Object.values(veri.giorni).flat().map((s) => s[0]);
  assert.ok(!tutti.some((n) => /(^|\s)(Saint|St\.)\s|^(San|Santa) (san|santa|papa) /i.test(n)), 'nomi sporchi');
});

test('fusione con il calendario: prima il calendario, niente doppioni, ripetibile', () => {
  const cal = {
    giorni: { '10-04': ['San Francesco d’Assisi'], '02-05': ['Sant’Agata'], '05-22': ['Santa Rita da Cascia'] },
    gradi: { '10-04': 'festa', '02-05': 'memoria' },
    popolari: { '10-04': ['San Petronio', 'dopo', 'patrono di Bologna'], '02-14': ['San Valentino', 'prima', 'patrono degli innamorati'] }
  };
  const f = G.unisciCalendario(dati, cal);
  const ottobre = f.giorni['10-04'];
  assert.strictEqual(ottobre[0][0], 'San Francesco d’Assisi');
  assert.ok(ottobre[0][1], 'il santo del calendario prende il codice di Wikidata');
  assert.strictEqual(ottobre[1][0], 'San Petronio', 'il santo popolare "dopo" segue il calendario');
  assert.strictEqual(ottobre.filter((s) => /Francesco/.test(s[0])).length, 1, 'niente doppioni');
  assert.strictEqual(ottobre.filter((s) => /Petronio/.test(s[0])).length, 1);
  assert.strictEqual(f.giorni['02-05'][0][0], 'Sant’Agata', 'il nome del calendario, con il link di Wikidata');
  assert.strictEqual(f.giorni['02-14'][0][0], 'San Valentino');
  assert.deepStrictEqual(S.problemi(f), []);
  assert.deepStrictEqual(G.unisciCalendario(f, cal), f, 'rifondere non cambia nulla');
  assert.deepStrictEqual(f.onomastici.petronio, ['Petronio', '10-04', 'San Petronio']);
  assert.deepStrictEqual(f.onomastici.giuseppe, ['Giuseppe', '03-19', 'San Giuseppe'], 'le eccezioni vincono');
  assert.ok(G.stessoSanto('San Giacomo apostolo', 'San Giacomo il Maggiore'));
  assert.ok(G.stessoSanto('Santo Stefano d’Ungheria', 'Santo Stefano I d’Ungheria'));
  assert.ok(G.stessoSanto('Natività di San Giovanni Battista', 'San Giovanni Battista'));
  assert.ok(!G.stessoSanto('San Pietro Canisio', 'San Pietro Claver'));
  assert.deepStrictEqual(G.nomiDi('Santi Gioacchino e Anna'), ['Gioacchino', 'Anna']);
  assert.deepStrictEqual(G.nomiDi('Santi Marta, Maria e Lazzaro'), ['Marta', 'Maria', 'Lazzaro']);
  assert.deepStrictEqual(G.nomiDi('Santi Innocenti'), []);
  assert.deepStrictEqual(G.nomiDi('Assunzione di Maria'), []);
});

test('etichette sporche di Wikidata', () => {
  assert.strictEqual(G.nomeConTitolo('Saint Derien', false, false), null);
  assert.strictEqual(G.nomeConTitolo('santa Barbara', true, false), 'Santa Barbara');
  assert.strictEqual(G.nomeConTitolo('papa Fabiano', false, false), 'San Fabiano');
  assert.strictEqual(G.pulisciNome('Santa santa Barbara'), 'Santa Barbara');
  assert.strictEqual(G.pulisciNome('San papa Fabiano'), 'San Fabiano');
  assert.strictEqual(G.pulisciNome('San Saint Amun'), null);
  assert.strictEqual(G.pulisciNome('San Francesco d’Assisi'), 'San Francesco d’Assisi');
});

test('il calendario rivisto: giorni validi, nomi scritti bene, santi popolari con il motivo', () => {
  const cal = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'santi-calendario.json'), 'utf8'));
  const giorni = new Set(S.giorniDellAnno());
  assert.ok(Object.keys(cal.giorni).length >= 190);
  for (const [g, nomi] of Object.entries(cal.giorni)) {
    assert.ok(giorni.has(g), g);
    for (const n of nomi) {
      assert.ok(n && n === n.trim() && !/\s{2}|\s,|’\s(?![A-Z])|'/.test(n), g + ': ' + n);
      assert.ok(!/\s[-–]\s|Memoria|Solennità/.test(n), g + ': qualifica rimasta in ' + n);
    }
  }
  for (const [g, grado] of Object.entries(cal.gradi)) assert.ok(cal.giorni[g] && ['solennità', 'festa', 'memoria'].includes(grado), g);
  for (const [g, p] of Object.entries(cal.popolari)) {
    assert.ok(giorni.has(g) && /^(San|Santa|Santo|Sant’)/.test(p[0]) && ['prima', 'dopo'].includes(p[1]) && p[2].length > 10, g);
  }
});
