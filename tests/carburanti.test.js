// tests/carburanti.test.js — Prezzi dei carburanti dagli open data del MIMIT.
//
// Le righe di esempio hanno la forma dei file veri (estrazione del 26
// settembre 2026, separatore "|"), comprese le stranezze trovate li': una
// tabulazione dentro il nome, un "|" in piu', coordinate a zero, carburanti
// "speciali" con nomi di marca, prezzi comunicati mesi prima.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../scripts/carburanti/elabora.js');

const RADICE = path.resolve(__dirname, '..');

const ANAGRAFICA = `Estrazione del 2026-09-26
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649 - C.DA SAN MICHELE S.N.C |AGRIGENTO|AG|37.333935|13.595533
63381|ENIMOOV S.P.A.|Agip Eni|Stradale|19834\tMONTALLEGRO|SS.115 KM.158+302 S.N. |AGRIGENTO|AG|37.38895|13.351206
49195|EOS SERVICES S.R.L.|Q8|Stradale|AG|021 doppio|VIA PETRARCA S.N. 92100|AGRIGENTO|AG|37.29823|13.58979
70001|AUTOSTRADE SPA|IP|Autostradale|AREA DI SERVIZIO|A1 KM 10|MILANO|MI|45.4|9.1
70002|ROSSI SRL|Pompe Bianche|Stradale|ROSSI|VIA ROMA 1|MILANO|MI|0|0
riga rotta
`;

const PREZZI = `Estrazione del 2026-09-26
idImpianto|descCarburante|prezzo|isSelf|dtComu
59183|Benzina|2.309|1|24/09/2026 19:30:06
59183|Benzina|2.669|0|24/09/2026 19:30:07
59183|Gasolio|2.469|1|24/09/2026 19:30:07
59183|Blue Diesel|2.599|1|24/09/2026 19:30:07
59183|GPL|0.849|0|24/09/2026 19:30:09
63381|Benzina|2.199|1|25/09/2026 08:00:00
63381|Benzina|2.249|1|20/09/2026 08:00:00
63381|Metano|1.794|0|26/09/2026 07:00:00
49195|Benzina|0.009|1|25/09/2026 08:00:00
49195|Gasolio|2.100|1|01/03/2025 08:00:00
70001|Benzina|2.599|1|26/09/2026 07:00:00
70002|Benzina|2.150|1|26/09/2026 07:00:00
99999|Benzina|2.000|1|26/09/2026 07:00:00
`;

const PROVINCE = { AG: { nome: 'Agrigento', regione: 'Sicilia' }, MI: { nome: 'Milano', regione: 'Lombardia' } };

test('anagrafica: nomi con tabulazioni o "|" in piu\', coordinate sbagliate, righe rotte', () => {
  const a = E.leggiAnagrafica(ANAGRAFICA);
  assert.strictEqual(a.estrazione, '2026-09-26');
  assert.strictEqual(a.impianti.size, 5);
  assert.strictEqual(a.scartate, 1);
  assert.strictEqual(a.impianti.get('63381').nome, '19834 MONTALLEGRO');
  const doppio = a.impianti.get('49195');
  assert.strictEqual(doppio.nome, 'AG|021 doppio');
  assert.strictEqual(doppio.comune, 'AGRIGENTO');
  assert.strictEqual(doppio.prov, 'AG');
  assert.strictEqual(a.impianti.get('70001').autostrada, true);
  assert.deepStrictEqual([a.impianti.get('70002').lat, a.impianti.get('70002').lon], [null, null]);
  assert.throws(() => E.leggiAnagrafica('idImpianto|Gestore\n1|x'), /Estrazione del/);
});

test('prezzi: solo i carburanti standard, recenti e plausibili; vince la comunicazione piu\' recente', () => {
  const p = E.leggiPrezzi(PREZZI);
  assert.strictEqual(p.conta.speciali, 1);
  assert.strictEqual(p.conta.fuori, 1); // 0,009 euro
  assert.strictEqual(p.conta.vecchie, 1); // marzo 2025
  assert.strictEqual(p.prezzi.get('63381').benzina.self.p, 2.199); // il 25/09 batte il 20/09
  assert.strictEqual(p.prezzi.get('59183').gpl.servito.p, 0.849);
  assert.strictEqual(p.prezzi.get('49195'), undefined);
  assert.strictEqual(E.dataComunicazione('24/09/2026 19:30:06'), '2026-09-24');
});

test('dati per il sito: medie senza autostrade, prezzi in millesimi, impianti per provincia', () => {
  const d = E.componi(E.leggiAnagrafica(ANAGRAFICA), E.leggiPrezzi(PREZZI), PROVINCE);
  // benzina self stradale: 2,309 (59183), 2,199 (63381), 2,150 (70002); 2,599 e' autostradale
  assert.deepStrictEqual(d.riepilogo.italia.benzina.self, { media: 2.219, mediana: 2.199, min: 2.15, max: 2.309, n: 3 });
  assert.strictEqual(d.riepilogo.province.MI.carburanti.benzina.self.n, 1);
  assert.strictEqual(d.riepilogo.province.AG.nome, 'Agrigento');
  assert.strictEqual(d.riepilogo.regioni.Sicilia.benzina.self.n, 2);
  assert.deepStrictEqual(d.prezzi.AG['59183'], [2309, 2669, 2469, null, null, 849, null, null]);
  assert.deepStrictEqual(d.prezzi.AG['63381'], [2199, null, null, null, null, null, null, 1794]);
  // l'impianto autostradale c'e' nelle liste, con il suo segno
  const auto = d.impianti.MI.find((x) => x[0] === 70001);
  assert.strictEqual(auto[7], 1);
  // un prezzo senza impianto in anagrafica non finisce da nessuna parte
  assert.ok(!Object.values(d.prezzi).some((p) => p['99999']));
  // il centro della provincia ignora le coordinate a zero
  assert.deepStrictEqual(d.riepilogo.province.MI.centro, [45.4, 9.1]);
});

test('serie storica: un punto al giorno, lo stesso giorno si sostituisce, GPL e metano col servito', () => {
  const d = E.componi(E.leggiAnagrafica(ANAGRAFICA), E.leggiPrezzi(PREZZI), PROVINCE);
  let s = E.aggiornaStorico({ serie: [{ d: '2026-09-25', benzina: 2.3 }] }, d.riepilogo);
  s = E.aggiornaStorico(s, d.riepilogo);
  assert.deepStrictEqual(s.serie.map((x) => x.d), ['2026-09-25', '2026-09-26']);
  assert.strictEqual(s.serie[1].benzina, 2.219);
  assert.strictEqual(s.serie[1].gpl, 0.849);
  const lunga = { serie: Array.from({ length: 500 }, (_, i) => ({ d: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}x${i}` })) };
  assert.strictEqual(E.aggiornaStorico(lunga, d.riepilogo, 400).serie.length, 400);
});

test('controlli prima di pubblicare: file troncati o vecchi non passano', () => {
  const a = E.leggiAnagrafica(ANAGRAFICA);
  const p = E.leggiPrezzi(PREZZI);
  const guai = E.problemi(a, p, E.componi(a, p, PROVINCE), '2026-10-05');
  assert.ok(guai.some((g) => /impianti/.test(g)));
  assert.ok(guai.some((g) => /prezzi validi/.test(g)));
  assert.ok(guai.some((g) => /vecchia/.test(g)));
});

// I dati pubblicati (scritti ogni giorno dal workflow): coerenti fra loro.
const CARTELLA = path.join(RADICE, 'data', 'vivi', 'carburanti');
test('dati pubblicati: riepilogo, impianti e prezzi coerenti', { skip: !fs.existsSync(path.join(CARTELLA, 'riepilogo.json')) && 'dati non ancora scaricati' }, () => {
  const r = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'riepilogo.json'), 'utf8'));
  assert.match(r.estrazione, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Object.keys(r.province).length >= 100);
  for (const [sigla, info] of Object.entries(r.province)) {
    const imp = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'impianti', sigla + '.json'), 'utf8'));
    const pr = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'prezzi', sigla + '.json'), 'utf8'));
    assert.strictEqual(pr.estrazione, r.estrazione, sigla);
    assert.strictEqual(imp.length, info.impianti, sigla);
    const ids = new Set(imp.map((x) => String(x[0])));
    for (const [id, riga] of Object.entries(pr.p)) {
      assert.ok(ids.has(id), `${sigla}: prezzo senza impianto ${id}`);
      assert.strictEqual(riga.length, 8);
    }
  }
  const s = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'storico.json'), 'utf8'));
  assert.ok(s.serie.length >= 1 && s.serie[s.serie.length - 1].d === r.estrazione);
});
